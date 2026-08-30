import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from './QueryState'
import { SectionPanel } from './SectionPanel'
import { CakeIcon } from './icons'
import { todayIso } from '../lib/monthGrid'
import { isMissingColumnError } from '../lib/missingColumn'
import { upcomingCelebrations, whenLabel, type Occasion } from '../lib/celebrations'

/** How far ahead to look, and how much of it to show at a glance. */
const WINDOW_DAYS = 60
const SHOWN = 6

const personSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  dob: z.string().nullable(),
  anniversary: z.string().nullable().optional(),
})

/**
 * Everyone's dates. Anniversaries arrived in a later migration, so a
 * database that hasn't had it applied yet still gets birthdays rather than
 * an error — with a line saying what is missing.
 */
async function fetchPeople(): Promise<{
  people: z.infer<typeof personSchema>[]
  anniversariesAvailable: boolean
}> {
  const withAnniversary = await supabase
    .from('profiles')
    .select('id, first_name, last_name, dob, anniversary')

  if (!withAnniversary.error) {
    return { people: z.array(personSchema).parse(withAnniversary.data), anniversariesAvailable: true }
  }
  if (!isMissingColumnError(withAnniversary.error, 'anniversary')) throw withAnniversary.error

  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name, dob')
  if (error) throw error
  return { people: z.array(personSchema).parse(data), anniversariesAvailable: false }
}

const KIND = {
  birthday: { label: 'Birthday', emoji: '🎂', chip: 'bg-status-member/15 text-status-member' },
  anniversary: { label: 'Anniversary', emoji: '💍', chip: 'bg-status-head/15 text-status-head' },
} as const

function formatDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function OccasionRow({ occasion, isMe }: { occasion: Occasion; isMe: boolean }) {
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
            {isMe && <span className="ml-2 font-mono text-label-sm text-secondary">You</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className={`rounded-full px-1.5 py-0.5 font-mono text-label-sm ${kind.chip}`}>
              {kind.label}
            </span>
            {occasion.years !== null && (
              <span className="text-label-sm text-on-surface-variant">
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
 * Birthdays and wedding anniversaries coming up, on the dashboard where
 * everyone passes anyway — a list nobody navigates to is a list nobody
 * reads, and missing someone's birthday is the whole failure mode.
 */
export function CelebrationsPanel() {
  const { session } = useAuth()
  const today = todayIso()

  const peopleQuery = useQuery({ queryKey: ['celebration-people'], queryFn: fetchPeople })

  const occasions = useMemo(
    () => upcomingCelebrations(peopleQuery.data?.people ?? [], today, WINDOW_DAYS),
    [peopleQuery.data, today],
  )
  const anniversariesAvailable = peopleQuery.data?.anniversariesAvailable ?? true
  const shown = occasions.slice(0, SHOWN)

  return (
    <SectionPanel
      title="Celebrations"
      icon={CakeIcon}
      aside={
        occasions.length > shown.length ? (
          <span className="font-mono text-label-sm text-on-surface-variant">
            +{occasions.length - shown.length} more
          </span>
        ) : null
      }
    >
      <QueryState
        isLoading={peopleQuery.isLoading}
        error={peopleQuery.error}
        isEmpty={occasions.length === 0}
        emptyMessage="Nothing in the next two months. Dates come from people's profiles."
      >
        <ul className="-mx-2 flex flex-col">
          {shown.map((o) => (
            <OccasionRow key={o.id} occasion={o} isMe={o.personId === session?.user.id} />
          ))}
        </ul>
      </QueryState>

      {!anniversariesAvailable && (
        <p className="mt-3 rounded-sm bg-warning/10 px-2.5 py-1.5 text-label-sm text-on-surface">
          Birthdays only — anniversaries need one more database migration.
        </p>
      )}
    </SectionPanel>
  )
}
