import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { ListSearch } from '../components/ListSearch'
import { TeamRows } from '../components/OnMyWayCard'
import { PageHeader, Tile } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { useAppSettings } from '../lib/appSettings'
import { churchClock } from '../lib/clockIn'
import { TEAM_ARRIVALS_KEY, fetchTeamArrivals, teamsFor, type ArrivalPerson, type ArrivalTeam } from '../lib/onMyWay'
import { useListSearch } from '../lib/useListSearch'
import { useMyTeams } from '../lib/useMyTeams'
import { useNow } from '../lib/useNow'
import { usePageAccess } from '../lib/usePageAccess'

/**
 * Every team's arrivals, on the day (0338).
 *
 * The Dashboard shows somebody their own team: who is here, who is on the
 * way and when, who cannot make it, who has said nothing (0337). This is
 * the same for every team at once, for whoever runs the day — the Owner,
 * the Admins, a Pastor and Overwatch out of the box, and whoever else the
 * church gives the page in Settings (the Owner, 27 November 2026).
 *
 * It shows today and nothing else: what people said is deleted overnight.
 * Never where anybody is: only the times they gave.
 */
export function OnMyWayPage() {
  const { session, viewAs } = useAuth()
  const myId = session?.user.id
  const settings = useAppSettings()
  const { teamIds } = useMyTeams()
  const { canOpen } = usePageAccess()
  const now = useNow(15_000)

  const query = useQuery({
    queryKey: [...TEAM_ARRIVALS_KEY, myId],
    queryFn: fetchTeamArrivals,
    enabled: !!myId,
    // Somebody arriving, or saying they are late, is news within the half-minute.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  const data = query.data
  // Every team for whoever may open this page; a preview is narrowed to what its standing would be given.
  const teams = useMemo(
    () =>
      teamsFor(data, { seesAll: !!data?.sees_all && canOpen('/on-my-way'), teamIds, previewing: !!viewAs }).sort(
        (a, b) => Date.parse(a.call_at) - Date.parse(b.call_at) || a.name.localeCompare(b.name),
      ),
    [data, canOpen, teamIds, viewAs],
  )

  // One box over everybody: a name narrows each team to who matches, and a team with nobody left goes.
  const entries = useMemo(() => teams.flatMap((team) => team.people.map((person) => ({ team, person }))), [teams])
  const search = useListSearch(entries, ({ person }) => [{ text: `${person.first_name} ${person.last_name}`, weight: 3 }])
  const shownTeams: ArrivalTeam[] = useMemo(() => {
    if (!search.searching) return teams
    const kept = new Map<string, ArrivalPerson[]>()
    for (const { team, person } of search.shown) kept.set(team.id, [...(kept.get(team.id) ?? []), person])
    return teams.filter((t) => kept.has(t.id)).map((t) => ({ ...t, people: kept.get(t.id)! }))
  }, [teams, search.searching, search.shown])

  const clock = (iso: string) => churchClock(iso, settings.timezone)
  const count = (state: ArrivalPerson['state']) => entries.filter((e) => e.person.state === state).length
  const over = !!data?.closes_at && now >= Date.parse(data.closes_at)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="On my way"
        description="Every team today: who is here, who is on the way and when, who can’t make it, and who has said nothing. Only the times people gave, never where they are."
      />
      <QueryState isLoading={query.isLoading} error={query.error}>
        {!data?.on ? (
          <Tile>
            <p className="text-body-md text-on-surface">On my way is switched off.</p>
            <p className="mt-1 text-body-sm text-on-surface-variant">It is switched on in Settings › Clock In.</p>
          </Tile>
        ) : teams.length === 0 ? (
          <Tile>
            <p className="text-body-md text-on-surface">No team is due in today.</p>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              On a service day every team on the rota is here, with who is in, who is on the way and who has said nothing.
            </p>
          </Tile>
        ) : (
          <>
            <p role="status" className="font-mono text-label-md tabular-nums text-on-surface-variant">
              {count('here')} of {entries.length} here · {count('coming')} on the way · {count('not_coming')} can’t make it · {count('none')} no word
              {over ? ' · the day’s services are over' : ''}
            </p>
            <ListSearch search={search} label="Find somebody" placeholder="Find somebody by name" noun={['person', 'people']} people className="mt-4" />
            <ul className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {shownTeams.map((team) => (
                <li key={team.id}>
                  <Tile padded={false} className="px-5 py-2 sm:px-6">
                    <ul>
                      <TeamRows team={team} myId={myId} now={now} clock={clock} shut={false} />
                    </ul>
                  </Tile>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryState>
    </div>
  )
}
