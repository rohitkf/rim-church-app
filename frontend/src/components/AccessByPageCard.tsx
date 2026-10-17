import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { NAV_ITEMS } from '../lib/navItems'
import { SERVING_TABS } from '../lib/serving'
import { ACCESS_LEVELS, PAGE_RULES, compactAccess, levelOf, type AccessLevel, type PageAccess } from '../lib/pageAccess'
import { ROLES, isEditable, isLiveArea, withGrants, type Capability, type PermissionArea, type RoleKey } from '../lib/permissionMatrix'
import {
  REACH_LABEL,
  REACH_SHORT,
  changesBetween,
  defaultsOver,
  isFixed,
  isTeamSettable,
  reachOf,
  ruleFor,
  teamChangesBetween,
  teamChoice,
  teamReaches,
  type CapabilityKey,
  type GrantRole,
  type Overrides,
  type PermissionChange,
  type Reach,
  type TeamOverrides,
} from '../lib/permissions'
import { usePermissions } from '../lib/usePermissions'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { useAppSettings } from '../lib/appSettings'
import { fetchDepartments } from '../lib/queries'
import { supabase } from '../lib/supabaseClient'
import { useErrorText } from '../lib/useErrorText'
import { Pill, Tile } from './Surface'
import { Chevron } from './Collapsible'
import { SaveBar } from './SettingRows'
import { FixedCell, LockGlyph, ReachPicker, roleLabel } from './PermissionsCard'

/**
 * Access, a page at a time.
 *
 * The question an Admin brings is usually about a page: "who should be
 * able to change answers on Serving?" So each page (each area of the app)
 * is a section here with everything about it in one place — who can open
 * it, what each profile may do on it, with the note that says what each
 * row means — and the controls right there.
 *
 * At the top, whose rules: the whole church, or one team (0162). With a
 * team picked, the cells a team may set for itself show that team's
 * choice — "As the church" until it chooses — and the rest are read-only
 * reminders of the church's rule. A team's rule can reach no wider than
 * the team; "Everywhere" stays the church's to give.
 *
 * Both the church's cells and the teams' are one draft, saved together;
 * who can open a page is saved alongside, since it lives in App settings.
 */

/** The pages each area is about, by their addresses in the menu. */
const AREA_PAGES: Record<string, string[]> = {
  'Services & planning': ['/service-planner', '/events'],
  'Team rota': ['/rota'],
  'Teams & roles': ['/departments'],
  'On the day': ['/checklists'],
  Availability: ['/availability'],
  Inventory: ['/inventory'],
  'Messages, polls & updates': ['/messages', '/team-chat', '/updates', '/polls'],
  Issues: [],
  'Set lists': ['/set-lists'],
  'After the service': ['/debriefs'],
  Giving: ['/giving'],
  People: ['/volunteers'],
  'Stage layout': ['/stage'],
  Feedback: ['/feedback'],
  'The app itself': [],
}

/** A page's name as the menu says it — "Serving · Availability" for a tab of Serving. */
function pageLabel(to: string): string {
  const tab = SERVING_TABS.find((t) => t.to === to)
  if (tab) {
    const serving = NAV_ITEMS.find((i) => i.tabs?.includes(to))
    return `${serving?.label ?? 'Serving'} · ${tab.label}`
  }
  return NAV_ITEMS.find((i) => i.to === to)?.label ?? to
}

const short = (level: AccessLevel) => ACCESS_LEVELS.find((l) => l.value === level)?.short ?? level

/** One team cell: the team's own choice, or the church's rule it follows. */
function TeamCellPicker({
  capability,
  role,
  value,
  church,
  unsaved,
  label,
  onChange,
}: {
  capability: CapabilityKey
  role: GrantRole
  /** The team's own choice, or null for "as the church". */
  value: Reach | null
  church: Reach
  unsaved: boolean
  label: string
  onChange: (next: Reach | null) => void
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as Reach | null)}
        className={`tap cursor-pointer rounded-full bg-raised py-1 pl-2.5 pr-1 text-label-md text-on-surface hairline transition-shadow duration-300 hover:bg-raised-strong ${
          unsaved ? 'outline-2 outline-offset-2 outline-accent-orange' : ''
        }`}
      >
        <option value="">As the church ({REACH_SHORT[church]})</option>
        {teamReaches(capability, role).map((reach) => (
          <option key={reach} value={reach}>
            {REACH_SHORT[reach]}
          </option>
        ))}
      </select>
      {value && (
        <span
          aria-label="This team’s own rule"
          title="This team’s own rule"
          className="h-2 w-2 shrink-0 rounded-full bg-accent-blue"
        />
      )}
    </span>
  )
}

export function AccessByPageCard({ areas }: { areas: PermissionArea[] }) {
  const { can, overrides: stored, teams: storedTeams } = usePermissions()
  const editable = can('app.permissions')
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const settings = useAppSettings()
  const room = useSettingsDraft(['page_access'] as const)

  const departments = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const [team, setTeam] = useState<string>('')
  const [open, setOpen] = useState<Set<string>>(() => new Set())

  // The church's changes and the teams' as they would be after Save. Null
  // until touched, so a save from another Admin redraws this page.
  const [draft, setDraft] = useState<Overrides | null>(null)
  const [teamDraft, setTeamDraft] = useState<TeamOverrides | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const working = draft ?? stored
  const workingTeams = teamDraft ?? storedTeams
  const pending = useMemo(
    () => [...changesBetween(stored, working), ...teamChangesBetween(storedTeams, workingTeams)],
    [stored, working, storedTeams, workingTeams],
  )
  const shown = useMemo(() => withGrants(areas, working), [areas, working])

  const access = (room.draft?.page_access ?? {}) as PageAccess
  const chooseOpen = (key: string, level: AccessLevel) =>
    room.set('page_access', compactAccess({ ...access, [key]: level }) as Record<string, string>)

  const save = useMutation({
    mutationFn: async (changes: PermissionChange[]) => {
      if (changes.length > 0) {
        const { error } = await supabase.rpc('set_permissions', { p_changes: changes })
        if (error) throw error
      }
      if (room.changed) await room.save()
    },
    onSuccess: async () => {
      setError(null)
      setSaved(true)
      await queryClient.invalidateQueries()
      setDraft(null)
      setTeamDraft(null)
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save the permissions.')),
  })

  const chooseChurch = (capability: CapabilityKey, who: GrantRole, reach: Reach) => {
    setSaved(false)
    setDraft((d) => {
      const base = d ?? stored
      return { ...base, [capability]: { ...base[capability], [who]: reach } }
    })
  }
  const chooseTeam = (capability: CapabilityKey, who: GrantRole, reach: Reach | null) => {
    setSaved(false)
    setTeamDraft((d) => {
      const base = d ?? storedTeams
      const mine = { ...(base[team] ?? {}) }
      const cell = { ...(mine[capability] ?? {}) }
      if (reach) cell[who] = reach
      else delete cell[who]
      mine[capability] = cell
      return { ...base, [team]: mine }
    })
  }

  const teamName = (id: string) => departments.data?.find((d) => d.id === id)?.name ?? 'that team'

  /** The cell for one row and one profile: the church's, or the picked team's. */
  const cellFor = (c: Capability, who: RoleKey, live: boolean) => {
    const value = c.can[who]
    const key = c.key
    if (!key || who === 'owner' || !live) return <FixedCell value={value} locked={live && !!key} />
    const role = who as GrantRole
    if (!editable) return <FixedCell value={value} locked={isFixed(key, role)} />
    if (team) {
      if (!isTeamSettable(key, role)) return <FixedCell value={value} locked />
      return (
        <TeamCellPicker
          capability={key}
          role={role}
          value={teamChoice(workingTeams, team, key, role)}
          church={reachOf(working, key, role)}
          unsaved={teamChoice(workingTeams, team, key, role) !== teamChoice(storedTeams, team, key, role)}
          label={`${c.action} — ${roleLabel(who)} on ${teamName(team)}`}
          onChange={(next) => chooseTeam(key, role, next)}
        />
      )
    }
    if (isFixed(key, role)) return <FixedCell value={value} locked />
    const reach = reachOf(working, key, role)
    return (
      <ReachPicker
        capability={key}
        role={role}
        value={reach}
        unsaved={reach !== reachOf(stored, key, role)}
        moved={reach !== ruleFor(key, role).byDefault}
        label={`${c.action} — ${roleLabel(who)}`}
        onChange={(next) => chooseChurch(key, role, next)}
      />
    )
  }

  const toggle = (area: string) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(area)) next.delete(area)
      else next.add(area)
      return next
    })
  const allOpen = open.size === shown.length

  const actionOf = (key: CapabilityKey) =>
    areas.flatMap((a) => a.capabilities).find((c) => c.key === key)?.action ?? key

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-body-sm text-on-surface-variant">
        One section per page: who can open it, and what each profile may do on it. The database reads
        every cell on every request, so a change holds for everybody the moment it is saved.
      </p>

      {editable && (
        <Tile>
          <label className="flex flex-wrap items-center gap-3 text-body-sm text-on-surface">
            <span className="font-medium">Whose rules</span>
            <select
              aria-label="Whose rules"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              className="tap cursor-pointer rounded-full bg-raised py-1.5 pl-3 pr-2 text-body-sm text-on-surface hairline hover:bg-raised-strong"
            >
              <option value="">The whole church</option>
              {(departments.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-label-md text-on-surface-faint">
            {team ? (
              <>
                {teamName(team)}’s own rules. A cell left “As the church” follows the church-wide rule; a
                team’s own rule reaches no wider than the team. Admins and the Owner are the church’s,
                whatever a team says.
              </>
            ) : (
              <>The rules for every team. Pick a team to give it rules of its own — who may change answers on Worship, say.</>
            )}
          </p>
        </Tile>
      )}

      <div className="flex items-center justify-between px-1">
        <h2 className="text-body-md font-medium text-on-surface">By page</h2>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map((a) => a.area)))}
          className="tap rounded-full px-2 py-1 text-label-md text-accent-blue-soft hover:text-on-surface"
        >
          {allOpen ? 'Fold all' : 'Open all'}
        </button>
      </div>

      <ul className="flex flex-col gap-2" aria-label="Pages">
        {shown.map((area) => {
          const live = isLiveArea(area)
          const isOpen = open.has(area.area)
          const pages = (AREA_PAGES[area.area] ?? []).map((to) => ({ to, rule: PAGE_RULES[to] })).filter((p) => p.rule)
          const panel = `page-${area.area.replace(/[^a-z]+/gi, '-').toLowerCase()}`
          const settable = area.capabilities.filter((c) => c.key && isEditable(c)).length
          return (
            <li key={area.area}>
              <Tile padded={false} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(area.area)}
                  aria-expanded={isOpen}
                  aria-controls={panel}
                  className="tap flex w-full items-center gap-3 px-5 py-4 text-left transition-colors duration-300 hover:bg-raised"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-body-md font-medium text-on-surface">{area.area}</span>
                      {live ? (
                        <Pill tone="green">Editable</Pill>
                      ) : (
                        <Pill tone="neutral">
                          <LockGlyph />
                          Fixed
                        </Pill>
                      )}
                    </span>
                    {pages.length > 0 && (
                      <span className="mt-1 block text-label-md text-on-surface-faint">
                        {pages.map((p) => pageLabel(p.to)).join(' · ')}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-label-sm tabular text-on-surface-variant">
                    {settable} {settable === 1 ? 'rule' : 'rules'}
                  </span>
                  <Chevron open={isOpen} />
                </button>

                {isOpen && (
                  <div id={panel} className="flex flex-col gap-4 px-5 pb-5">
                    {area.fixed && <p className="text-label-sm text-on-surface-faint">{area.fixed}</p>}

                    {pages.length > 0 && (
                      <section>
                        <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">Who can open it</h3>
                        <ul className="mt-2 flex flex-col divide-y divide-border-subtle">
                          {pages.map(({ to, rule }) => {
                            const level = levelOf(to, access, settings.issues_raise_scope)
                            const choosable = editable && !team && rule.choices.length > 1 && !!rule.key && !!room.draft
                            return (
                              <li key={to} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                  <span className="min-w-0 flex-1 basis-40 text-body-sm font-medium text-on-surface">{pageLabel(to)}</span>
                                  {choosable ? (
                                    <div role="radiogroup" aria-label={`Who can open ${pageLabel(to)}`} className="flex gap-1 rounded-full bg-inset p-1 hairline">
                                      {rule.choices.map((choice) => (
                                        <button
                                          key={choice}
                                          type="button"
                                          role="radio"
                                          aria-checked={level === choice}
                                          onClick={() => chooseOpen(rule.key!, choice)}
                                          className={`tap rounded-full px-3 py-1.5 text-label-md transition-colors duration-300 ${
                                            level === choice ? 'bg-primary font-medium text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
                                          }`}
                                        >
                                          {short(choice)}
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="rounded-full bg-raised px-3 py-1.5 font-mono text-label-md text-on-surface-variant">{short(level)}</span>
                                  )}
                                </div>
                                <p className="text-label-md text-on-surface-faint">{rule.note}</p>
                              </li>
                            )
                          })}
                        </ul>
                        {team && <p className="mt-2 text-label-sm text-on-surface-faint">Who can open a page is the church’s rule, not a team’s.</p>}
                      </section>
                    )}

                    <section>
                      <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                        {team ? `What each profile may do — ${teamName(team)}` : 'What each profile may do'}
                      </h3>
                      {/* Seven columns will not fit a phone; it scrolls inside itself. */}
                      <div className="relative mt-2 -mx-2 overflow-x-auto px-2">
                        <table className="w-full min-w-[44rem] border-collapse text-body-sm">
                          <thead>
                            <tr>
                              <th className="w-[34%] min-w-48 px-2 pb-2 text-left font-normal text-on-surface-faint">
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
                                    <span className="mt-0.5 block text-label-sm text-on-surface-faint">{capability.note}</span>
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
                    </section>
                  </div>
                )}
              </Tile>
            </li>
          )
        })}
      </ul>

      {editable && (pending.length > 0 || room.changed) && (
        <Tile tone="warning" as="section">
          <h2 className="text-body-md font-medium text-on-surface">
            {pending.length + (room.changed ? 1 : 0) === 1 ? 'One change' : `${pending.length + (room.changed ? 1 : 0)} changes`} to save
          </h2>
          <ul aria-label="Changes to save" className="mt-2 flex flex-col gap-1">
            {pending.map((change) => (
              <li key={`${change.department ?? 'church'}:${change.capability}:${change.role}`} className="text-body-sm text-on-surface-variant">
                {change.department && <span className="font-medium text-on-surface">{teamName(change.department)} · </span>}
                <span className="font-medium text-on-surface">{roleLabel(change.role)}</span> · {actionOf(change.capability)}:{' '}
                {change.department
                  ? `${teamChoice(storedTeams, change.department, change.capability, change.role) ? REACH_LABEL[teamChoice(storedTeams, change.department, change.capability, change.role)!] : 'As the church'} → `
                  : `${REACH_LABEL[reachOf(stored, change.capability, change.role)]} → `}
                <span className="font-medium text-on-surface">{change.reach ? REACH_LABEL[change.reach] : 'As the church'}</span>
              </li>
            ))}
            {room.changed && <li className="text-body-sm text-on-surface-variant">Who can open which pages</li>}
          </ul>
        </Tile>
      )}

      {editable && (
        <SaveBar
          changed={pending.length > 0 || room.changed}
          saving={save.isPending || room.saving}
          saved={saved}
          error={error ?? room.error}
          onSave={() => save.mutate(pending)}
          onRestore={() => {
            setSaved(false)
            setDraft(defaultsOver(stored))
            // Every team back to the church's rules.
            setTeamDraft(Object.fromEntries(Object.keys(storedTeams).map((id) => [id, {}])))
            room.set('page_access', {})
          }}
          label="Save access"
        />
      )}

      <p className="px-1 text-label-sm text-on-surface-faint">
        The Owner always holds every permission, and every Admin can always change this — that is how
        a wrong setting gets put right. Head and Assisting Head are two columns since October 2026, given
        the same out of the box; a fixed row reads the two as one.
      </p>
    </div>
  )
}
