import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { REMINDERS_KEY, fetchOpenRequests, toReminders } from '../lib/reminders'

export type ReminderTone = 'accent' | 'warning' | 'neutral'

const TONE: Record<ReminderTone, string> = {
  accent:
    'bg-[color-mix(in_oklab,var(--color-accent-blue)_9%,var(--color-surface-lowest))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-blue)_26%,transparent)]',
  warning:
    'bg-[color-mix(in_oklab,var(--color-accent-orange)_9%,var(--color-surface-lowest))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_26%,transparent)]',
  neutral: 'bg-surface-lowest hairline',
}

/**
 * One thing somebody has been asked to do, kept in sight until it is done.
 *
 * Reusable on purpose: it takes the words and, if there is one, the place
 * to go, and nothing about what kind of request it is. A poll, an
 * availability answer, a mention, or anything added later all look the
 * same here — what they say and where they lead is lib/reminders.ts.
 */
export function ReminderBanner({
  eyebrow,
  title,
  detail,
  href,
  actionLabel = 'Open',
  tone = 'accent',
  onOpen,
}: {
  eyebrow: string
  title: string
  detail?: string
  /** Where the button goes; without one the banner only informs. */
  href?: string
  actionLabel?: string
  tone?: ReminderTone
  /** Runs as the link is followed — for a request that is done by opening it. */
  onOpen?: () => void
}) {
  return (
    <div
      role="note"
      className={`flex flex-col gap-3 rounded-[var(--radius-row)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${TONE[tone]}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-label-sm font-medium uppercase tracking-wide text-on-surface-variant">{eyebrow}</p>
        <p className="mt-0.5 line-clamp-2 break-words text-body-sm font-medium text-on-surface">{title}</p>
        {detail && <p className="mt-0.5 text-label-sm text-on-surface-variant">{detail}</p>}
      </div>
      {href && (
        <Link
          to={href}
          onClick={onOpen}
          className="tap shrink-0 self-start rounded-full bg-primary px-4 py-2 text-label-md font-semibold text-on-primary hover:opacity-90 sm:self-center"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

/**
 * The dashboard's reminders: everything waiting on the signed-in person,
 * soonest due first. Nothing at all when nothing is waiting.
 */
export function DashboardReminders({ className = '' }: { className?: string }) {
  const { session } = useAuth()
  const myId = session?.user.id
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [...REMINDERS_KEY, myId],
    queryFn: fetchOpenRequests,
    enabled: !!myId,
    refetchInterval: 60_000,
  })
  // "Closes in 3 hours" as of the last fetch, which is every minute.
  const reminders = toReminders(query.data ?? [], query.dataUpdatedAt)
  if (reminders.length === 0) return null

  // Some requests are done once looked at, a mention among them: the same
  // as opening it from the bell, which marks it read.
  const markRead = (type: string, refId: string | null) => {
    if (!refId || !myId) return
    void supabase
      .from('notifications')
      .update({ read_boolean: true })
      .eq('user_id', myId)
      .eq('type', type)
      .eq('reference_id', refId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: REMINDERS_KEY })
        void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      })
  }

  return (
    <section aria-label="Waiting on you" className={className}>
      <ul className="flex flex-col gap-2">
        {reminders.map((r) => (
          <li key={r.key}>
            <ReminderBanner
              eyebrow={r.eyebrow}
              title={r.title}
              detail={r.detail}
              href={r.href}
              actionLabel={r.actionLabel}
              tone={r.tone}
              onOpen={r.readsOnOpen ? () => markRead(r.readsOnOpen!, r.refId) : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
