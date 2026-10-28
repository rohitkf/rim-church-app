import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAppSettings } from '../lib/appSettings'
import { fetchDepartments } from '../lib/queries'
import { fetchEveryonesFacts, type PersonEntry } from '../lib/peopleFacts'
import { SETTINGS_PAGES, capabilitiesFor, pageSlug, teamRows } from '../lib/pageSettings'
import { PERMISSIONS, withPageAccess, type Capability } from '../lib/permissionMatrix'
import { usePageLevels } from '../lib/usePageLevels'
import { PERMISSIONS_KEY, usePermissions } from '../lib/usePermissions'
import {
  REACH_SHORT,
  TEAM_ROLES,
  grantIsValid,
  grantableCapabilities,
  isTeamSettable,
  reachOn,
  teamChoice,
  type CapabilityKey,
  type GrantReach,
  type PermissionGrant,
} from '../lib/permissions'
import { ROLE_NAME, ROLE_SHORT } from '../lib/roleNames'
import { useErrorText } from '../lib/useErrorText'
import { Chevron } from './Collapsible'
import { QueryState } from './QueryState'
import { Select } from './Select'
import { Switch } from './SettingRows'
import { ActionButton, Pill, SectionTile } from './Surface'
import { GrantEffects } from './GrantEffects'
import { DateField } from './DateTimeFields'
import { earliestUntilDay, formatUntil, untilFromDay } from '../lib/grantUntil'

/**
 * Settings › Access › By team: one team's whole answer. Who is on it, what
 * its Heads and people may do on it page by page — the church's rule, or
 * the team's own (0162) — and what the team has been given beyond that
 * (grants, 0208), which is also where a team is given one thing more, or
 * has it taken back.
 *
 * A team's own rules are changed where they live, on the page's section
 * of Page by Page; each page here links there. A team's grants have no
 * other home for most actions (Clock in, Prayer and Stage Layout keep
 * lists of their own for theirs), so this is theirs.
 */

const actionOf = (key: string) => PERMISSIONS.flatMap((a) => a.capabilities).find((c) => c.key === key)?.action ?? key

const REACH_WORDS: Record<GrantReach, string> = { team: 'On this team', all: 'Everywhere' }

export function TeamAccessCard() {
  const settings = useAppSettings()
  const levels = usePageLevels()
  const { overrides, teams: teamRules, grants = [], can } = usePermissions()
  const editable = can('app.permissions')
  // The team lives in the address, so a link can open its answer.
  const [params, setParams] = useSearchParams()
  const teamId = params.get('team') ?? ''
  const setTeamId = (id: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        n.set('tab', 'team')
        if (id) n.set('team', id)
        else n.delete('team')
        return n
      },
      { replace: true },
    )

  const teams = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const people = useQuery({ queryKey: ['everyone-access'], queryFn: fetchEveryonesFacts, enabled: !!teamId, staleTime: 60_000 })
  const team = (teams.data ?? []).find((t) => t.id === teamId)
  const name = team?.name ?? ''

  const areas = useMemo(
    () => withPageAccess(levels, settings.issues_raise_scope, settings.overwatch_pages),
    [levels, settings.issues_raise_scope, settings.overwatch_pages],
  )
  // Every page with a rule a team can set for itself, in the menu's order.
  const pages = useMemo(
    () =>
      SETTINGS_PAGES.filter((p) => p.to.startsWith('/'))
        .map((page) => ({ page, rows: teamRows(capabilitiesFor(areas, page.to)) }))
        .filter(({ rows }) => rows.length > 0),
    [areas],
  )
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const toggle = (to: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(to)) n.delete(to)
      else n.add(to)
      return n
    })

  const onTeam = (p: PersonEntry) =>
    p.facts.headTeams.includes(teamId) || p.facts.assistTeams.includes(teamId) || p.facts.memberTeams.includes(teamId)
  const members = (people.data ?? []).filter(onTeam)
  const heads = members.filter((p) => p.facts.headTeams.includes(teamId))
  const assistants = members.filter((p) => p.facts.assistTeams.includes(teamId))
  const roster = members.filter((p) => p.facts.memberTeams.includes(teamId))

  const ownRules = pages.reduce(
    (n, { rows }) => n + rows.reduce((m, c) => m + TEAM_ROLES.filter((r) => teamChoice(teamRules, teamId, c.key!, r) !== null).length, 0),
    0,
  )

  const personLink = (p: PersonEntry) => (
    <Link
      key={p.id}
      to={`/settings/access?tab=person&person=${p.id}`}
      className="rounded-full bg-raised px-3 py-1 font-mono text-label-sm uppercase tracking-wide text-accent-blue-soft hover:text-on-surface"
    >
      {p.name}
    </Link>
  )

  return (
    <div className="flex flex-col gap-4">
      <SectionTile
        title="Which team?"
        hint="Who is on it, what they may do on it, and what the team has been given beyond that."
      >
        <QueryState isLoading={teams.isLoading} error={teams.error}>
          <Select
            aria-label="Team"
            placeholder="Choose a team…"
            value={teamId}
            onChange={setTeamId}
            options={(teams.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          />
        </QueryState>
        {teamId && (
          <QueryState isLoading={people.isLoading} error={people.error}>
            <dl aria-label={`Who is on ${name}`} className="mt-4 flex flex-col gap-2">
              {[
                [ROLE_NAME.head, heads],
                [ROLE_NAME.assistant, assistants],
                [ROLE_NAME.member, roster],
              ].map(([label, list]) => (
                <div key={label as string} className="flex flex-wrap items-center gap-2">
                  <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                    {label as string} · {(list as PersonEntry[]).length}
                  </dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {(list as PersonEntry[]).length === 0 ? (
                      <span className="text-label-sm text-on-surface-faint">nobody</span>
                    ) : (
                      (list as PersonEntry[]).map(personLink)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-label-md text-on-surface-faint">
              To change who is on it, open{' '}
              <Link to={`/departments/${teamId}`} className="text-accent-blue-soft hover:text-on-surface">
                Teams
              </Link>
              .
            </p>
          </QueryState>
        )}
      </SectionTile>

      {teamId && (
        <>
          <SectionTile
            title="What its people may do on it"
            hint="Page by page: the church’s rule, or the team’s own where it set one. Change either on the page’s section of Page by Page."
          >
            <p className="mb-3 font-mono text-label-sm text-on-surface-faint" data-testid="team-own-rules">
              {name} has {ownRules === 0 ? 'no rules of its own' : ownRules === 1 ? 'one rule of its own' : `${ownRules} rules of its own`}.
            </p>
            <ul aria-label={`What ${name}’s people may do`} className="flex flex-col gap-2">
              {pages.map(({ page, rows }) => {
                const roles = TEAM_ROLES.filter((role) => rows.some((c) => isTeamSettable(c.key!, role)))
                const own = rows.some((c) => roles.some((r) => teamChoice(teamRules, teamId, c.key!, r) !== null))
                const isOpen = open.has(page.to)
                const summary = roles
                  .map((role) => {
                    const settable = rows.filter((c) => isTeamSettable(c.key!, role))
                    const may = settable.filter((c) => reachOn(overrides, teamRules, teamId, c.key!, role) !== 'none').length
                    return `${ROLE_SHORT[role]} ${may === settable.length ? 'all' : may === 0 ? 'none' : `${may} of ${settable.length}`}`
                  })
                  .join(' · ')
                return (
                  <li key={page.to} className="rounded-[var(--radius-row)] bg-raised hairline">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggle(page.to)}
                      className="tap flex w-full items-center gap-3 px-3.5 py-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-on-surface">
                          {page.label}
                          {own && <Pill tone="blue">Own rules</Pill>}
                        </span>
                        <span className="block text-label-sm text-on-surface-variant">{summary}</span>
                      </span>
                      <Chevron open={isOpen} />
                    </button>
                    {isOpen && (
                      <div className="overflow-x-auto px-3.5 pb-3">
                        <table className="w-full min-w-[22rem] border-collapse text-body-sm">
                          <thead>
                            <tr>
                              <th className="pb-1 text-left font-normal text-on-surface-faint">
                                <span className="sr-only">Action</span>
                              </th>
                              {roles.map((role) => (
                                <th key={role} scope="col" className="px-1 pb-1 text-center font-mono text-label-sm font-normal uppercase tracking-wide text-on-surface-variant">
                                  {ROLE_SHORT[role]}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((c: Capability) => (
                              <tr key={c.key} className="border-t border-border-subtle">
                                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-on-surface">
                                  {c.short ?? c.action}
                                </th>
                                {roles.map((role) => {
                                  const mine = teamChoice(teamRules, teamId, c.key!, role)
                                  const reach = reachOn(overrides, teamRules, teamId, c.key!, role)
                                  return (
                                    <td key={role} className="py-1.5 text-center">
                                      {isTeamSettable(c.key!, role) ? (
                                        <span className="inline-flex items-center gap-1 font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                                          {REACH_SHORT[reach]}
                                          {mine && (
                                            <span aria-label="This team’s own rule" title="This team’s own rule" className="h-2 w-2 rounded-full bg-accent-blue" />
                                          )}
                                        </span>
                                      ) : (
                                        <span className="text-on-surface-faint">–</span>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <Link
                          to={`/settings/pages#${pageSlug(page.to)}`}
                          className="mt-2 inline-block text-label-md text-accent-blue-soft hover:text-on-surface"
                        >
                          Change {name}’s rules for {page.label}
                        </Link>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </SectionTile>

          <GivenToTeam teamId={teamId} name={name} grants={grants} editable={editable} />
        </>
      )}
    </div>
  )
}

/** The team's grants (0208): held, taken back, and one more given. */
function GivenToTeam({
  teamId,
  name,
  grants,
  editable,
}: {
  teamId: string
  name: string
  grants: readonly PermissionGrant[]
  editable: boolean
}) {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const [cap, setCap] = useState('')
  const [reach, setReach] = useState<GrantReach>('team')
  const [leadsOnly, setLeadsOnly] = useState(false)
  const [untilDay, setUntilDay] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // The end, if one is chosen (0218): the moment that day ends, or null for good.
  const until = untilDay ? untilFromDay(untilDay) : null

  const held = grants.filter((g) => g.departmentId === teamId)
  const choices = useMemo(
    () =>
      grantableCapabilities()
        .filter((key) => !held.some((h) => h.capability === key))
        .map((key) => ({ value: key, label: actionOf(key) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [held],
  )
  const reaches = cap ? (['team', 'all'] as const).filter((r) => grantIsValid(cap as CapabilityKey, r)) : []
  // What Give would do, before it is pressed.
  const preview = useMemo(
    () => (cap ? [{ capability: cap, team: teamId, reach, leads_only: leadsOnly, until }] : []),
    [cap, teamId, reach, leadsOnly, until],
  )

  const save = useMutation({
    mutationFn: async (change: { capability: string; reach: GrantReach | null; leads_only?: boolean; until?: string | null }) => {
      const { error } = await supabase.rpc('set_permission_grants', {
        p_changes: [
          {
            capability: change.capability,
            team: teamId,
            reach: change.reach,
            ...(change.reach ? { leads_only: change.leads_only ?? false, until: change.until ?? null } : {}),
          },
        ],
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setError(null)
      setCap('')
      setUntilDay('')
      setSaved(true)
      await queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save that.')),
  })

  return (
    <SectionTile
      title="Given to the team"
      hint={`Beyond what the grid gives its profiles: something for everybody on ${name || 'it'}, or for its Heads alone.`}
    >
      {held.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">Nothing more.</p>
      ) : (
        <ul aria-label={`Given to ${name}`} className="flex flex-col gap-1">
          {held.map((grant) => (
            <li
              key={grant.id ?? grant.capability}
              className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-[var(--radius-row)] px-2 py-2.5 odd:bg-raised"
            >
              <span className="min-w-0 flex-1 basis-48">
                <span className="block text-body-sm text-on-surface">{actionOf(grant.capability)}</span>
                <span className="block text-label-sm text-on-surface-faint">{REACH_WORDS[grant.reach]}</span>
              </span>
              <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <Pill tone="blue">{grant.leadsOnly ? 'Its Heads only' : 'Everybody on it'}</Pill>
                {grant.expiresAt && <Pill>Until {formatUntil(grant.expiresAt)}</Pill>}
                {editable && (
                  <button
                    type="button"
                    onClick={() => {
                      setSaved(false)
                      save.mutate({ capability: grant.capability, reach: null })
                    }}
                    disabled={save.isPending}
                    aria-label={`Take back: ${actionOf(grant.capability)}`}
                    className="tap rounded-full px-2.5 py-1 text-label-md text-on-surface-variant hover:text-error"
                  >
                    Take back
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="mt-4 flex flex-col gap-2">
          <Select
            aria-label="Give the team"
            placeholder="Give the team one thing more…"
            value={cap}
            onChange={(next) => {
              setSaved(false)
              setCap(next)
              const offered = (['team', 'all'] as const).filter((r) => grantIsValid(next as CapabilityKey, r))
              if (!offered.includes(reach)) setReach(offered[0] ?? 'team')
            }}
            options={choices}
          />
          {cap && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Select
                aria-label="How far"
                value={reach}
                onChange={(next) => setReach(next as GrantReach)}
                options={reaches.map((r) => ({ value: r, label: REACH_WORDS[r] }))}
              />
              <label className="flex items-center gap-2 text-body-sm text-on-surface">
                <Switch label="For its Heads only" checked={leadsOnly} onChange={setLeadsOnly} />
                Its Heads only
              </label>
              <DateField
                aria-label="Until"
                label="Until when?"
                placeholder="For good"
                min={earliestUntilDay()}
                clearable
                value={untilDay}
                onChange={setUntilDay}
              />
              <ActionButton
                tone="quiet"
                onClick={() => save.mutate({ capability: cap, reach, leads_only: leadsOnly, until })}
                disabled={save.isPending}
              >
                Give
              </ActionButton>
            </div>
          )}
          <GrantEffects changes={preview} />
          {saved && !error && (
            <p role="status" className="text-label-md text-on-surface-variant">
              Saved. The database follows it already.
            </p>
          )}
          {error && (
            <p role="alert" className="text-body-sm text-error">
              {error}
            </p>
          )}
          <p className="text-label-md text-on-surface-faint">
            “Everybody on it” is its roster, its Head and its Assisting Heads; “its Heads only” is the Head and
            Assisting Heads alone (0213). A grant only ever adds, and never reaches further than the grid could
            give a Team Head or a Team Member. One given until a day ends as that day does, on its own. The
            database follows it at once.
          </p>
        </div>
      )}
    </SectionTile>
  )
}
