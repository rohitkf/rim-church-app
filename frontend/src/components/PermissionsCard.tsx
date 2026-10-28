import { useMemo, useState } from 'react'
import {
  CHECKED_ON,
  PERMISSIONS,
  ROLES,
  isLiveArea,
  withGrants,
  type Allowed,
  type Capability,
  type PermissionArea,
  type RoleKey,
} from '../lib/permissionMatrix'
import {
  REACH_LABEL,
  REACH_SHORT,
  GRID_ROLES,
  isFixed,
  reachOf,
  ruleFor,
  type CapabilityKey,
  type GridRole,
  type Reach,
} from '../lib/permissions'
import { usePermissionDraft } from '../lib/usePermissionDraft'
import { Pill, SegmentedControl, Tile } from './Surface'
import { Chevron } from './Collapsible'
import { SaveBar } from './SettingRows'
import { Select, reachPickerClasses } from './Select'

/**
 * Who can do what — and, where the church sets it, the place to set it.
 *
 * It began as a reference: sixty-odd database policies, written down so
 * "can a Head see DBS details?" had an answer better than reading SQL. It
 * said plainly that it changed nothing, because a grid of checkboxes that
 * wrote nowhere would have been the friendlier lie.
 *
 * Since 0133–0144 it is real. A row with a key is a cell in
 * `role_permissions`, and its policy asks `may()`, which reads that cell
 * on every request — so a change here holds for everybody the moment it
 * is saved, in the database, not in this page. A row without one is
 * fixed on purpose (what anybody can see, your own things, the keys to
 * the app) and still admits it is a transcription of a policy.
 *
 * The question people bring is usually about one person ("what can a
 * Team Head do?"), so the page still starts there, an area at a time; the
 * full grid is a tap away for comparing. Both views edit the same draft,
 * and nothing changes for anybody until Save.
 */

const ANSWER: Record<Allowed, { label: string; tone: 'green' | 'blue' | 'neutral' }> = {
  yes: { label: 'Yes', tone: 'green' },
  own: { label: 'Their own', tone: 'blue' },
  team: { label: 'Their team', tone: 'blue' },
  no: { label: 'No', tone: 'neutral' },
}

/** What a grid cell says. A tick is the loud one; everything else stays quiet. */
export function Cell({ value }: { value: Allowed }) {
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

export function LockGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

/** Whether the church sets this area, keeps it fixed on purpose, or has yet to be given it. */
function AreaStatus({ area }: { area: PermissionArea }) {
  if (isLiveArea(area)) return <Pill tone="green">Editable</Pill>
  return (
    <Pill tone="neutral">
      <LockGlyph />
      {area.fixed ? 'Fixed' : 'Coming soon'}
    </Pill>
  )
}

/**
 * One editable cell: the reaches this profile can be given, as a native
 * select — the control a phone already knows how to draw.
 */
export function ReachPicker({
  capability,
  role,
  value,
  unsaved,
  moved,
  label,
  onChange,
  wide = false,
  reaches = ruleFor(capability, role).reaches,
}: {
  capability: CapabilityKey
  role: GridRole
  value: Reach
  /** Differs from what is saved. */
  unsaved: boolean
  /** Differs from the app's default. */
  moved: boolean
  label: string
  onChange: (next: Reach) => void
  wide?: boolean
  /** The choices to offer, when not the catalog's own. */
  reaches?: readonly Reach[]
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Select
        aria-label={label}
        value={value}
        onChange={(next) => onChange(next as Reach)}
        options={reaches.map((reach) => ({ value: reach, label: wide ? REACH_LABEL[reach] : REACH_SHORT[reach] }))}
        className={`${reachPickerClasses} ${wide ? 'min-w-32' : ''} ${unsaved ? 'outline-2 outline-offset-2 outline-accent-orange' : ''}`}
      />
      {moved && (
        <span
          aria-label="Changed from the app’s default"
          title="Changed from the app’s default"
          className="h-2 w-2 shrink-0 rounded-full bg-accent-orange"
        />
      )}
    </span>
  )
}

/**
 * A cell nobody can change: what it says, as plain text. A third of the
 * grid is these, and drawn with a lock each they read as settings somebody
 * had switched off; quieter, they read as what they are.
 */
export function FixedCell({ value, locked }: { value: Allowed; locked: boolean }) {
  if (!locked) return <Cell value={value} />
  return (
    <span className="inline-flex items-center opacity-70" title="Set by the app">
      <Cell value={value} />
      <span className="sr-only">(fixed)</span>
    </span>
  )
}

/** Whether the church may set any cell in this row. */
function hasChoice(c: Capability, live: boolean): boolean {
  return live && !!c.key && GRID_ROLES.some((role) => !isFixed(c.key!, role))
}

export const roleLabel = (key: RoleKey) => ROLES.find((r) => r.key === key)!.label

/** "a Team Head", "an Admin" — and Overwatch, a body of people, bare. */
const somebody = (key: RoleKey) => {
  const label = roleLabel(key)
  if (key === 'overwatch') return label
  return /^[AEIOU]/.test(label) ? `an ${label}` : `a ${label}`
}

export function PermissionsCard({ areas = PERMISSIONS }: { areas?: PermissionArea[] } = {}) {
  const [view, setView] = useState<'role' | 'compare'>('role')
  const [role, setRole] = useState<RoleKey>('member')
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [onlyAllowed, setOnlyAllowed] = useState(false)
  // Areas whose rows the app sets are unfolded in Compare all.
  const [showFixed, setShowFixed] = useState<Set<string>>(() => new Set())

  // The church's changes as they would be after Save (lib/usePermissionDraft).
  const perms = usePermissionDraft()
  const { editable, stored, working, pending } = perms
  const [saved, setSaved] = useState(false)

  const shown = useMemo(() => withGrants(areas, working), [areas, working])

  const choose = (capability: CapabilityKey, who: GridRole, reach: Reach) => {
    setSaved(false)
    perms.chooseChurch(capability, who, reach)
  }

  /** The cell for one row and one profile, editable where it can be. */
  const cellFor = (c: Capability, who: RoleKey, live: boolean, wide = false) => {
    const value = c.can[who]
    const key = c.key
    // A lock only where a choice exists and this cell is not offered one:
    // a row the grid does not set yet just says what it says.
    if (!key || who === 'owner' || !live) {
      return <FixedCell value={value} locked={live && !!key} />
    }
    const grantRole = who as GridRole
    if (!editable || isFixed(key, grantRole)) {
      return <FixedCell value={value} locked={isFixed(key, grantRole)} />
    }
    const reach = reachOf(working, key, grantRole)
    return (
      <ReachPicker
        capability={key}
        role={grantRole}
        value={reach}
        unsaved={reach !== reachOf(stored, key, grantRole)}
        moved={reach !== ruleFor(key, grantRole).byDefault}
        label={`${c.action} — ${roleLabel(who)}`}
        onChange={(next) => choose(key, grantRole, next)}
        wide={wide}
      />
    )
  }

  const chosen = ROLES.find((r) => r.key === role)!
  const allOpen = open.size === shown.length
  const toggleArea = (area: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(area)) next.delete(area)
      else next.add(area)
      return next
    })

  const actionOf = (key: CapabilityKey) =>
    PERMISSIONS.flatMap((a) => a.capabilities).find((c) => c.key === key)?.action ?? key

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-body-sm text-on-surface-variant">
        {editable ? (
          <>
            Areas marked <span className="font-medium text-on-surface">Editable</span> are the church’s
            to set. The database reads them on every request, so a change holds for everybody — on every
            phone, not only this page — the moment it is saved.
          </>
        ) : (
          <>Areas marked Editable are set by the church’s Admins; the database follows them on every request.</>
        )}{' '}
        A row with no choice is fixed on purpose: what anybody can see, what is your own, and the
        keys to the app itself.
      </p>

      <SegmentedControl
        label="View"
        value={view}
        onChange={setView}
        options={[
          { value: 'role', label: 'One role' },
          { value: 'compare', label: 'Compare all' },
        ]}
        className="self-start"
      />

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
                  className={`tap rounded-full px-4 py-2 text-body-sm transition-colors duration-200 ${
                    role === r.key
                      ? 'bg-primary font-semibold text-on-primary'
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
              Only show what {somebody(chosen.key)} can do
            </label>
          </Tile>

          <div className="flex items-center justify-between px-1">
            <h2 className="text-body-md font-medium text-on-surface">By area</h2>
            <button
              type="button"
              onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map((a) => a.area)))}
              className="tap rounded-full px-2 py-1 text-label-md text-accent-blue-soft hover:text-on-surface"
            >
              {allOpen ? 'Fold all' : 'Open all'}
            </button>
          </div>

          <ul className="flex flex-col gap-2" aria-label={`What ${somebody(chosen.key)} can do`}>
            {shown.map((area) => {
              const live = isLiveArea(area)
              const allowed = area.capabilities.filter((c) => c.can[role] !== 'no').length
              const total = area.capabilities.length
              const isOpen = open.has(area.area)
              // A row this role can be given stays put even at "No":
              // hiding it the moment it is set would take the control with it.
              const settable = (c: Capability) =>
                editable && live && !!c.key && role !== 'owner' && !isFixed(c.key, role as GridRole)
              const rows = onlyAllowed
                ? area.capabilities.filter((c) => c.can[role] !== 'no' || settable(c))
                : area.capabilities
              const panel = `area-${area.area.replace(/[^a-z]+/gi, '-').toLowerCase()}`
              return (
                <li key={area.area}>
                  <Tile padded={false} className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleArea(area.area)}
                      aria-expanded={isOpen}
                      aria-controls={panel}
                      className="tap flex w-full items-center gap-3 px-5 py-4 text-left transition-colors duration-200 hover:bg-raised"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-body-md font-medium text-on-surface">{area.area}</span>
                          <AreaStatus area={area} />
                        </span>
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
                    {isOpen && area.perTeam && (
                      <p className="px-5 pb-2 text-label-sm text-on-surface-faint">{area.perTeam}</p>
                    )}
                    {isOpen && area.about && (
                      <p className="px-5 pb-2 text-label-sm text-on-surface-faint">{area.about}</p>
                    )}
                    {isOpen && area.fixed && (
                      <p className="px-5 pb-2 text-label-sm text-on-surface-faint">{area.fixed}</p>
                    )}
                    {isOpen && (
                      <ul id={panel} className="flex flex-col gap-1 px-3 pb-3">
                        {rows.length === 0 && (
                          <li className="px-2 py-2 text-body-sm text-on-surface-faint">Nothing here for {somebody(chosen.key)}.</li>
                        )}
                        {rows.map((capability) => {
                          const answer = ANSWER[capability.can[role]]
                          const picker = settable(capability)
                          return (
                            <li
                              key={capability.action}
                              className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[var(--radius-row)] px-2 py-2.5 odd:bg-raised"
                            >
                              <span className="min-w-0 flex-1 basis-48">
                                <span
                                  className={`block text-body-sm ${
                                    capability.can[role] === 'no' ? 'text-on-surface-faint' : 'text-on-surface'
                                  }`}
                                >
                                  {capability.action}
                                </span>
                                {capability.note && (capability.can[role] !== 'no' || picker) && (
                                  <span className="mt-0.5 block text-label-sm text-on-surface-faint">
                                    {capability.note}
                                  </span>
                                )}
                              </span>
                              {picker ? (
                                cellFor(capability, role, live, true)
                              ) : (
                                <Pill tone={answer.tone} className="mt-0.5">
                                  {answer.label}
                                </Pill>
                              )}
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
              <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">own / team / all</dt>
              <dd className="min-w-0 flex-1 text-label-sm text-on-surface-variant">
                Only for themselves, only for a team they lead or belong to, or everywhere. Somebody holding
                two profiles gets whichever reaches further.
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-col gap-7">
            {shown.map((area) => {
              const live = isLiveArea(area)
              const editing = live && editable
              // What the church sets comes first; what the app sets is a
              // tap away, so the grid shows choices rather than reference.
              const fixedCount = area.capabilities.filter((c) => !hasChoice(c, live)).length
              const unfolded = showFixed.has(area.area)
              const rows = unfolded ? area.capabilities : area.capabilities.filter((c) => hasChoice(c, live))
              return (
                <section key={area.area}>
                  <h3 className="flex flex-wrap items-center gap-2 font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                    {area.area}
                    <AreaStatus area={area} />
                  </h3>
                  {area.fixed && <p className="mt-1 text-label-sm text-on-surface-faint">{area.fixed}</p>}
                  {area.about && <p className="mt-1 text-label-sm text-on-surface-faint">{area.about}</p>}
                  {/* Nine columns will not fit a phone, and shrinking them to
                      make them fit is how a table becomes unreadable on every
                      device instead of one. It scrolls inside itself — and is
                      positioned, so the hidden "(fixed)" labels scroll with
                      it instead of stretching the page. */}
                  {rows.length > 0 && (
                    <div className="relative mt-2 -mx-2 overflow-x-auto px-2">
                      <table
                        className={`w-full border-collapse text-body-sm ${editing ? 'min-w-[50rem]' : 'min-w-[42rem]'}`}
                      >
                        <thead>
                          <tr>
                            <th className="w-[38%] min-w-48 px-2 pb-2 text-left font-normal text-on-surface-faint">
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
                          {rows.map((capability) => (
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
                                  {cellFor(capability, r.key, live)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {fixedCount > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowFixed((current) => {
                          const next = new Set(current)
                          if (next.has(area.area)) next.delete(area.area)
                          else next.add(area.area)
                          return next
                        })
                      }
                      aria-expanded={unfolded}
                      className="tap mt-2 rounded-full px-2 py-1 text-label-md text-accent-blue-soft hover:text-on-surface"
                    >
                      {unfolded
                        ? 'Hide what the app sets'
                        : `Show ${fixedCount === 1 ? 'one row' : `${fixedCount} rows`} the app sets`}
                    </button>
                  )}
                </section>
              )
            })}
          </div>
        </Tile>
      )}

      {editable && pending.length > 0 && (
        <Tile tone="warning" as="section">
          <h2 className="text-body-md font-medium text-on-surface">
            {pending.length === 1 ? 'One change' : `${pending.length} changes`} to save
          </h2>
          <ul aria-label="Changes to save" className="mt-2 flex flex-col gap-1">
            {pending.map((change) => (
              <li key={`${change.capability}:${change.role}`} className="text-body-sm text-on-surface-variant">
                <span className="font-medium text-on-surface">{roleLabel(change.role)}</span> ·{' '}
                {actionOf(change.capability)}: {REACH_LABEL[reachOf(stored, change.capability, change.role)]} →{' '}
                <span className="font-medium text-on-surface">{change.reach ? REACH_LABEL[change.reach] : 'As the church'}</span>
              </li>
            ))}
          </ul>
        </Tile>
      )}

      {editable && (
        <SaveBar
          changed={pending.length > 0}
          saving={perms.saving}
          saved={saved}
          error={perms.error}
          onSave={() =>
            perms
              .commit()
              .then(() => setSaved(true))
              .catch(() => {})
          }
          onRestore={() => {
            setSaved(false)
            perms.restoreDefaults()
          }}
          label="Save permissions"
        />
      )}

      {/* Said out loud, because a reference that quietly goes stale is
          worse than none: somebody would trust it. */}
      <p className="px-1 text-label-sm text-on-surface-faint">
        The Owner always holds every permission, and every Admin can always change this grid — that is
        how a wrong setting gets put right. The fixed rows were read from the database’s own policies
        on {CHECKED_ON}. Adding a rule later will not update them by itself — if one disagrees with
        what the app does, the app is right and this needs correcting.
      </p>
    </div>
  )
}
