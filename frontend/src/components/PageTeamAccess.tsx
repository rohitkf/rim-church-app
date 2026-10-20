import {
  REACH_SHORT,
  TEAM_ROLES,
  isTeamSettable,
  reachOf,
  reachOn,
  teamChoice,
  teamReaches,
  type CapabilityKey,
  type GrantRole,
  type Overrides,
  type Reach,
  type TeamOverrides,
} from '../lib/permissions'
import type { Allowed, Capability } from '../lib/permissionMatrix'
import { Chevron } from './Collapsible'
import { FixedCell, roleLabel } from './PermissionsCard'
import { TeamMark } from './TeamMark'

/**
 * One page's rules, team by team.
 *
 * The question an Admin brings is "can Worship's Assisting Head change
 * answers?" — a team first, then a profile on it. So each team is a card:
 * folded, it says in a line what each of its profiles may do on this
 * page; open, it is a grid of the page's rules against the profiles a
 * team has — Head, Assisting Head, Coordinator, Team Member — and each
 * cell is the team's own choice or "As the church". A team's own rule
 * reaches no wider than the team (0162); Admins and the Owner are the
 * church's, whatever a team says, so they are not here.
 */

const ALLOWED: Record<Reach, Allowed> = { none: 'no', own: 'own', team: 'team', all: 'yes' }

const ROLE_SHORT: Record<GrantRole, string> = {
  admin: 'Admin',
  head: 'Head',
  assistant: 'Asst Head',
  coordinator: 'Coordinator',
  member: 'Member',
  newcomer: 'Church Member',
}

/** One team cell: the team's own choice, or the church's rule it follows. */
export function TeamCellPicker({
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
        className={`tap cursor-pointer rounded-full bg-raised py-1 pl-2.5 pr-1 text-label-md text-on-surface hairline transition-shadow duration-200 hover:bg-raised-strong ${
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

export function PageTeamAccess({
  rows,
  teams,
  editable,
  working,
  workingTeams,
  storedTeams,
  onChoose,
  open,
  onToggle,
}: {
  /** The page's rows a team can set for itself. */
  rows: Capability[]
  teams: { id: string; name: string; color: string | null }[]
  editable: boolean
  /** The church's rules, as they would be after Save. */
  working: Overrides
  workingTeams: TeamOverrides
  storedTeams: TeamOverrides
  onChoose: (dept: string, cap: CapabilityKey, role: GrantRole, reach: Reach | null) => void
  open: Set<string>
  onToggle: (dept: string) => void
}) {
  const roles = TEAM_ROLES.filter((role) => rows.some((c) => isTeamSettable(c.key!, role)))
  const name = (c: Capability) => c.short ?? c.action

  /** "Head all · Asst Head all · Member none": what each profile may do here, in force. */
  const summary = (dept: string) =>
    roles
      .map((role) => {
        const settable = rows.filter((c) => isTeamSettable(c.key!, role))
        const may = settable.filter((c) => reachOn(working, workingTeams, dept, c.key!, role) !== 'none').length
        const said = may === settable.length ? 'all' : may === 0 ? 'none' : `${may} of ${settable.length}`
        return `${ROLE_SHORT[role]} ${said}`
      })
      .join(' · ')

  const ownRules = (dept: string) =>
    rows.some((c) => roles.some((role) => teamChoice(workingTeams, dept, c.key!, role) !== null))

  return (
    <section aria-label="Team by team">
      <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">Team by team</h3>
      <p className="mt-1 text-label-md text-on-surface-faint">
        Each team’s own rules for this page. A cell left “As the church” follows the rule below; a team’s own
        reaches no wider than the team. The Owner and Admins always may.
      </p>
      <ul className="mt-3 flex flex-col gap-2" aria-label="Teams">
        {teams.map((t) => {
          const isOpen = open.has(t.id)
          return (
            <li key={t.id} className="rounded-[var(--radius-row)] bg-raised hairline">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => onToggle(t.id)}
                className="tap flex w-full items-center gap-3 px-3.5 py-3 text-left"
              >
                <TeamMark color={t.color} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-on-surface">
                    {t.name}
                    {ownRules(t.id) && (
                      <span className="inline-flex items-center gap-1 font-mono text-label-sm font-normal uppercase tracking-wide text-accent-blue-soft">
                        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent-blue" />
                        Own rules
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-label-md text-on-surface-faint">{summary(t.id)}</span>
                </span>
                <Chevron open={isOpen} />
              </button>
              {isOpen && (
                <div className="px-3.5 pb-3">
                  <div className="relative -mx-2 overflow-x-auto px-2">
                    <table className="w-full min-w-[30rem] border-collapse text-body-sm">
                      <thead>
                        <tr>
                          <th className="w-[40%] px-2 pb-2 text-left font-normal">
                            <span className="sr-only">Rule</span>
                          </th>
                          {roles.map((role) => (
                            <th
                              key={role}
                              scope="col"
                              className="px-2 pb-2 text-center font-mono text-label-sm font-normal uppercase tracking-wide text-on-surface-variant"
                            >
                              {roleLabel(role)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((c) => {
                          const key = c.key!
                          return (
                            <tr key={key} className="border-t border-border-subtle align-top">
                              <th scope="row" className="px-2 py-2 text-left font-normal text-on-surface" title={c.action}>
                                {name(c)}
                              </th>
                              {roles.map((role) => {
                                const church = reachOf(working, key, role)
                                if (!isTeamSettable(key, role) || !editable) {
                                  return (
                                    <td key={role} className="px-2 py-2 text-center">
                                      <FixedCell
                                        value={ALLOWED[reachOn(working, workingTeams, t.id, key, role)]}
                                        locked={!isTeamSettable(key, role)}
                                      />
                                    </td>
                                  )
                                }
                                return (
                                  <td key={role} className="px-2 py-2 text-center">
                                    <TeamCellPicker
                                      capability={key}
                                      role={role}
                                      value={teamChoice(workingTeams, t.id, key, role)}
                                      church={church}
                                      unsaved={teamChoice(workingTeams, t.id, key, role) !== teamChoice(storedTeams, t.id, key, role)}
                                      label={`${name(c)} — ${roleLabel(role)} on ${t.name}`}
                                      onChange={(next) => onChoose(t.id, key, role, next)}
                                    />
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
