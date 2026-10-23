import { useMemo, useState } from 'react'
import { Eyebrow, inputClasses } from './Surface'
import { guestTeams, matchGuests, type PollGuest } from '../lib/pollGuests'

/**
 * Whether a poll asks guests, and which (0177).
 *
 * One box to leave guests out altogether. Ticked, every guest the poll
 * would reach is listed, all picked to begin with: pick or unpick them one
 * by one, find them by name or team, or take a whole team's guests in one
 * tap.
 */
export function PollGuestPicker({
  guests,
  include,
  onInclude,
  picked,
  onPicked,
  loading = false,
}: {
  guests: PollGuest[]
  include: boolean
  onInclude: (next: boolean) => void
  picked: Set<string>
  onPicked: (next: Set<string>) => void
  loading?: boolean
}) {
  const [search, setSearch] = useState('')
  const teams = useMemo(() => guestTeams(guests), [guests])
  const shown = useMemo(() => matchGuests(guests, search), [guests, search])
  const count = guests.filter((g) => picked.has(g.id)).length

  const toggle = (id: string) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onPicked(next)
  }
  const teamGuests = (teamId: string) => guests.filter((g) => g.teams.some((t) => t.id === teamId))
  const teamAllPicked = (teamId: string) => teamGuests(teamId).every((g) => picked.has(g.id))
  const toggleTeam = (teamId: string) => {
    const next = new Set(picked)
    const all = teamAllPicked(teamId)
    for (const g of teamGuests(teamId)) {
      if (all) next.delete(g.id)
      else next.add(g.id)
    }
    onPicked(next)
  }

  const chip = (on: boolean) =>
    `tap rounded-full px-3 py-1 text-label-md ${
      on ? 'bg-primary text-on-primary' : 'hairline text-on-surface'
    }`

  return (
    <div className="mt-4" role="group" aria-label="Guests">
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={include}
          onChange={(e) => onInclude(e.target.checked)}
          className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
        />
        <span className="text-body-sm text-on-surface">Include guests</span>
      </label>
      <p className="mt-1 text-label-sm text-on-surface-faint">
        {include
          ? 'A guest is somebody here only through a guest place on a team. Only the guests ticked are asked.'
          : 'Guests are left out: they are not told and do not see the poll.'}
      </p>

      {include && (
        <div className="mt-3">
          {loading ? (
            <p className="text-label-sm text-on-surface-faint">Finding guests…</p>
          ) : guests.length === 0 ? (
            <p className="text-label-sm text-on-surface-faint">No guests in this audience.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Eyebrow>
                  {count} of {guests.length} {guests.length === 1 ? 'guest' : 'guests'}
                </Eyebrow>
                <span className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onPicked(new Set(guests.map((g) => g.id)))}
                    className={chip(false)}
                  >
                    Select all
                  </button>
                  <button type="button" onClick={() => onPicked(new Set())} className={chip(false)}>
                    Unselect all
                  </button>
                </span>
              </div>
              {teams.length > 1 && (
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Guests by team">
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={teamAllPicked(t.id)}
                      onClick={() => toggleTeam(t.id)}
                      className={chip(teamAllPicked(t.id))}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a guest by name or team…"
                aria-label="Find a guest"
                className={`${inputClasses} mt-3`}
              />
              <ul className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                {shown.map((g) => (
                  <li key={g.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-row)] bg-raised px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={picked.has(g.id)}
                        onChange={() => toggle(g.id)}
                        className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-body-sm text-on-surface">{g.name}</span>
                      <span className="shrink-0 truncate text-label-sm text-on-surface-faint">
                        {g.teams.map((t) => t.name).join(', ')}
                      </span>
                    </label>
                  </li>
                ))}
                {shown.length === 0 && (
                  <li className="text-label-sm text-on-surface-faint">No guest by that name or team.</li>
                )}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
