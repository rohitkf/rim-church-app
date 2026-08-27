import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { todayIso } from '../lib/monthGrid'
import { upcomingCelebrations, whenLabel, type Occasion } from '../lib/celebrations'

const WINDOW_DAYS = 90

const personSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  dob: z.string().nullable(),
  anniversary: z.string().nullable(),
})

async function fetchPeople() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, dob, anniversary')
  if (error) throw error
  return z.array(personSchema).parse(data)
}

const KIND = {
  birthday: { label: 'Birthday', emoji: '🎂', chip: 'bg-status-member/15 text-status-member' },
  anniversary: { label: 'Anniversary', emoji: '💍', chip: 'bg-status-head/15 text-status-head' },
} as const

function formatDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

function OccasionRow({ occasion, isMe }: { occasion: Occasion; isMe: boolean }) {
  const kind = KIND[occasion.kind]
  const today = occasion.daysAway === 0

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border px-4 py-3 ${
        today ? 'border-secondary/50 bg-secondary/5' : 'border-border-subtle bg-surface-lowest'
      }`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="text-headline-md leading-none">
          {kind.emoji}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-body-md text-on-surface">
            {occasion.name}
            {isMe && <span className="ml-2 font-mono text-label-sm text-secondary">You</span>}
          </span>
          <span className="flex flex-wrap items-center gap-2 text-body-sm text-on-surface-variant">
            <span className={`rounded-full px-2 py-0.5 font-mono text-label-sm ${kind.chip}`}>
              {kind.label}
            </span>
            {occasion.years !== null && (
              <span>
                {occasion.kind === 'birthday'
                  ? `turning ${occasion.years}`
                  : `${occasion.years} ${occasion.years === 1 ? 'year' : 'years'}`}
              </span>
            )}
          </span>
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end">
        <span className={`font-mono text-label-sm ${today ? 'text-secondary' : 'text-on-surface'}`}>
          {whenLabel(occasion.daysAway)}
        </span>
        <span className="font-mono text-label-sm text-on-surface-variant">
          {formatDay(occasion.nextIso)}
        </span>
      </span>
    </li>
  )
}

/**
 * Birthdays and wedding anniversaries coming up, so nobody's is missed.
 * Everyone sees it — the dates come from people's own profiles, and are
 * already visible to anyone signed in.
 */
export function CelebrationsPage() {
  const { session } = useAuth()
  const today = todayIso()

  const peopleQuery = useQuery({ queryKey: ['celebration-people'], queryFn: fetchPeople })

  const occasions = useMemo(
    () => upcomingCelebrations(peopleQuery.data ?? [], today, WINDOW_DAYS),
    [peopleQuery.data, today],
  )

  const thisWeek = occasions.filter((o) => o.daysAway <= 7)
  const later = occasions.filter((o) => o.daysAway > 7)

  return (
    <div className="max-w-3xl">
      <h1 className="text-headline-xl">Celebrations</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Birthdays and wedding anniversaries over the next three months. Add or change your own dates
        on your profile.
      </p>

      <QueryState
        isLoading={peopleQuery.isLoading}
        error={peopleQuery.error}
        isEmpty={occasions.length === 0}
        emptyMessage="Nothing coming up in the next three months. Dates come from people's profiles, so a quiet list may just mean they haven't filled theirs in."
      >
        <div className="mt-6 flex flex-col gap-8">
          <section>
            <h2 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
              This week
            </h2>
            {thisWeek.length === 0 ? (
              <p className="mt-3 text-body-sm text-on-surface-variant">Nothing this week.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {thisWeek.map((o) => (
                  <OccasionRow key={o.id} occasion={o} isMe={o.personId === session?.user.id} />
                ))}
              </ul>
            )}
          </section>

          {later.length > 0 && (
            <section>
              <h2 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                Coming up
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {later.map((o) => (
                  <OccasionRow key={o.id} occasion={o} isMe={o.personId === session?.user.id} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </QueryState>
    </div>
  )
}
