import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { PageHeader, SectionTile, inputClasses } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { ClockInPlaceCard } from '../components/ClockInPlaceCard'
import { fetchClockIns, formatDistance, type ClockIn } from '../lib/clockIn'
import { todayIso } from '../lib/monthGrid'
import { formatServiceDay } from '../lib/sunday'

const METHOD_LABEL: Record<ClockIn['method'], string> = {
  location: 'Phone at church',
  request: 'Request approved',
  added: 'Added by an Admin',
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/**
 * Clock In (0191): who arrived, when, and where they were.
 *
 * People clock in from their Dashboard; this is the watchers' page — the
 * Owner, Admins and Overwatch, and whoever the church named in Settings ›
 * Clock in. Where the church is, which every clock-in is checked against,
 * sits at the top for the Owner and Admins alone.
 */
export function ClockInPage() {
  const { isAdmin, isSuperAdmin } = useAuth()
  const runsIt = isAdmin || isSuperAdmin
  const [day, setDay] = useState(todayIso)
  const rowsQuery = useQuery({ queryKey: ['clock-ins', day], queryFn: () => fetchClockIns(day) })
  const rows = rowsQuery.data ?? []

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <PageHeader
        eyebrow="Who has arrived"
        title="Clock In"
        description="Everybody on the day’s rota clocks in from their Dashboard when they arrive. Their phone is read once, there and then."
      />

      <div className="flex flex-col gap-5">
        {runsIt && <ClockInPlaceCard />}

        <SectionTile title="Clock-ins" hint={formatServiceDay(day)}>
          <label className="flex flex-wrap items-center gap-3 text-body-sm text-on-surface-variant">
            Day
            <input
              type="date"
              value={day}
              max={todayIso()}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              aria-label="Which day’s clock-ins"
              className={`${inputClasses} w-auto`}
            />
          </label>

          <QueryState
            isLoading={rowsQuery.isLoading}
            error={rowsQuery.error}
            isEmpty={rows.length === 0}
            emptyMessage="Nobody has clocked in on this day."
          >
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-body-sm">
                <caption className="sr-only">Who clocked in on {formatServiceDay(day)}</caption>
                <thead>
                  <tr className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                    <th scope="col" className="py-2 pr-4 font-normal">Name</th>
                    <th scope="col" className="py-2 pr-4 font-normal">Clocked in</th>
                    <th scope="col" className="py-2 pr-4 font-normal">Where</th>
                    <th scope="col" className="py-2 font-normal">How</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border-subtle align-top">
                      <td className="py-2.5 pr-4 text-on-surface">
                        {row.person ? `${row.person.first_name} ${row.person.last_name}` : 'Unknown'}
                      </td>
                      <td className="py-2.5 pr-4 font-mono tabular-nums text-on-surface">{clock(row.clocked_at)}</td>
                      <td className="py-2.5 pr-4 text-on-surface-variant">
                        {row.address ?? (row.latitude !== null ? 'Looking up the address…' : '—')}
                        {row.distance_m !== null && (
                          <span className="block font-mono text-label-sm text-on-surface-faint">
                            {formatDistance(row.distance_m)} from church
                            {row.accuracy_m !== null && ` · ± ${Math.round(row.accuracy_m)} m`}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-on-surface-variant">{METHOD_LABEL[row.method]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.some((r) => r.address) && (
              <p className="mt-3 text-label-sm text-on-surface-faint">Addresses © OpenStreetMap contributors</p>
            )}
          </QueryState>
        </SectionTile>
      </div>
    </div>
  )
}
