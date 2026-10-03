import { useState } from 'react'
import {
  CHECKED_ON,
  PERMISSIONS,
  ROLES,
  type Allowed,
  type RoleKey,
} from '../lib/permissionMatrix'
import { Pill, Tile } from './Surface'
import { Chevron } from './Collapsible'

/**
 * Who can do what, on one page.
 *
 * The app has grown a standing, a team standing, a service-only standing
 * and an owner, spread across sixty-odd database policies. Nobody can hold
 * that in their head, and the question "wait — can a Head see DBS
 * details?" deserves an answer better than reading SQL.
 *
 * It used to answer with thirteen tables of six columns each, open at
 * once — on a phone, twenty screens of sideways-scrolling grid. The
 * question people actually bring is about one person: "what can a Team
 * Head do?". So the page now asks who, and answers for them, an area at a
 * time. The full grid is still one tap away, for comparing.
 *
 * It does not change anything, and says so plainly rather than leaving
 * somebody to discover it by clicking. A grid of checkboxes that wrote
 * back would be the friendlier lie: permissions here are enforced by
 * Postgres on every query, which is the reason they hold at all, and there
 * is no settings row for a tick to land in.
 */

const ANSWER: Record<Allowed, { label: string; tone: 'green' | 'blue' | 'neutral' }> = {
  yes: { label: 'Yes', tone: 'green' },
  own: { label: 'Their own', tone: 'blue' },
  team: { label: 'Their team', tone: 'blue' },
  no: { label: 'No', tone: 'neutral' },
}

/** What a grid cell says. A tick is the loud one; everything else stays quiet. */
function Cell({ value }: { value: Allowed }) {
  if (value === 'yes') {
    return (
      <span className="text-success" aria-label="Yes">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    )
  }
  if (value === 'no') {
    // A dash rather than a cross. Most of this grid is "no", and eighty
    // red crosses reads as a list of faults instead of a description.
    return (
      <span className="text-on-surface-faint" aria-label="No">
        –
      </span>
    )
  }
  return (
    <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
      {value === 'own' ? 'own' : 'team'}
    </span>
  )
}

export function PermissionsCard() {
  const [view, setView] = useState<'role' | 'compare'>('role')
  const [role, setRole] = useState<RoleKey>('member')
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [onlyAllowed, setOnlyAllowed] = useState(false)

  const chosen = ROLES.find((r) => r.key === role)!
  const allOpen = open.size === PERMISSIONS.length
  const toggleArea = (area: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(area)) next.delete(area)
      else next.add(area)
      return next
    })

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-body-sm text-on-surface-variant">
        A reference, not a switchboard. These rules are enforced by the database on every request,
        not by this page — changing one means changing a policy, on purpose.
      </p>

      <div role="radiogroup" aria-label="View" className="flex gap-1 self-start rounded-full bg-inset p-1 hairline">
        {(
          [
            ['role', 'One role'],
            ['compare', 'Compare all'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={view === value}
            onClick={() => setView(value)}
            className={`tap rounded-full px-4 py-2 text-label-md transition-colors duration-300 ${
              view === value ? 'bg-primary font-medium text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'role' ? (
        <>
          <Tile>
            <h2 className="text-body-lg font-semibold text-on-surface">Who are you asking about?</h2>
            <div role="radiogroup" aria-label="Role" className="mt-4 flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  role="radio"
                  aria-checked={role === r.key}
                  onClick={() => setRole(r.key)}
                  className={`tap rounded-full px-4 py-2 text-body-sm transition-colors duration-300 ${
                    role === r.key
                      ? 'bg-primary font-medium text-on-primary'
                      : 'bg-raised text-on-surface-variant hairline hover:text-on-surface'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="mt-4 text-body-sm text-on-surface-variant">{chosen.blurb}</p>
            <label className="mt-4 flex items-center gap-2.5 text-body-sm text-on-surface">
              <input
                type="checkbox"
                checked={onlyAllowed}
                onChange={(e) => setOnlyAllowed(e.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              Only show what a {chosen.label} can do
            </label>
          </Tile>

          <div className="flex items-center justify-between px-1">
            <h2 className="text-body-md font-medium text-on-surface">By area</h2>
            <button
              type="button"
              onClick={() => setOpen(allOpen ? new Set() : new Set(PERMISSIONS.map((a) => a.area)))}
              className="tap rounded-full px-2 py-1 text-label-md text-accent-blue-soft hover:text-on-surface"
            >
              {allOpen ? 'Fold all' : 'Open all'}
            </button>
          </div>

          <ul className="flex flex-col gap-2" aria-label={`What a ${chosen.label} can do`}>
            {PERMISSIONS.map((area) => {
              const allowed = area.capabilities.filter((c) => c.can[role] !== 'no').length
              const total = area.capabilities.length
              const isOpen = open.has(area.area)
              const shown = onlyAllowed ? area.capabilities.filter((c) => c.can[role] !== 'no') : area.capabilities
              const panel = `area-${area.area.replace(/[^a-z]+/gi, '-').toLowerCase()}`
              return (
                <li key={area.area}>
                  <Tile padded={false} className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleArea(area.area)}
                      aria-expanded={isOpen}
                      aria-controls={panel}
                      className="tap flex w-full items-center gap-3 px-5 py-4 text-left transition-colors duration-300 hover:bg-raised"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-md font-medium text-on-surface">{area.area}</span>
                        {/* How much of the area is theirs, at a glance. */}
                        <span className="mt-2 block h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-raised-strong" aria-hidden="true">
                          <span
                            className="block h-full rounded-full bg-accent-green transition-[width] duration-700 ease-[var(--ease-glide)]"
                            style={{ width: `${(allowed / total) * 100}%` }}
                          />
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-label-sm tabular text-on-surface-variant">
                        {allowed} of {total}
                      </span>
                      <Chevron open={isOpen} />
                    </button>
                    {isOpen && (
                      <ul id={panel} className="flex flex-col gap-1 px-3 pb-3">
                        {shown.length === 0 && (
                          <li className="px-2 py-2 text-body-sm text-on-surface-faint">Nothing here for a {chosen.label}.</li>
                        )}
                        {shown.map((capability) => {
                          const answer = ANSWER[capability.can[role]]
                          return (
                            <li
                              key={capability.action}
                              className="flex items-start gap-3 rounded-[var(--radius-row)] px-2 py-2.5 odd:bg-raised"
                            >
                              <span className="min-w-0 flex-1">
                                <span
                                  className={`block text-body-sm ${
                                    capability.can[role] === 'no' ? 'text-on-surface-faint' : 'text-on-surface'
                                  }`}
                                >
                                  {capability.action}
                                </span>
                                {capability.note && capability.can[role] !== 'no' && (
                                  <span className="mt-0.5 block text-label-sm text-on-surface-faint">
                                    {capability.note}
                                  </span>
                                )}
                              </span>
                              <Pill tone={answer.tone} className="mt-0.5">
                                {answer.label}
                              </Pill>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </Tile>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <Tile>
          <dl className="flex flex-col gap-2">
            {ROLES.map((r) => (
              <div key={r.key} className="flex flex-wrap items-baseline gap-x-2">
                <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface">{r.label}</dt>
                <dd className="min-w-0 flex-1 text-label-sm text-on-surface-variant">{r.blurb}</dd>
              </div>
            ))}
            <div className="flex flex-wrap items-baseline gap-x-2">
              <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">own / team</dt>
              <dd className="min-w-0 flex-1 text-label-sm text-on-surface-variant">
                Yes, but only for themselves, or only for a team they lead or belong to.
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-col gap-7">
            {PERMISSIONS.map((area) => (
              <section key={area.area}>
                <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                  {area.area}
                </h3>
                {/* Six columns will not fit a phone, and shrinking them to
                    make them fit is how a table becomes unreadable on every
                    device instead of one. It scrolls inside itself. */}
                <div className="mt-2 -mx-2 overflow-x-auto px-2">
                  <table className="w-full min-w-[34rem] border-collapse text-body-sm">
                    <thead>
                      <tr>
                        <th className="w-[45%] px-2 pb-2 text-left font-normal text-on-surface-faint">
                          <span className="sr-only">Action</span>
                        </th>
                        {ROLES.map((r) => (
                          <th
                            key={r.key}
                            scope="col"
                            className="px-2 pb-2 text-center font-mono text-label-sm font-normal uppercase tracking-wide text-on-surface-variant"
                          >
                            {r.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {area.capabilities.map((capability) => (
                        <tr key={capability.action} className="border-t border-border-subtle align-top">
                          <th scope="row" className="px-2 py-2 text-left font-normal text-on-surface">
                            {capability.action}
                            {capability.note && (
                              <span className="mt-0.5 block text-label-sm text-on-surface-faint">
                                {capability.note}
                              </span>
                            )}
                          </th>
                          {ROLES.map((r) => (
                            <td key={r.key} className="px-2 py-2 text-center">
                              <Cell value={capability.can[r.key as RoleKey]} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </Tile>
      )}

      {/* Said out loud, because a reference that quietly goes stale is
          worse than none: somebody would trust it. */}
      <p className="px-1 text-label-sm text-on-surface-faint">
        Read from the database&rsquo;s own policies on {CHECKED_ON}. Adding a rule later will not
        update this page by itself — if something here disagrees with what the app does, the app is
        right and this needs correcting.
      </p>
    </div>
  )
}
