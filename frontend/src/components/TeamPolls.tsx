import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { QueryState } from './QueryState'
import { Eyebrow } from './Surface'
import { optionShare, pollIsOpen, tallyVotes, timeLeft, type ChoiceMode } from '../lib/polls'

const pollSchema = z.object({
  id: z.string(),
  department_id: z.string(),
  created_by: z.string(),
  question: z.string(),
  choice_mode: z.enum(['single', 'multiple']),
  closes_at: z.string().nullable(),
  created_at: z.string(),
  options: z.array(z.object({ id: z.string(), label: z.string(), sort_order: z.number() })),
  votes: z.array(z.object({ option_id: z.string(), user_id: z.string() })),
})
type Poll = z.infer<typeof pollSchema>

async function fetchPolls(departmentId: string): Promise<Poll[]> {
  const { data, error } = await supabase
    .from('team_polls')
    .select(
      'id, department_id, created_by, question, choice_mode, closes_at, created_at, options:team_poll_options(id, label, sort_order), votes:team_poll_votes(option_id, user_id)',
    )
    .eq('department_id', departmentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return z.array(pollSchema).parse(data)
}

/** A ticking clock, so a deadline visibly runs down rather than just being a date. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

/**
 * Polls on a team's board.
 *
 * Asking is a leadership act, like an alert; answering belongs to everyone
 * in the room. A poll can take one answer or several, and can carry a
 * deadline — after which the page stops offering the buttons and the
 * database stops accepting the writes, which are two different promises
 * and both are needed.
 */
export function TeamPolls({ departmentId }: { departmentId: string | null }) {
  const { session, isAdmin, ledDepartmentIds } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const myId = session?.user.id ?? null
  const canAsk = isAdmin || (!!departmentId && ledDepartmentIds.includes(departmentId))

  const [composing, setComposing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pollsQuery = useQuery({
    queryKey: ['team-polls', departmentId],
    queryFn: () => fetchPolls(departmentId!),
    enabled: !!departmentId,
  })
  const polls = useMemo(() => pollsQuery.data ?? [], [pollsQuery.data])

  // Only tick while something is actually counting down.
  const anyDeadline = polls.some((p) => p.closes_at)
  const now = useNow(anyDeadline)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['team-polls', departmentId] })

  const vote = useMutation({
    mutationFn: async ({ poll, optionId, on }: { poll: Poll; optionId: string; on: boolean }) => {
      if (on) {
        // The single-choice rule lives in a database trigger, so picking a
        // different option here is one insert, not a delete and an insert
        // that could fail between the two.
        const { error: e } = await supabase
          .from('team_poll_votes')
          .insert({ poll_id: poll.id, option_id: optionId, user_id: myId! })
        if (e) throw e
      } else {
        const { error: e } = await supabase
          .from('team_poll_votes')
          .delete()
          .eq('option_id', optionId)
          .eq('user_id', myId!)
        if (e) throw e
      }
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not record that answer.')),
  })

  const removePoll = useMutation({
    mutationFn: async (id: string) => {
      const { error: e } = await supabase.from('team_polls').delete().eq('id', id)
      if (e) throw e
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not delete that poll.')),
  })

  if (!departmentId) return null

  return (
    <section className="rounded-[var(--radius-tile)] bg-surface-lowest hairline p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow>Polls</Eyebrow>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Ask the team something and count the answers.
          </p>
        </div>
        {canAsk && !composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="tap rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:opacity-90"
          >
            New poll
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      {composing && canAsk && (
        <PollComposer
          departmentId={departmentId}
          onDone={() => {
            setComposing(false)
            invalidate()
          }}
          onCancel={() => setComposing(false)}
          onError={setError}
        />
      )}

      <QueryState
        isLoading={pollsQuery.isLoading}
        error={pollsQuery.error}
        isEmpty={polls.length === 0}
        emptyMessage={canAsk ? 'No polls yet — ask the team something.' : 'No polls right now.'}
      >
        <ul className="mt-4 flex flex-col gap-4">
          {polls.map((poll) => {
            const open = pollIsOpen(poll.closes_at, now)
            const options = [...poll.options].sort((a, b) => a.sort_order - b.sort_order)
            const { counts, mine, voters } = tallyVotes(
              options.map((o) => o.id),
              poll.votes,
              myId,
            )

            return (
              <li key={poll.id} className="rounded-[var(--radius-chip)] hairline p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 flex-1 text-body-md font-medium text-on-surface">
                    {poll.question}
                  </h3>
                  {canAsk && (
                    <button
                      type="button"
                      onClick={() => removePoll.mutate(poll.id)}
                      aria-label={`Delete poll: ${poll.question}`}
                      className="tap shrink-0 text-label-sm text-on-surface-faint hover:text-error"
                    >
                      Delete
                    </button>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-label-sm text-on-surface-faint">
                  <span>{poll.choice_mode === 'single' ? 'Pick one' : 'Pick any'}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {voters} {voters === 1 ? 'answer' : 'answers'}
                  </span>
                  {poll.closes_at && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className={open ? 'text-accent-orange' : 'text-on-surface-faint'}>
                        {open ? timeLeft(poll.closes_at, now) : 'Closed'}
                      </span>
                    </>
                  )}
                </div>

                <ul className="mt-3 flex flex-col gap-2">
                  {options.map((option) => {
                    const picked = mine.has(option.id)
                    const count = counts[option.id] ?? 0
                    return (
                      <li key={option.id}>
                        <button
                          type="button"
                          disabled={!open || vote.isPending}
                          aria-pressed={picked}
                          onClick={() =>
                            vote.mutate({ poll, optionId: option.id, on: !picked })
                          }
                          className={`tap relative flex w-full items-center gap-3 overflow-hidden rounded-[var(--radius-chip)] px-3 py-2 text-left transition-colors duration-300 ${
                            picked ? 'hairline-strong' : 'hairline'
                          } ${open ? 'hover:bg-raised' : 'cursor-default opacity-90'}`}
                        >
                          {/* The bar is behind the label rather than beside
                              it, so a long option keeps the whole width. */}
                          <span
                            aria-hidden="true"
                            className={`absolute inset-y-0 left-0 transition-[width] duration-500 ease-[var(--ease-glide)] ${
                              picked ? 'bg-primary/25' : 'bg-raised-strong/60'
                            }`}
                            style={{ width: `${optionShare(count, counts)}%` }}
                          />
                          <span className="relative min-w-0 flex-1 text-body-sm text-on-surface">
                            {option.label}
                          </span>
                          <span className="relative shrink-0 font-mono text-label-sm tabular text-on-surface-variant">
                            {count}
                          </span>
                          {picked && (
                            <span className="relative shrink-0 font-mono text-label-sm text-primary">
                              ✓
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>

                {!open && (
                  <p className="mt-2 text-label-sm text-on-surface-faint">
                    The deadline has passed — answers are final.
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </QueryState>
    </section>
  )
}

/** Asking: a question, two or more options, one answer or many, and a deadline. */
function PollComposer({
  departmentId,
  onDone,
  onCancel,
  onError,
}: {
  departmentId: string
  onDone: () => void
  onCancel: () => void
  onError: (message: string | null) => void
}) {
  const { session } = useAuth()
  const errorText = useErrorText()
  const [question, setQuestion] = useState('')
  const [labels, setLabels] = useState<string[]>(['', ''])
  const [mode, setMode] = useState<ChoiceMode>('single')
  const [closesAt, setClosesAt] = useState('')

  const create = useMutation({
    mutationFn: async () => {
      const kept = labels.map((l) => l.trim()).filter(Boolean)
      const { data, error } = await supabase
        .from('team_polls')
        .insert({
          department_id: departmentId,
          created_by: session!.user.id,
          question: question.trim(),
          choice_mode: mode,
          // A local datetime-local value carries no zone; treating it as
          // local time is what the person typing it meant.
          closes_at: closesAt ? new Date(closesAt).toISOString() : null,
        })
        .select('id')
        .single()
      if (error) throw error

      const { error: optionError } = await supabase.from('team_poll_options').insert(
        kept.map((label, i) => ({ poll_id: (data as { id: string }).id, label, sort_order: i })),
      )
      if (optionError) throw optionError
    },
    onSuccess: () => {
      onError(null)
      onDone()
    },
    onError: (err: unknown) => onError(errorText(err, 'Could not create that poll.')),
  })

  const kept = labels.map((l) => l.trim()).filter(Boolean)
  const ready = question.trim().length > 0 && kept.length >= 2

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (ready) create.mutate()
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-[var(--radius-chip)] hairline p-4">
      <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
        Question
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={300}
          placeholder="Which night suits rehearsal?"
          className="rounded-full hairline bg-transparent px-3 py-2 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </label>

      <div className="mt-3 flex flex-col gap-2">
        <Eyebrow>Options</Eyebrow>
        {labels.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={label}
              onChange={(e) =>
                setLabels((prev) => prev.map((l, j) => (j === i ? e.target.value : l)))
              }
              maxLength={120}
              placeholder={`Option ${i + 1}`}
              className="min-w-0 flex-1 rounded-full hairline bg-transparent px-3 py-2 text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {labels.length > 2 && (
              <button
                type="button"
                onClick={() => setLabels((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove option ${i + 1}`}
                className="tap-square shrink-0 rounded-full px-2 text-label-sm text-on-surface-faint hover:text-error"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLabels((prev) => [...prev, ''])}
          className="tap self-start text-label-md text-secondary hover:underline"
        >
          + Add option
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <Eyebrow>Answers</Eyebrow>
          <div className="flex gap-1 rounded-full bg-inset p-1 hairline">
            {(['single', 'multiple'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`tap rounded-full px-3 py-1.5 text-body-sm font-medium transition-colors ${
                  mode === m ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                }`}
              >
                {m === 'single' ? 'Pick one' : 'Pick any'}
              </button>
            ))}
          </div>
        </div>

        <label className="flex min-w-0 flex-col gap-1 text-body-sm text-on-surface-variant">
          Deadline (optional)
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="min-w-0 rounded-full hairline bg-transparent px-3 py-2 font-mono text-label-md text-on-surface [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </label>
      </div>

      <p className="mt-2 text-label-sm text-on-surface-faint">
        After the deadline nobody can add, change or withdraw an answer.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="tap rounded-full hairline px-4 py-2 text-body-sm font-medium text-on-surface"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!ready || create.isPending}
          className="tap rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
        >
          {create.isPending ? 'Posting…' : 'Post poll'}
        </button>
      </div>
    </form>
  )
}
