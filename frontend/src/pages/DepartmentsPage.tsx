import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { ManageTeamsCard } from '../components/ManageTeamsCard'
import { JoinRequestsPanel } from '../components/JoinRequestsPanel'
import { JoinTeamPanel } from '../components/JoinTeamPanel'
import { TeamCardActions } from '../components/TeamCardActions'
import { Card, PageHeader } from '../components/Surface'
import { fetchDepartments, fetchJoinRequests, fetchOwnDepartmentIds } from '../lib/queries'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'

export function DepartmentsPage() {
  const { isAdmin, ledDepartmentIds, session } = useAuth()

  const { data: allDepartments, isLoading, error } = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  })
  const ownDeptsQuery = useQuery({
    queryKey: ['own-departments', session?.user.id],
    queryFn: () => fetchOwnDepartmentIds(session!.user.id),
    enabled: !!session,
  })

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
  const waitingOnMe = joinRequests.filter((r) => r.status === 'pending' && r.user_id !== myId)
  const memberDeptIds = useMemo(() => ownDeptsQuery.data ?? [], [ownDeptsQuery.data])

  // Everyone can read the department list (the rota needs other teams'
  // names), so this page narrows it to the teams you actually belong to
  // or lead. Admins keep the whole list.
  const data = useMemo(() => {
    if (isAdmin) return allDepartments
    const mine = new Set([...memberDeptIds, ...ledDepartmentIds])
    return (allDepartments ?? []).filter((d) => mine.has(d.id))
  }, [allDepartments, memberDeptIds, ledDepartmentIds, isAdmin])

  return (
    <div>
      <PageHeader
        eyebrow="Organisation"
        title="Teams"
        description="The teams you're a core member, guest, or head of — plus every team if you're an Admin."
      />

      {isAdmin && <ManageTeamsCard departments={allDepartments ?? []} />}

      {waitingOnMe.length > 0 && (
        <div className={isAdmin ? 'mt-6' : ''}>
          <JoinRequestsPanel requests={waitingOnMe} />
        </div>
      )}

      <div className="mt-8">
        <QueryState isLoading={isLoading} error={error} isEmpty={data?.length === 0}
          emptyMessage={
            isAdmin ? 'No teams yet.' : "You're not on a team yet — ask to join one below."
          }>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {data?.map((dept) => {
              const colour = dept.color ?? DEFAULT_DEPT_COLOR
              return (
                <Card key={dept.id} as="li" interactive className="flex flex-col">
                  <div className="flex h-full flex-col p-5">
                    {/* The team's colour as a wash behind its initial, so the
                        card carries its identity before you read the name. */}
                    <Link to={`/departments/${dept.id}`} className="group/link block">
                      <span
                        className="flex h-11 w-11 items-center justify-center rounded-xl font-mono text-label-md uppercase ring-1 ring-inset ring-black/5 transition-transform duration-500 ease-[var(--ease-glide)] group-hover/card:scale-105 dark:ring-white/10"
                        style={{
                          backgroundColor: `color-mix(in oklab, ${colour} 16%, transparent)`,
                          color: colour,
                        }}
                        aria-hidden="true"
                      >
                        {dept.name.slice(0, 2)}
                      </span>

                      <h2 className="mt-4 text-headline-md leading-tight transition-colors duration-300 ease-[var(--ease-glide)] group-hover/link:text-secondary">
                        {dept.name}
                      </h2>

                      <p className="mt-1.5 text-body-sm text-on-surface-variant">
                        {dept.handbook_url ? 'Handbook on file' : 'No handbook yet'}
                      </p>
                    </Link>

                    {dept.is_service_flow && (
                      <span className="mt-3 self-start rounded-full bg-secondary/12 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-secondary ring-1 ring-inset ring-secondary/20">
                        Signs checklists off
                      </span>
                    )}

                    {isAdmin && (
                      <div className="mt-5 flex flex-1 flex-col justify-end">
                        <TeamCardActions dept={dept} />
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </ul>
        </QueryState>
      </div>

      {/* Every team you are not on, and one verb for it. Admins already
          see the whole list above, so this is for everyone else. */}
      {!isAdmin && (
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
