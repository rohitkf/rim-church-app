import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { SectionPanel } from './SectionPanel'
import { CakeIcon } from './icons'
import { todayIso } from '../lib/monthGrid'
import { upcomingCelebrations, whenLabel, type Occasion } from '../lib/celebrations'
import type { Celebrations } from '../lib/display'
import { usePageAccess } from '../lib/usePageAccess'

const personSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  dob: z.string().nullable(),
  anniversary: z.string().nullable().optional(),
})

/** Everyone's dates, as the Events page reads them. */
async function fetchPeople() {
  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name, dob, anniversary')
  if (error) throw error
  return z.array(personSchema).parse(data)
}

/**
 * Who is married to whom (0152), so a couple's anniversary is one line
 * with both names — the same call, and the same cache, as the Events page.
 * Without it each person's anniversary is drawn on its own.
 */
async function fetchCouples() {
  const { data, error } = await supabase.rpc('married_couples')
  if (error) return []
  return z.array(z.object({ a: z.string(), b: z.string() })).parse(data ?? [])
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
    month: 'short',
    timeZone: 'UTC',
  })
}

function OccasionRow({ occasion, isMe, ages }: { occasion: Occasion; isMe: boolean; ages: boolean }) {
  const kind = KIND[occasion.kind]
  const today = occasion.daysAway === 0

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-sm px-2 py-2 ${
        today ? 'bg-secondary/10' : ''
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="text-body-lg leading-none">
          {kind.emoji}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="break-words text-body-sm text-on-surface">
            {occasion.name}
            {isMe && <span className="ml-2 font-mono text-label-sm text-accent-blue-soft">You</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className={`rounded-full px-1.5 py-0.5 font-mono text-label-sm ${kind.chip}`}>{kind.label}</span>
            {ages && occasion.years !== null && (
              <span className="text-label-sm text-on-surface-variant">
                {occasion.kind === 'birthday'
                  ? `Turns ${occasion.years}`
                  : `${occasion.years} ${occasion.years === 1 ? 'year' : 'years'}`}
              </span>
            )}
          </span>
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end">
        <span className={`font-mono text-label-sm ${today ? 'text-accent-blue-soft' : 'text-on-surface'}`}>
          {whenLabel(occasion.daysAway)}
        </span>
        <span className="font-mono text-label-sm text-on-surface-variant">{formatDay(occasion.nextIso)}</span>
      </span>
    </li>
  )
}

/**
 * Birthdays and wedding anniversaries coming up, on the Dashboard where
 * everybody passes anyway — a list nobody navigates to is a list nobody
 * reads, and missing somebody's birthday is the whole failure mode.
 *
 * How far ahead it looks, what it lists and how much of it, and whether it
 * gives ages, are the church's (Settings › Display). Like the day's events
 * above it, it is not there at all when there is nothing to say.
 */
export function CelebrationsPanel({ settings, className = '' }: { settings: Celebrations; className?: string }) {
  const { session } = useAuth()
  const { canOpen } = usePageAccess()
  const today = todayIso()

  const peopleQuery = useQuery({ queryKey: ['celebration-people'], queryFn: fetchPeople })
  const couplesQuery = useQuery({ queryKey: ['married-couples'], queryFn: fetchCouples })

  const occasions = useMemo(
    () =>
      upcomingCelebrations(peopleQuery.data ?? [], today, settings.days, couplesQuery.data ?? []).filter(
        (o) => (o.kind === 'birthday' ? settings.birthdays : settings.anniversaries),
      ),
    [peopleQuery.data, couplesQuery.data, today, settings.days, settings.birthdays, settings.anniversaries],
  )

  if (occasions.length === 0) return null
  const shown = occasions.slice(0, settings.limit)
  const more = occasions.length - shown.length
  const myId = session?.user.id
  const title =
    settings.birthdays && settings.anniversaries
      ? 'Birthdays & anniversaries'
      : settings.birthdays
        ? 'Birthdays'
        : 'Anniversaries'

  return (
    <SectionPanel
      title={title}
      icon={CakeIcon}
      className={className}
      aside={
        <span className="font-mono text-label-sm text-on-surface-variant">
          {settings.days === 0 ? 'Today' : `Next ${settings.days} ${settings.days === 1 ? 'day' : 'days'}`}
        </span>
      }
    >
      <ul aria-label={title} className="-mx-2 flex flex-col">
        {shown.map((o) => (
          <OccasionRow
            key={o.id}
            occasion={o}
            isMe={!!myId && (o.personId === myId || !!o.couple?.ids.includes(myId))}
            ages={settings.ages}
          />
        ))}
      </ul>
      {more > 0 &&
        (canOpen('/events') ? (
          <Link to="/events" className="mt-2 inline-block px-1 text-label-md text-accent-blue-soft hover:underline">
            +{more} more on Events
          </Link>
        ) : (
          <p className="mt-2 px-1 font-mono text-label-sm text-on-surface-variant">+{more} more</p>
        ))}
    </SectionPanel>
  )
}
