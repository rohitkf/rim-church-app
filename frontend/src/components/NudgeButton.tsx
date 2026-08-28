import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useErrorText } from '../lib/useErrorText'

/**
 * "Tell the people who still haven't."
 *
 * The button reports what actually happened rather than just going quiet:
 * the database returns how many notifications it wrote, and zero is a real
 * and common answer — everyone has done it, or the only person outstanding
 * is the head pressing the button. Saying "sent" to that would teach people
 * the button lies.
 *
 * The database also refuses to send the same nudge to the same person twice
 * within six hours, so a head who presses it again while waiting does not
 * buzz anyone's phone a second time.
 */
export function NudgeButton({
  rpc,
  args,
  children,
  nobodyLabel = 'Nobody to remind',
  className = '',
}: {
  rpc: 'nudge_availability' | 'nudge_checklist'
  args: Record<string, string | null>
  children: React.ReactNode
  /** What to say when the answer is zero. */
  nobodyLabel?: string
  className?: string
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [result, setResult] = useState<string | null>(null)

  const send = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc(rpc, args)
      if (error) throw error
      return typeof data === 'number' ? data : 0
    },
    onSuccess: (count) => {
      setResult(
        count === 0
          ? nobodyLabel
          : `Reminded ${count} ${count === 1 ? 'person' : 'people'}`,
      )
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      window.setTimeout(() => setResult(null), 5000)
    },
    onError: (err: unknown) => setResult(errorText(err, "That reminder didn't send.")),
  })

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => {
          setResult(null)
          send.mutate()
        }}
        disabled={send.isPending}
        className="rounded-full bg-raised-strong px-3 py-1.5 text-label-md text-on-surface hairline transition-all duration-500 ease-[var(--ease-glide)] hover:bg-surface-container active:scale-[0.98] disabled:opacity-50"
      >
        {send.isPending ? 'Sending…' : children}
      </button>
      {result && (
        <span aria-live="polite" className="font-mono text-label-sm text-on-surface-faint">
          {result}
        </span>
      )}
    </span>
  )
}
