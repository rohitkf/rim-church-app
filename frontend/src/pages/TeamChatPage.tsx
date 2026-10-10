import { useMemo, useState } from 'react'
import { Lifespan } from '../components/Lifespan'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { usePermissions } from '../lib/usePermissions'
import { fetchDepartments, fetchOwnMemberships } from '../lib/queries'
import { PageHeader } from '../components/Surface'
import { TeamBoard } from '../components/TeamBoard'
import { TeamAlertPanel } from '../components/TeamAlertPanel'
import { QueryState } from '../components/QueryState'

/**
 * Team Chat.
 *
 * The message board speaks to everyone signed in; this speaks to one team.
 * They used to share a page — a public board down the middle with the
 * team's own room in a column beside it — which meant a phone got two
 * conversations behind a pair of tabs and neither had room. They are two
 * different audiences, so they are two different pages.
 *
 * The team is chosen once, here, and the room and the alert composer
 * follow it, rather than each asking which team separately. Polls moved
 * to a page of their own, since a question can now be put to more than
 * one team's room.
 */
export function TeamChatPage() {
  const { session, isAdmin, ledDepartmentIds } = useAuth()
  // Which rooms somebody may read and post in is the church's to say
  // (Settings › Access & privileges, msg.chat).
  const { can } = usePermissions()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // A notification about a poll names the team it was asked of, so the
  // link can open that room rather than whichever one comes first.
  const [params] = useSearchParams()
  const requestedId = params.get('team')

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const membershipsQuery = useQuery({
    queryKey: ['own-memberships', session?.user.id],
    queryFn: () => fetchOwnMemberships(session!.user.id),
    enabled: !!session,
  })

  // The rooms this person may be in. An Admin, out of the box, is in all
  // of them, because an Admin is answerable for all of them; everybody
  // else in their own teams' — whatever the grid has made of that.
  const myTeams = useMemo(() => {
    const all = departmentsQuery.data ?? []
    if (isAdmin && can('msg.chat')) return all
    const mine = new Set([
      ...(membershipsQuery.data ?? []).map((m) => m.department_id),
      ...ledDepartmentIds,
    ])
    return all.filter((d) => (mine.has(d.id) || can('msg.chat')) && can('msg.chat', { departmentId: d.id }))
  }, [departmentsQuery.data, membershipsQuery.data, ledDepartmentIds, isAdmin, can])

  const departmentId =
    selectedId ??
    // Only a team they are actually in: a link is not a way into a room.
    (requestedId && myTeams.some((d) => d.id === requestedId) ? requestedId : null) ??
    myTeams[0]?.id ??
    null
  const department = myTeams.find((d) => d.id === departmentId) ?? null

  return (
    <div className="mx-auto w-full max-w-[1360px]">
      <PageHeader
        eyebrow="One team at a time"
        title="Team Chat"
        description="The room for your team — what is said here stays with the people on it."
      />
      <Lifespan page="team-chat" className="mb-4" />

      <QueryState
        isLoading={departmentsQuery.isLoading || membershipsQuery.isLoading}
        error={departmentsQuery.error ?? membershipsQuery.error}
        isEmpty={myTeams.length === 0}
        emptyMessage="You are not on a team yet, so there is no room to show. Ask to join one from the Teams page."
      >
        {/* One picker for the whole page. It wraps rather than scrolls:
            a strip that slides sideways with its scrollbar hidden is how
            the dock used to lose half its destinations, and nothing here
            depends on this row staying one line high. */}
        {myTeams.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {myTeams.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedId(d.id)}
                className={`tap shrink-0 rounded-full px-4 py-2 text-body-sm font-medium transition-colors duration-300 ${
                  d.id === departmentId
                    ? 'bg-primary text-on-primary'
                    : 'bg-raised text-on-surface-variant hover:bg-raised-strong'
                }`}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <TeamBoard
            departments={myTeams}
            departmentId={departmentId}
            className="h-[32rem] lg:h-[calc(100svh-14rem)]"
          />

          <div className="flex flex-col gap-5">
            {/* Renders nothing for anyone who cannot send one. */}
            <TeamAlertPanel />
            <p className="rounded-[var(--radius-tile)] bg-surface-lowest hairline p-5 text-body-sm text-on-surface-variant">
              Team polls have moved to the{' '}
              <Link to="/polls" className="font-medium text-secondary hover:underline">
                Polls page
              </Link>
              , where a question can go to one team, a service, or the whole church.
            </p>
          </div>
        </div>

        {department && (
          <p className="mt-4 text-label-sm text-on-surface-faint">
            Showing {department.name}.
          </p>
        )}
      </QueryState>
    </div>
  )
}
