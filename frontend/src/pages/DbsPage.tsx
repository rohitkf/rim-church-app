import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FitFigure, PageHeader, Pill, SegmentedControl, Statistic, Tile, inputClasses, type PillTone } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { DbsCheckDialog } from '../components/DbsCheckDialog'
import { todayIso } from '../lib/monthGrid'
import { PEOPLE_NAMES_KEY, fetchPeopleNames, nameMatches, nameOf, type PersonName } from '../lib/families'
import {
  DBS_ROWS_KEY,
  DBS_STANDINGS_KEY,
  DBS_STANDING_TEXT,
  dbsAge,
  dbsDate,
  dbsKindLabel,
  fetchDbsRows,
  fetchDbsStandings,
  type DbsRow,
  type DbsStanding,
} from '../lib/dbs'

/**
 * DBS checks (0324): everybody's, on one page (the Owner's ask, November
 * 2026: "a dedicated page to see and manage DBS of everyone").
 *
 * It was a button on each card on Volunteers, which is the right place to
 * check one person and the wrong place to see who is still to check. This
 * is the list: where each person stands, the certificate and how old it
 * is, who verified it; filtered by where they stand and searched by name;
 * and the same dialog to check one and mark it verified.
 *
 * For whoever holds `people.compliance` (the Owner alone out of the box).
 * The database decides what is sent: this page asks for everybody's and
 * shows what comes back.
 */

type Filter = 'all' | DbsStanding

/** What wants doing first, first. */
const ORDER: DbsStanding[] = ['check', 'details', 'verified', 'none']

const TONE: Record<DbsStanding, PillTone> = {
  check: 'orange',
  details: 'blue',
  verified: 'green',
  none: 'neutral',
}

/** The line under a name: the certificate where there is one, the plain fact where there is not. */
function detailOf(standing: DbsStanding, row: DbsRow | undefined, names: Map<string, PersonName>, today: string): string {
  if (standing === 'none') return 'Says they have no DBS check.'
  if (!row) return 'Says yes, and has not given the certificate’s details yet. The app asks for them.'
  const age = dbsAge(row.issued_on.slice(0, 10), today)
  const parts = [dbsKindLabel(row.kind), `issued ${dbsDate(row.issued_on)}`, age ?? '']
  if (row.verified_at) {
    const by = row.verified_by ? names.get(row.verified_by) : undefined
    parts.push(`verified ${dbsDate(row.verified_at)}${by ? ` by ${nameOf(by)}` : ''}`)
  }
  return parts.filter(Boolean).join(' · ')
}

export function DbsPage() {
  const queryClient = useQueryClient()
  const people = useQuery({ queryKey: PEOPLE_NAMES_KEY, queryFn: fetchPeopleNames })
  const standings = useQuery({ queryKey: DBS_STANDINGS_KEY, queryFn: fetchDbsStandings })
  const rows = useQuery({ queryKey: DBS_ROWS_KEY, queryFn: fetchDbsRows })
  const [filter, setFilter] = useState<Filter>('all')
  const [typed, setTyped] = useState('')
  const [open, setOpen] = useState<PersonName | null>(null)

  const today = todayIso()
  const everybody = people.data ?? []
  const names = new Map(everybody.map((p) => [p.id, p]))
  const standingOf = (id: string): DbsStanding => standings.data?.[id] ?? 'none'
  const count = (s: DbsStanding) => everybody.filter((p) => standingOf(p.id) === s).length
  const counts: Record<DbsStanding, number> = { check: count('check'), details: count('details'), verified: count('verified'), none: count('none') }

  const shown = everybody
    .filter((p) => (filter === 'all' || standingOf(p.id) === filter) && nameMatches(nameOf(p), typed))
    .sort(
      (a, b) =>
        ORDER.indexOf(standingOf(a.id)) - ORDER.indexOf(standingOf(b.id)) ||
        nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' }),
    )

  return (
    <div>
      <PageHeader
        title="DBS checks"
        description="Where everybody stands: who is still to check, who has not given their certificate’s details, and who is verified. Open one to see what a check needs and to mark it."
      />

      <QueryState isLoading={people.isLoading || standings.isLoading || rows.isLoading} error={people.error ?? standings.error ?? rows.error}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile tone={counts.check > 0 ? 'warning' : 'plain'} className="@container min-w-0">
            <Statistic className="flex-col" value={<FitFigure>{counts.check}</FitFigure>} unit="to check" />
          </Tile>
          <Tile className="@container min-w-0">
            <Statistic className="flex-col" value={<FitFigure>{counts.details}</FitFigure>} unit="details not given" />
          </Tile>
          <Tile tone={counts.verified > 0 ? 'success' : 'plain'} className="@container min-w-0">
            <Statistic className="flex-col" value={<FitFigure>{counts.verified}</FitFigure>} unit="verified" />
          </Tile>
          <Tile className="@container min-w-0">
            <Statistic className="flex-col" value={<FitFigure>{counts.none}</FitFigure>} unit="no DBS" />
          </Tile>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <SegmentedControl<Filter>
            label="Show"
            value={filter}
            onChange={setFilter}
            wraps
            options={[
              { value: 'all', label: `Everybody ${everybody.length}` },
              { value: 'check', label: `To check ${counts.check}` },
              { value: 'details', label: `No details ${counts.details}` },
              { value: 'verified', label: `Verified ${counts.verified}` },
              { value: 'none', label: `No DBS ${counts.none}` },
            ]}
          />
          <label className="flex flex-col gap-2 text-body-sm text-on-surface-variant">
            Find a person
            <input
              type="search"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type a name"
              autoComplete="off"
              className={inputClasses}
            />
          </label>
        </div>

        {shown.length === 0 ? (
          <p className="mt-6 text-body-md text-on-surface-variant">
            {typed.trim() ? 'Nobody by that name here.' : filter === 'check' ? 'Nobody is waiting to be checked.' : 'Nobody here.'}
          </p>
        ) : (
          <ul aria-label="People" className="mt-4 flex flex-col gap-2">
            {shown.map((p) => {
              const standing = standingOf(p.id)
              const name = nameOf(p) || 'No name'
              return (
                <li key={p.id} aria-label={name} className="rounded-[var(--radius-row)] bg-surface-lowest hairline">
                  <button
                    type="button"
                    onClick={() => setOpen(p)}
                    aria-label={`DBS of ${name}: ${DBS_STANDING_TEXT[standing]}`}
                    className="tap flex w-full flex-col gap-1.5 px-4 py-3 text-left hover:ring-1 hover:ring-secondary sm:px-5"
                  >
                    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                      <span className="min-w-0 text-body-md font-medium text-on-surface [overflow-wrap:anywhere]">{name}</span>
                      <Pill tone={TONE[standing]}>{DBS_STANDING_TEXT[standing]}</Pill>
                    </span>
                    <span className="text-body-sm text-on-surface-variant [overflow-wrap:anywhere]">
                      {detailOf(standing, rows.data?.[p.id], names, today)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </QueryState>

      {open && (
        <DbsCheckDialog
          person={open}
          onClose={() => {
            setOpen(null)
            // What they stand as may have changed while it was open.
            void queryClient.invalidateQueries({ queryKey: DBS_STANDINGS_KEY })
            void queryClient.invalidateQueries({ queryKey: DBS_ROWS_KEY })
          }}
        />
      )}
    </div>
  )
}
