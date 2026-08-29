import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { fetchDepartments, fetchOwnMemberships } from '../lib/queries'
import { PageHeader } from '../components/Surface'
import { TeamBoard } from '../components/TeamBoard'
import { TeamAlertPanel } from '../components/TeamAlertPanel'
import { TeamPolls } from '../components/TeamPolls'
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
 * The team is chosen once, here, and the room, the alert composer and the
 * polls all follow it, rather than each asking which team separately.
 */
export function TeamChatPage() {
  const { session, isAdmin, ledDepartmentIds } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const membershipsQuery = useQuery({
    queryKey: ['own-memberships', session?.user.id],
    queryFn: () => fetchOwnMemberships(session!.user.id),
    enabled: !!session,
  })

  // The rooms this person is actually in: their own teams, plus any they
  // lead. An Admin sees them all, because an Admin is answerable for all
  // of them.
  const myTeams = useMemo(() => {
    const all = departmentsQuery.data ?? []
    if (isAdmin) return all
    const mine = new Set([
      ...(membershipsQuery.data ?? []).map((m) => m.department_id),
      ...ledDepartmentIds,
    ])
    return all.filter((d) => mine.has(d.id))
  }, [departmentsQuery.data, membershipsQuery.data, ledDepartmentIds, isAdmin])

  const departmentId = selectedId ?? myTeams[0]?.id ?? null
  const department = myTeams.find((d) => d.id === departmentId) ?? null

  return (
    <div className="mx-auto w-full max-w-[1360px]">
      <PageHeader
        eyebrow="One team at a time"
        title="Team Chat"
        description="The room for your team — what is said here stays with the people on it."
      />

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
            <TeamPolls departmentId={departmentId} />
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
