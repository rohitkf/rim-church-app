import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAppSettings } from '../lib/appSettings'
import { fetchDepartments } from '../lib/queries'
import { fetchPeopleOptions } from '../lib/plannerControls'
import { pagesWithRules } from '../lib/pageList'
import { ACCESS_LEVELS } from '../lib/pageAccess'
import { isPageCapability, levelsFrom } from '../lib/pageCells'
import { PERMISSIONS, isLiveArea, withPageAccess, type Allowed } from '../lib/permissionMatrix'
import { PERMISSIONS_KEY, usePermissions } from '../lib/usePermissions'
import { decide, grantIsValid, grantableCapabilities, type CapabilityKey, type GrantReach, type PermissionGrant } from '../lib/permissions'
import { useErrorText } from '../lib/useErrorText'
import {
  explainCapability,
  explainFixed,
  grantsFor,
  holderOf,
  openingFor,
  type Answer,
  type PersonFacts,
  type Via,
} from '../lib/personAccess'
import type { PageOpening } from '../lib/pageOpening'
import { factsOf, type RoleRow, type RosterRow, type RotaRow } from '../lib/peopleFacts'
import { QueryState } from './QueryState'
import { Select } from './Select'
import { ActionButton, Pill, SectionTile } from './Surface'
import { roleLabel } from './PermissionsCard'

/**
 * Settings › Access › By person: one person's whole answer, read from the
 * same rules the buttons and the menu ask — pages, actions, and the lists
 * outside the grid that name them. It changes nothing; each part links to
 * the room that does.
 */

/** Everything the rules ask about one person, read as an Admin reads it. */
async function fetchPersonFacts(id: string): Promise<{ facts: PersonFacts; guestTeams: string[] }> {
  const [roles, rosters, rota, owner] = await Promise.all([
    supabase.from('user_roles').select('role_type, department_id').eq('user_id', id),
    supabase.from('department_members').select('department_id, member_type').eq('user_id', id),
    // As may() asks it (0207): the label, trimmed, in either case.
    supabase.from('rota_assignments').select('department_id, role_label').eq('user_id', id).ilike('role_label', '%coordinator%'),
    supabase.from('app_owner').select('user_id').maybeSingle(),
  ])
  for (const r of [roles, rosters, rota, owner]) if (r.error) throw r.error
  const onTeams = (rosters.data ?? []) as RosterRow[]
  return {
    facts: factsOf(
      id,
      (roles.data ?? []) as RoleRow[],
      onTeams,
      (rota.data ?? []) as RotaRow[],
      (owner.data as { user_id?: string } | null)?.user_id ?? null,
    ),
    guestTeams: onTeams.filter((m) => m.member_type === 'guest').map((m) => m.department_id),
  }
}

const viaLabel = (via: Via) => (via === 'overwatch' ? 'Overwatch' : via === 'grant' ? 'a grant' : roleLabel(via))

/** Why, in a few words: "As Team Head", or "Given to them" for a grant. */
const whyOf = (vias: readonly Via[]) => {
  const roles = vias.filter((v) => v !== 'grant').map(viaLabel)
  const given = vias.includes('grant')
  if (roles.length === 0) return 'Given to them'
  return `As ${roles.join(', ')}${given ? '; given to them' : ''}`
}

const levelLabel = (level: string) => ACCESS_LEVELS.find((l) => l.value === level)?.label ?? level

/** Why a page opens, or what it waits for. */
function openingWhy(opening: PageOpening): string {
  if (!opening.open) return `Open to ${levelLabel(opening.level).toLowerCase()}`
  switch (opening.via) {
    case 'overwatch':
      return 'Left open to Overwatch'
    case 'clock-in':
      return 'Given “See clock-ins”'
    case 'pastoral':
      return 'A pastor'
    case 'grant':
      return 'Given to them'
    default:
      return levelLabel(opening.level)
  }
}

/** One action's answer, as a pill and a reason. */
function AnswerPill({
  answer,
  teamName,
  teamIds,
}: {
  answer: Answer
  teamName: (id: string) => string
  teamIds: readonly string[]
}) {
  switch (answer.kind) {
    case 'everywhere':
      return <Reasoned tone="green" label="Everywhere" why={whyOf([answer.via])} />
    case 'own':
      return <Reasoned tone="blue" label="Their own" why={whyOf([answer.via])} />
    case 'none':
      return <Reasoned tone="neutral" label="No" />
    case 'teams': {
      const vias = whyOf([...new Set(answer.teams.map((t) => t.via))])
      const left = teamIds.filter((id) => !answer.teams.some((t) => t.id === id))
      if (answer.church) {
        // Allowed church-wide, but some team's own rule keeps its own.
        return (
          <Reasoned
            tone="green"
            label="All but"
            why={`${left.map(teamName).join(', ')} · their own rule · ${whyOf([answer.church])}`}
          />
        )
      }
      if (left.length === 0) return <Reasoned tone="green" label="Every team" why={vias} />
      return (
        <Reasoned
          tone="blue"
          label={answer.teams.length === 1 ? teamName(answer.teams[0].id) : `${answer.teams.length} teams`}
          why={`${answer.teams.length === 1 ? '' : `${answer.teams.map((t) => teamName(t.id)).join(', ')} · `}${vias}`}
        />
      )
    }
  }
}

function Reasoned({ tone, label, why }: { tone: 'green' | 'blue' | 'neutral'; label: string; why?: string }) {
  return (
    <span className="ml-auto flex max-w-full flex-col items-end gap-1 text-right">
      <Pill tone={tone}>{label}</Pill>
      {why && <span className="text-label-sm text-on-surface-faint">{why}</span>}
    </span>
  )
}

const FIXED_TONE: Record<Allowed, 'green' | 'blue' | 'neutral'> = { yes: 'green', own: 'blue', team: 'blue', no: 'neutral' }
const FIXED_LABEL: Record<Allowed, string> = { yes: 'Yes', own: 'Their own', team: 'Their team', no: 'No' }

export function PersonAccessCard({ onOpenRoles }: { onOpenRoles: () => void }) {
  const settings = useAppSettings()
  const { overrides, teams: teamRules, grants = [] } = usePermissions()
  // Every page's level, as the grid has it (0215).
  const levels = useMemo(() => levelsFrom(overrides), [overrides])
  // The person lives in the address, so a link can open their answer.
  const [params, setParams] = useSearchParams()
  const personId = params.get('person') ?? ''
  const setPersonId = (id: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        n.set('tab', 'person')
        if (id) n.set('person', id)
        else n.delete('person')
        return n
      },
      { replace: true },
    )
  const [showNo, setShowNo] = useState(false)

  const people = useQuery({ queryKey: ['people-options'], queryFn: fetchPeopleOptions })
  const teams = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const person = useQuery({
    queryKey: ['person-access', personId],
    queryFn: () => fetchPersonFacts(personId),
    enabled: !!personId,
  })

  const teamList = useMemo(() => teams.data ?? [], [teams.data])
  const teamIds = useMemo(() => teamList.map((t) => t.id), [teamList])
  const teamName = (id: string) => teamList.find((t) => t.id === id)?.name ?? 'A team since removed'
  const areas = useMemo(
    () =>
      // Opening a page is answered above, under Pages they can open, grants and all.
      withPageAccess(levels, settings.issues_raise_scope, settings.overwatch_pages).filter(
        (area) => !area.capabilities.every((c) => !!c.key && isPageCapability(c.key)),
      ),
    [levels, settings.issues_raise_scope, settings.overwatch_pages],
  )

  const facts = person.data?.facts
  const guestTeams = person.data?.guestTeams ?? []
  const chosen = people.data?.find((p) => p.id === personId)
  const name = chosen ? `${chosen.first_name} ${chosen.last_name}`.trim() : ''

  const standing = facts
    ? [
        facts.owner && 'Owner',
        facts.admin && 'Admin',
        facts.overwatch && 'Overwatch',
        facts.pastor && 'Pastor',
        ...facts.headTeams.map((id) => `Team Head · ${teamName(id)}`),
        ...facts.assistTeams.map((id) => `Assisting Head · ${teamName(id)}`),
        ...facts.memberTeams.map((id) => `Team Member · ${teamName(id)}${guestTeams.includes(id) ? ' (guest)' : ''}`),
        ...facts.coordinatorTeams.map((id) => `Coordinator · ${teamName(id)}`),
      ].filter((s): s is string => !!s)
    : []

  return (
    <div className="flex flex-col gap-4">
      <SectionTile
        title="Who are you asking about?"
        hint="Everything one person can open and do, and why — from the same rules the app follows. Nothing here changes anything."
      >
        <QueryState isLoading={people.isLoading} error={people.error}>
          <Select
            aria-label="Person"
            placeholder="Choose somebody…"
            value={personId}
            onChange={setPersonId}
            options={(people.data ?? []).map((p) => ({ value: p.id, label: `${p.first_name} ${p.last_name}`.trim() }))}
          />
        </QueryState>
        {facts && (
          <ul aria-label={`What ${name} is`} className="mt-4 flex flex-wrap gap-2">
            {standing.length === 0 ? (
              <li>
                <Pill>Church Member</Pill>
              </li>
            ) : (
              standing.map((s) => (
                <li key={s}>
                  <Pill tone="indigo">{s}</Pill>
                </li>
              ))
            )}
          </ul>
        )}
        {facts && (
          <p className="mt-3 text-label-md text-on-surface-faint">
            To change what they are, open{' '}
            <Link to="/volunteers" className="text-accent-blue-soft hover:underline">
              Volunteers
            </Link>
            .
          </p>
        )}
      </SectionTile>

      {personId && (
        <QueryState isLoading={person.isLoading || teams.isLoading} error={person.error ?? teams.error}>
          {facts && (
            <>
              <PagesFor facts={facts} name={name} />

              <SectionTile
                title="What they can do"
                hint="Where it reaches, and which of their profiles gives it."
                aside={
                  <label className="flex items-center gap-2 text-label-md text-on-surface-variant">
                    <input
                      type="checkbox"
                      checked={showNo}
                      onChange={(e) => setShowNo(e.target.checked)}
                      className="h-4 w-4 shrink-0"
                    />
                    Show what they can’t
                  </label>
                }
              >
                <div className="flex flex-col gap-6">
                  {areas.map((area) => {
                    const live = isLiveArea(area)
                    const rows = area.capabilities.map((c) => {
                      if (c.key && live) {
                        const answer = explainCapability(facts, c.key, overrides, teamRules, teamIds, settings, grants)
                        return { c, no: answer.kind === 'none', cell: <AnswerPill answer={answer} teamName={teamName} teamIds={teamIds} /> }
                      }
                      const fixed = explainFixed(facts, c, settings, levels)
                      return {
                        c,
                        no: fixed.allowed === 'no',
                        cell: (
                          <Reasoned
                            tone={FIXED_TONE[fixed.allowed]}
                            label={FIXED_LABEL[fixed.allowed]}
                            why={fixed.via ? `${whyOf([fixed.via])} · fixed` : undefined}
                          />
                        ),
                      }
                    })
                    const shown = showNo ? rows : rows.filter((r) => !r.no)
                    if (shown.length === 0) return null
                    return (
                      <section key={area.area}>
                        <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">{area.area}</h3>
                        <ul className="mt-2 flex flex-col gap-1">
                          {shown.map(({ c, no, cell }) => (
                            <li
                              key={c.action}
                              className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-[var(--radius-row)] px-2 py-2.5 odd:bg-raised"
                            >
                              <span
                                className={`min-w-0 flex-1 basis-48 text-body-sm ${no ? 'text-on-surface-faint' : 'text-on-surface'}`}
                              >
                                {c.action}
                              </span>
                              {cell}
                            </li>
                          ))}
                        </ul>
                      </section>
                    )
                  })}
                </div>
                <p className="mt-4 text-label-md text-on-surface-faint">
                  To change a profile’s reach, open{' '}
                  <button type="button" onClick={onOpenRoles} className="text-accent-blue-soft hover:underline">
                    By role
                  </button>
                  ; for one team’s own rules, open{' '}
                  <Link to="/settings/pages" className="text-accent-blue-soft hover:underline">
                    Page by Page
                  </Link>
                  .
                </p>
              </SectionTile>

              <GivenMore facts={facts} name={name} grants={grants} teamName={teamName} />

            </>
          )}
        </QueryState>
      )}
    </div>
  )
}

/** Every page, open or closed to them, and why. */
function PagesFor({ facts, name }: { facts: PersonFacts; name: string }) {
  const settings = useAppSettings()
  const { overrides, teams, grants = [] } = usePermissions()
  // Clock In and Prayer open by the grid's answer too (0209, 0210), grants included.
  const holder = holderOf(facts, grants)
  const granted = {
    clockInViewer: decide(overrides, holder, 'clockin.view', {}, teams),
    prayerCarer: decide(overrides, holder, 'prayer.pastoral', {}, teams),
    // Every page's level is the grid's, and a page may be given (0215).
    levels: levelsFrom(overrides),
    opens: (cap: CapabilityKey) => decide(overrides, holder, cap, {}, teams),
  }
  const pages = pagesWithRules().map(({ item }) => ({ item, opening: openingFor(facts, item.to, settings, granted) }))
  const open = pages.filter((p) => p.opening.open).length
  return (
    <SectionTile
      title="Pages they can open"
      aside={
        <span className="font-mono text-label-sm text-on-surface-faint" data-testid="person-page-count">
          {open} of {pages.length}
        </span>
      }
    >
      <ul aria-label={`Pages ${name} can open`} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {pages.map(({ item, opening }) => {
          const Icon = item.icon
          return (
            <li
              key={item.to}
              aria-label={`${item.label}: ${opening.open ? 'can open' : 'cannot open'}`}
              className={`flex items-center gap-2 rounded-[var(--radius-row)] px-3 py-2.5 text-body-sm ${
                opening.open
                  ? 'bg-[color-mix(in_oklab,var(--color-accent-green)_14%,transparent)] text-on-surface'
                  : 'bg-raised text-on-surface-faint'
              }`}
            >
              <Icon width={16} height={16} className="shrink-0" aria-hidden="true" />
              <span className={`min-w-0 flex-1 truncate ${opening.open ? '' : 'line-through decoration-on-surface-faint/40'}`}>
                {item.label}
              </span>
              <span className="shrink-0 text-label-sm text-on-surface-faint">{openingWhy(opening)}</span>
            </li>
          )
        })}
      </ul>
    </SectionTile>
  )
}

/** What each grantable capability is called, as the grid says it. */
const ACTION_OF: Partial<Record<CapabilityKey, string>> = Object.fromEntries(
  PERMISSIONS.flatMap((area) => area.capabilities).flatMap((c) => (c.key ? [[c.key, c.action]] : [])),
)
const actionOf = (cap: string) => ACTION_OF[cap as CapabilityKey] ?? cap

const REACH_WORDS: Record<GrantReach, string> = { team: 'On the teams they are on', all: 'Everywhere' }

/**
 * One thing more (0208): what the church has given this person by name, or
 * through a team, beyond what their profiles give — and the place to give
 * them another, or take one back.
 */
function GivenMore({
  facts,
  name,
  grants,
  teamName,
}: {
  facts: PersonFacts
  name: string
  grants: readonly PermissionGrant[]
  teamName: (id: string) => string
}) {
  const { can } = usePermissions()
  const editable = can('app.permissions')
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const [cap, setCap] = useState('')
  const [reach, setReach] = useState<GrantReach>('team')
  const [error, setError] = useState<string | null>(null)

  const held = grantsFor(facts, grants)
  const choices = useMemo(
    () =>
      grantableCapabilities()
        .filter((key) => !held.some((h) => !h.teamId && h.grant.capability === key))
        .map((key) => ({ value: key, label: actionOf(key) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [held],
  )
  const reaches = cap ? (['team', 'all'] as const).filter((r) => grantIsValid(cap as CapabilityKey, r)) : []

  const save = useMutation({
    mutationFn: async (change: { capability: string; reach: GrantReach | null }) => {
      const { error } = await supabase.rpc('set_permission_grants', {
        p_changes: [{ capability: change.capability, person: facts.id, reach: change.reach }],
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setError(null)
      setCap('')
      await queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save that.')),
  })

  // The Owner holds everything, and an Admin everything a grant could give.
  if (facts.owner || facts.admin) {
    return (
      <SectionTile title="Given one thing more" hint="Beyond what their profiles give.">
        <p className="text-body-sm text-on-surface-variant">
          {facts.owner ? 'The Owner' : 'An Admin'} may already do everything a grant could give.
        </p>
      </SectionTile>
    )
  }

  return (
    <SectionTile
      title="Given one thing more"
      hint={`Beyond what their profiles give: something for ${name || 'them'} by name. What one of their teams has been given shows here too.`}
    >
      {held.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">Nothing more, by name or through a team.</p>
      ) : (
        <ul aria-label="Given to them" className="flex flex-col gap-1">
          {held.map(({ grant, teamId }) => (
            <li
              key={grant.id ?? `${grant.capability}:${teamId ?? 'me'}`}
              className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-[var(--radius-row)] px-2 py-2.5 odd:bg-raised"
            >
              <span className="min-w-0 flex-1 basis-48">
                <span className="block text-body-sm text-on-surface">{actionOf(grant.capability)}</span>
                <span className="block text-label-sm text-on-surface-faint">
                  {teamId && grant.reach === 'team' ? `On ${teamName(teamId)}` : REACH_WORDS[grant.reach]}
                </span>
              </span>
              <span className="ml-auto flex items-center gap-2">
                {teamId ? (
                  <Link
                    to={`/settings/access?tab=team&team=${teamId}`}
                    aria-label={`Through ${teamName(teamId)}${grant.leadsOnly ? '’s Heads' : ''} — open By team`}
                    className="rounded-full bg-[color-mix(in_oklab,var(--color-accent-blue)_14%,transparent)] px-2.5 py-0.5 font-mono text-label-sm uppercase tracking-wide text-accent-blue-soft hover:text-on-surface"
                  >
                    Through {teamName(teamId)}
                    {grant.leadsOnly ? '’s Heads' : ''}
                  </Link>
                ) : (
                  <Pill tone="blue">By name</Pill>
                )}
                {editable && !teamId && (
                  <button
                    type="button"
                    onClick={() => save.mutate({ capability: grant.capability, reach: null })}
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
            aria-label="Give them"
            placeholder="Give them one thing more…"
            value={cap}
            onChange={(next) => {
              setCap(next)
              const offered = (['team', 'all'] as const).filter((r) => grantIsValid(next as CapabilityKey, r))
              if (!offered.includes(reach)) setReach(offered[0] ?? 'team')
            }}
            options={choices}
          />
          {cap && (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="How far"
                value={reach}
                onChange={(next) => setReach(next as GrantReach)}
                options={reaches.map((r) => ({ value: r, label: REACH_WORDS[r] }))}
              />
              <ActionButton
                tone="quiet"
                onClick={() => save.mutate({ capability: cap, reach })}
                disabled={save.isPending}
              >
                Give
              </ActionButton>
            </div>
          )}
          {error && (
            <p role="alert" className="text-body-sm text-error">
              {error}
            </p>
          )}
          <p className="text-label-md text-on-surface-faint">
            A grant only ever adds to what their profiles give, and never reaches further than the grid could
            give a Team Head or a Team Member. The database follows it at once.
          </p>
        </div>
      )}
    </SectionTile>
  )
}
