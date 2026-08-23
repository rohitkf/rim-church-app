import { type FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { formatRelativeTime } from '../lib/relativeTime'
import type { MessageRow } from '../lib/types'

async function fetchMessages(): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*, author:profiles!messages_author_id_fkey(id, first_name, last_name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as unknown as MessageRow[]
}

export function MessageBoardPage() {
  const { session, isAdmin, hasRole } = useAuth()
  const queryClient = useQueryClient()
  const canPost = isAdmin || hasRole('department_head') || hasRole('service_flow_coordinator')

  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const messagesQuery = useQuery({ queryKey: ['messages'], queryFn: fetchMessages })

  const postMessage = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('messages').insert({ author_id: session!.user.id, body: body.trim() })
      if (error) throw error
    },
    onSuccess: () => {
      setBody('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['messages'] })
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : 'Could not post message.'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    postMessage.mutate()
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-headline-xl">Message Board</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Visible to everyone signed in. Only Admins, Department Heads, and Service Flow
        Coordinators can post.
      </p>

      {canPost && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-border-subtle bg-surface-lowest p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Post an announcement…"
            rows={3}
            className="w-full rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            {error && <p className="text-body-sm text-error">{error}</p>}
            <button
              type="submit"
              disabled={postMessage.isPending}
              className="ml-auto rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
            >
              {postMessage.isPending ? 'Posting…' : 'Post'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-6">
        <QueryState
          isLoading={messagesQuery.isLoading}
          error={messagesQuery.error}
          isEmpty={messagesQuery.data?.length === 0}
          emptyMessage="No messages yet."
        >
          <ul className="flex flex-col gap-4">
            {messagesQuery.data?.map((m) => (
              <li key={m.id} className="rounded-lg border border-border-subtle bg-surface-lowest p-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-on-surface">
                    {m.author ? `${m.author.first_name} ${m.author.last_name}` : 'Unknown'}
                  </span>
                  <span className="font-mono text-label-sm text-on-surface-variant">
                    {formatRelativeTime(m.created_at)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-body-md text-on-surface">{m.body}</p>
              </li>
            ))}
          </ul>
        </QueryState>
      </div>
    </div>
  )
}
