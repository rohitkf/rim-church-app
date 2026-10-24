import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useNavNames } from '../lib/navNames'
import { useQuery } from '@tanstack/react-query'
import { useAppSettings } from '../lib/appSettings'
import { ACCESS_LEVELS, PAGE_RULES, compactAccess, levelOf, type AccessLevel, type PageAccess } from '../lib/pageAccess'
import { ROLES, isLiveArea, withGrants, withPageAccess, type Capability, type RoleKey } from '../lib/permissionMatrix'
import { REACH_LABEL, isFixed, reachOf, ruleFor, teamChoice, type CapabilityKey, type GrantRole } from '../lib/permissions'
import { PAGE_ROOMS, SETTINGS_PAGES, capabilitiesFor, pageForSlug, pageSlug, teamRows, type SettingsPage } from '../lib/pageSettings'
import { SETTINGS_CATALOG, columnsOf, settingsForPage } from '../lib/settingsCatalog'
import { usePermissionDraft } from '../lib/usePermissionDraft'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { fetchDepartments } from '../lib/queries'
import type { AppSettings } from '../lib/appSettings'
import { Chevron } from './Collapsible'
import { ChevronRightIcon } from './icons'
import { PageTeamAccess } from './PageTeamAccess'
import { FixedCell, ReachPicker, roleLabel } from './PermissionsCard'
import { QueryState } from './QueryState'
import { SaveBar, SettingList } from './SettingRows'
import { SettingEntries } from './SettingEntry'
import { Eyebrow, IconBadge, Pill, SegmentedControl, Tile, type BadgeTone } from './Surface'

/**
 * Settings › Page by Page.
 *
 * One section per page of the app, in the menu's order, with everything
 * the church can set about it in one place: the settings that move it
 * (its clocks, its windows, what it keeps), who may open it, what each
 * team's profiles may do on it — a team at a time, then a profile — and
 * the church-wide rule every team follows unless it sets its own.
 *
 * The settings are the catalog's rows (lib/settingsCatalog), the same
 * ones the Timings, Dashboard & Lists and Data & Retention rooms draw, so
 * a setting reads the same here as there. The rules are the grid's
 * (lib/permissionMatrix), read by the database on every request. One
 * draft, one Save: nothing changes for anybody until it is pressed.
 */

/** Every column the catalog writes, and who may open each page. */
const ALL_KEYS = [...columnsOf(SETTINGS_CATALOG), 'page_access'] as (keyof AppSettings)[]

const TONES: Record<string, BadgeTone> = {
  Home: 'blue',
  Sunday: 'blue',
  'After the service': 'orange',
  Talk: 'indigo',
  'Church life': 'green',
  'People & things': 'neutral',
  Everywhere: 'indigo',
}

const short = (level: AccessLevel) => ACCESS_LEVELS.find((l) => l.value === level)?.short ?? level
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function PagesCard() {
  const settings = useAppSettings()
  const room = useSettingsDraft(ALL_KEYS)
  const perms = usePermissionDraft()
  const { editable, working, stored, storedTeams, pending } = perms
  const departments = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const { hash } = useLocation()

  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [openTeams, setOpenTeams] = useState<Set<string>>(() => new Set())
  const [saved, setSaved] = useState(false)

  // `#rota` opens the Team Rota section and scrolls to it, so a page can
  // be linked to rather than described.
  useEffect(() => {
    const page = pageForSlug(hash.replace(/^#/, ''))
    if (!page) return
    setOpen((s) => new Set(s).add(page.to))
    window.requestAnimationFrame(() => document.getElementById(`page-${pageSlug(page.to)}`)?.scrollIntoView?.({ block: 'start' }))
  }, [hash])

  const draft = room.draft
  const storedRow = room.query.data ?? {}
  const access = (draft?.page_access ?? {}) as PageAccess
  // Issues opens to whoever may raise one, so a change to that here
  // relights its row before it is saved, like any other choice.
  const scope = draft?.issues_raise_scope ?? settings.issues_raise_scope
  const areas = useMemo(() => withGrants(withPageAccess(access, scope), working), [access, scope, working])

  const toggleIn = (set: (f: (s: Set<string>) => Set<string>) => void, id: string) =>
    set((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allOpen = open.size === SETTINGS_PAGES.length

  const changedSettings = useMemo(
    () => (draft ? SETTINGS_CATALOG.filter((e) => !same(e.get(draft), e.get(storedRow))) : []),
    [draft, storedRow],
  )
  const accessChanged = !!draft && !same(draft.page_access, (storedRow as Partial<AppSettings>).page_access ?? {})
  const changed = pending.length > 0 || room.changed
  const teamName = (id: string) => departments.data?.find((d) => d.id === id)?.name ?? 'that team'
  const actionOf = (key: CapabilityKey) => areas.flatMap((a) => a.capabilities).find((c) => c.key === key)?.action ?? key

  const saveAll = async () => {
    setSaved(false)
    try {
      await perms.commit()
    } catch {
      return
    }
    if (room.changed) room.save()
    setSaved(true)
  }

  /** The church's cell for one row and one profile. */
  const cellFor = (c: Capability, who: RoleKey, live: boolean) => {
    const value = c.can[who]
    const key = c.key
    if (!key || who === 'owner' || !live) return <FixedCell value={value} locked={live && !!key} />
    const role = who as GrantRole
    if (!editable || isFixed(key, role)) return <FixedCell value={value} locked={isFixed(key, role)} />
    const reach = reachOf(working, key, role)
    return (
      <ReachPicker
        capability={key}
        role={role}
        value={reach}
        unsaved={reach !== reachOf(stored, key, role)}
        moved={reach !== ruleFor(key, role).byDefault}
        label={`${c.action} — ${roleLabel(who)}`}
        onChange={(next) => {
          setSaved(false)
          perms.chooseChurch(key, role, next)
        }}
      />
    )
  }

  const groups = [...new Set(SETTINGS_PAGES.map((p) => p.group))]

  return (
    <QueryState isLoading={room.query.isLoading} error={room.query.error}>
      {draft && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3 px-1">
            <p className="text-body-sm text-on-surface-variant">
              Every page, with everything the church can set about it: its clocks and windows, who can open
              it, and what each team’s Heads and members may do on it. Nothing changes for anybody until Save.
            </p>
            <button
              type="button"
              onClick={() => setOpen(allOpen ? new Set() : new Set(SETTINGS_PAGES.map((p) => p.to)))}
              className="tap shrink-0 rounded-full px-2 py-1 text-label-md text-accent-blue-soft hover:text-on-surface"
            >
              {allOpen ? 'Fold all' : 'Open all'}
            </button>
          </div>

          {groups.map((group) => (
            <section key={group} aria-label={group}>
              <h2 className="px-2">
                <Eyebrow>{group}</Eyebrow>
              </h2>
              <ul className="mt-2 flex flex-col gap-2">
                {SETTINGS_PAGES.filter((p) => p.group === group).map((page) => (
                  <PageSection
                    key={page.to}
                    page={page}
                    open={open.has(page.to)}
                    onToggle={() => toggleIn(setOpen, page.to)}
                    entries={settingsForPage(page.to)}
                    areas={capabilitiesFor(areas, page.to)}
                    draft={draft}
                    stored={storedRow}
                    set={(patch) => {
                      setSaved(false)
                      for (const [key, value] of Object.entries(patch)) room.set(key as keyof AppSettings, value as never)
                    }}
                    openRow={openRow}
                    onToggleRow={(id) => setOpenRow((cur) => (cur === id ? null : id))}
                    level={levelOf(page.to, access, scope)}
                    chooseOpen={(key, level) => {
                      setSaved(false)
                      room.set('page_access', compactAccess({ ...access, [key]: level }) as Record<string, string>)
                    }}
                    editable={editable}
                    teams={departments.data ?? []}
                    openTeams={openTeams}
                    onToggleTeam={(dept) => toggleIn(setOpenTeams, `${page.to}:${dept}`)}
                    perms={perms}
                    cellFor={cellFor}
                    onSaved={() => setSaved(false)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {editable && changed && (
            <Tile tone="warning" as="section">
              <h2 className="text-body-md font-medium text-on-surface">
                {pending.length + changedSettings.length + (accessChanged ? 1 : 0) === 1
                  ? 'One change'
                  : `${pending.length + changedSettings.length + (accessChanged ? 1 : 0)} changes`}{' '}
                to save
              </h2>
              <ul aria-label="Changes to save" className="mt-2 flex flex-col gap-1">
                {changedSettings.map((e) => (
                  <li key={e.id} className="text-body-sm text-on-surface-variant">
                    <span className="font-medium text-on-surface">{e.label}</span>
                  </li>
                ))}
                {accessChanged && <li className="text-body-sm text-on-surface-variant">Who can open which pages</li>}
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
              </ul>
            </Tile>
          )}

          {editable && (
            <SaveBar
              changed={changed}
              saving={perms.saving || room.saving}
              saved={(saved || room.saved) && !changed}
              error={perms.error ?? room.error}
              onSave={saveAll}
              label="Save"
            />
          )}

          <p className="px-1 text-label-sm text-on-surface-faint">
            The Owner always holds every permission, and every Admin can always change these — that is how a
            wrong setting gets put right. A team’s own rule reaches no wider than the team; “Everywhere” stays the
            church’s to give.
          </p>
        </div>
      )}
    </QueryState>
  )
}

function PageSection({
  page,
  open,
  onToggle,
  entries,
  areas,
  draft,
  stored,
  set,
  openRow,
  onToggleRow,
  level,
  chooseOpen,
  editable,
  teams,
  openTeams,
  onToggleTeam,
  perms,
  cellFor,
  onSaved,
}: {
  page: SettingsPage
  open: boolean
  onToggle: () => void
  entries: ReturnType<typeof settingsForPage>
  areas: ReturnType<typeof capabilitiesFor>
  draft: Partial<AppSettings>
  stored: Partial<AppSettings>
  set: (patch: Partial<AppSettings>) => void
  openRow: string | null
  onToggleRow: (id: string) => void
  level: AccessLevel
  chooseOpen: (key: string, level: AccessLevel) => void
  editable: boolean
  teams: { id: string; name: string; color: string | null }[]
  openTeams: Set<string>
  onToggleTeam: (dept: string) => void
  perms: ReturnType<typeof usePermissionDraft>
  cellFor: (c: Capability, who: RoleKey, live: boolean) => ReactNode
  onSaved: () => void
}) {
  // The name the church gave the page in Settings › Menu, with the app's
  // own under it so the page can still be told apart.
  const renamed = useNavNames()[page.to]
  const label = renamed ?? page.label
  const rule = PAGE_RULES[page.to]
  const rooms = PAGE_ROOMS[page.to] ?? []
  const rows = teamRows(areas)
  const rules = areas.flatMap((a) => a.capabilities).filter((c) => c.key).length
  const panel = `page-${pageSlug(page.to)}`
  const openHere = new Set([...openTeams].filter((k) => k.startsWith(`${page.to}:`)).map((k) => k.slice(page.to.length + 1)))

  const meta = [
    entries.length > 0 ? `${entries.length} ${entries.length === 1 ? 'setting' : 'settings'}` : null,
    rules > 0 ? `${rules} ${rules === 1 ? 'rule' : 'rules'}` : null,
    rule ? `opens to ${short(level)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li id={panel}>
      <Tile padded={false} className="scroll-mt-24 overflow-hidden">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${panel}-body`}
          className="tap flex w-full items-center gap-3 px-5 py-4 text-left transition-colors duration-200 hover:bg-raised"
        >
          <IconBadge icon={page.icon as ComponentType<{ className?: string; width?: number; height?: number }>} tone={TONES[page.group] ?? 'blue'} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-body-md font-medium text-on-surface">{label}</span>
            {renamed && renamed !== page.label && (
              <span className="block text-label-sm text-on-surface-faint">was {page.label}</span>
            )}
            <span className="mt-0.5 block text-label-md text-on-surface-faint">{meta || 'Nothing to set'}</span>
          </span>
          <Chevron open={open} />
        </button>

        {open && (
          <div id={`${panel}-body`} className="flex flex-col gap-5 px-5 pb-5">
            {/* An Admin's room: somebody who may only read the rules is shown the rules. */}
            {editable && (entries.length > 0 || rooms.length > 0) && (
              <section>
                <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">Settings</h3>
                {entries.length > 0 && (
                  <div className="mt-1">
                    <SettingList>
                      <SettingEntries entries={entries} draft={draft} stored={stored} set={set} open={openRow} onToggle={onToggleRow} />
                    </SettingList>
                  </div>
                )}
                {rooms.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1.5" aria-label="Also in Settings">
                    {rooms.map((r) => (
                      <li key={r.to}>
                        <Link
                          to={r.to}
                          className="group/room flex items-center gap-3 rounded-[var(--radius-row)] bg-raised px-3.5 py-2.5 transition-colors duration-200 hover:bg-raised-strong"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-body-sm font-medium text-on-surface">Settings › {r.label}</span>
                            <span className="block text-label-md text-on-surface-variant">{r.blurb}</span>
                          </span>
                          <ChevronRightIcon
                            width={16}
                            height={16}
                            aria-hidden="true"
                            className="shrink-0 text-on-surface-faint transition-transform duration-300 group-hover/room:translate-x-0.5"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {rule && (
              <section>
                <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">Who can open it</h3>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  {editable && rule.choices.length > 1 && rule.key ? (
                    <SegmentedControl
                      label={`Who can open ${label}`}
                      value={level}
                      onChange={(choice) => chooseOpen(rule.key!, choice)}
                      options={rule.choices.map((choice) => ({ value: choice, label: short(choice) }))}
                      className="w-fit"
                    />
                  ) : (
                    <span className="rounded-full bg-raised px-3 py-1.5 font-mono text-label-md text-on-surface-variant">{short(level)}</span>
                  )}
                  <p className="min-w-0 flex-1 basis-56 text-label-md text-on-surface-faint">{rule.note}</p>
                </div>
              </section>
            )}

            {rows.length > 0 && teams.length > 0 && (
              <PageTeamAccess
                rows={rows}
                teams={teams}
                editable={editable}
                working={perms.working}
                workingTeams={perms.workingTeams}
                storedTeams={perms.storedTeams}
                onChoose={(dept, cap, role, reach) => {
                  onSaved()
                  perms.chooseTeam(dept, cap, role, reach)
                }}
                open={openHere}
                onToggle={onToggleTeam}
              />
            )}

            {areas.length > 0 && (
              <section>
                <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                  {rows.length > 0 ? 'For every team — the church’s rule' : 'Who may do what'}
                </h3>
                <p className="mt-1 text-label-md text-on-surface-faint">
                  {rows.length > 0
                    ? 'What a team follows unless it sets its own above, and what a new team starts with. Admins and Church Members are only here.'
                    : 'Set once for the whole church.'}
                </p>
                {areas.map((area) => {
                  const live = isLiveArea(area)
                  return (
                    <div key={area.area} className="mt-3">
                      {areas.length > 1 && (
                        <h4 className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-on-surface">
                          {area.area}
                          {!live && <Pill tone="neutral">Fixed</Pill>}
                        </h4>
                      )}
                      {area.fixed && <p className="mt-1 text-label-sm text-on-surface-faint">{area.fixed}</p>}
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
                                  {capability.note && <span className="mt-0.5 block text-label-sm text-on-surface-faint">{capability.note}</span>}
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
                    </div>
                  )
                })}
              </section>
            )}
          </div>
        )}
      </Tile>
    </li>
  )
}
