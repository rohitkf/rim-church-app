import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { usePermissions } from '../lib/usePermissions'
import { QueryState } from '../components/QueryState'
import { ManageTeamsCard } from '../components/ManageTeamsCard'
import { JoinRequestsPanel } from '../components/JoinRequestsPanel'
import { AnsweredJoinRequests } from '../components/AnsweredJoinRequests'
import { JoinTeamPanel } from '../components/JoinTeamPanel'
import { TeamCardActions } from '../components/TeamCardActions'
import { Card, PageHeader } from '../components/Surface'
import { fetchDepartments, fetchJoinRequests, fetchTeamRosterKinds } from '../lib/queries'
import { NO_ONE, teamHeadcounts, type TeamHeadcount } from '../lib/teamHeadcount'
import { useOwnMemberships } from '../lib/useOwnMemberships'
import { TeamAvatar } from '../components/TeamMark'
import { CountRow } from '../components/CountRow'
import { teamWash } from '../lib/teamGradient'
import { useTeamStyle } from '../lib/useTeamStyle'

export function DepartmentsPage() {
  const { isAdmin, seesAllTeams, ledDepartmentIds, session } = useAuth()
  // Making and removing teams, and clearing answered requests, are the
  // church's to grant (Settings › Access & Privileges). Seeing every team
  // stays an Admin's view.
  const { can } = usePermissions()
  const canCreate = can('team.create')
  const { teamStyle } = useTeamStyle()

  const { data: allDepartments, isLoading, error } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  })
  const ownDeptsQuery = useOwnMemberships()

  // One query serves both halves of the join flow: RLS returns your own
  // asks plus, for a head or an Admin, the ones waiting on them.
  const joinRequestsQuery = useQuery({
    queryKey: ['join-requests'],
    queryFn: () => fetchJoinRequests(),
    enabled: !!session,
  })
  const joinRequests = joinRequestsQuery.data ?? []
  const myId = session?.user.id
  const myRequests = joinRequests.filter((r) => r.user_id === myId)
  // Only the asks this person can answer — an Admin, or the team's head
  // (respond_team_join). Overwatch reads everybody's (0187) and answers
  // none, so the rest are not put in front of it as if they were its to do.
  const waitingOnMe = joinRequests.filter(
    (r) =>
      r.status === 'pending' &&
      r.user_id !== myId &&
      (isAdmin || ledDepartmentIds.includes(r.department_id)),
  )
  const memberDeptIds = ownDeptsQuery.teamIds

  // Everyone can read the department list (the rota needs other teams'
  // names), so this page narrows it to the teams you actually belong to
  // or lead. Admins keep the whole list.
  const data = useMemo(() => {
    if (seesAllTeams) return allDepartments
    const mine = new Set([...memberDeptIds, ...ledDepartmentIds])
    return (allDepartments ?? []).filter((d) => mine.has(d.id))
  }, [allDepartments, memberDeptIds, ledDepartmentIds, seesAllTeams])

  // How many are on each team shown, core and guests apart.
  const shownIds = useMemo(() => (data ?? []).map((d) => d.id), [data])
  const rosterQuery = useQuery({
    queryKey: ['team-headcounts', shownIds],
    queryFn: () => fetchTeamRosterKinds(shownIds),
    enabled: shownIds.length > 0,
  })
  const headcounts = useMemo(() => teamHeadcounts(rosterQuery.data ?? []), [rosterQuery.data])

  return (
    <div>
      <PageHeader
        eyebrow="Organisation"
        title="Teams"
        description="The teams you're a core member, guest, or head of — plus every team if you're an Admin."
      />

      {canCreate && <ManageTeamsCard departments={allDepartments ?? []} />}

      {waitingOnMe.length > 0 && (
        <div className={canCreate ? 'mt-6' : ''}>
          <JoinRequestsPanel requests={waitingOnMe} />
        </div>
      )}

      {can('people.clear_records') && (
        <div className="mt-4">
          <AnsweredJoinRequests count={joinRequests.filter((r) => r.status !== 'pending').length} />
        </div>
      )}

      <div className="mt-8">
        <QueryState isLoading={isLoading} error={error} isEmpty={data?.length === 0}
          emptyMessage={
            seesAllTeams ? 'No teams yet.' : "You're not on a team yet — ask to join one below."
          }>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {data?.map((dept) => {
              return (
                <Card key={dept.id} as="li" interactive className="flex flex-col">
                  <div
                    className="flex h-full flex-col rounded-[var(--radius-tile)] p-5"
                    style={teamWash(dept.color, teamStyle)}
                  >
                    {/* The team's colour as a wash behind its initial, so the
                        card carries its identity before you read the name. */}
                    <Link to={`/departments/${dept.id}`} className="group/link block">
                      <TeamAvatar
                        color={dept.color}
                        name={dept.name}
                        className="h-11 w-11 rounded-xl text-label-md ring-1 ring-inset ring-black/5 transition-transform duration-300 ease-[var(--ease-glide)] group-hover/card:scale-105 dark:ring-white/10"
                      />

                      <h2 className="mt-4 text-headline-md leading-tight transition-colors duration-200 ease-[var(--ease-glide)] group-hover/link:text-accent-blue-soft">
                        {dept.name}
                      </h2>

                      <p className="mt-1.5 text-body-sm text-on-surface-variant">
                        {dept.handbook_url ? 'Handbook on file' : 'No handbook yet'}
                      </p>

                      {/* Who is on it, at a glance: the two kinds of member
                          apart, then the whole roster. Left out until the
                          count is in, rather than reading 0 for a moment. */}
                      {rosterQuery.isSuccess && (
                        <TeamHeadcountRow counts={headcounts.get(dept.id) ?? NO_ONE} />
                      )}
                    </Link>

                    {dept.is_service_flow && (
                      <span className="mt-3 self-start rounded-full bg-secondary/12 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-accent-blue-soft ring-1 ring-inset ring-secondary/20">
                        Signs checklists off
                      </span>
                    )}

                    {(canCreate || can('team.edit', { departmentId: dept.id })) && (
                      <div className="mt-5 flex flex-1 flex-col justify-end">
                        <TeamCardActions
                          dept={dept}
                          canEdit={can('team.edit', { departmentId: dept.id })}
                          canDelete={canCreate}
                        />
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </ul>
        </QueryState>
      </div>

      {/* Every team you are not on, and one verb for it. Admins and
          Overwatch already see the whole list above — Overwatch reads every
          team without joining any — so this is for everyone else. */}
      {/* Asking is the church's to allow, role by role (team.request_join,
          0190); the database refuses whoever it says no to. */}
      {!seesAllTeams && can('team.request_join') && (
        <div className="mt-8">
          <JoinTeamPanel
            departments={allDepartments ?? []}
            memberDeptIds={[...memberDeptIds, ...ledDepartmentIds]}
            myRequests={myRequests}
          />
        </div>
      )}
    </div>
  )
}

function TeamHeadcountRow({ counts }: { counts: TeamHeadcount }) {
  const guests = counts.guest === 1 ? 'guest' : 'guests'
  return (
    <CountRow
      label={`${counts.core} core, ${counts.guest} ${guests}, ${counts.total} in all`}
      counts={[
        { label: 'Core', value: counts.core },
        { label: counts.guest === 1 ? 'Guest' : 'Guests', value: counts.guest },
        { label: 'Total', value: counts.total },
      ]}
    />
  )
}
