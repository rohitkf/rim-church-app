/**
 * Whether the Rota page lists every team, not only your own.
 *
 * An Admin and Overwatch always have; so has anybody the grid lets change
 * any team's rota. The Service Flow Coordinators do too, to read: they run
 * the morning, and knowing who every team has on is the job. Reading only:
 * every button on the page is still the grid's to give, team by team, and
 * the database already lets anyone on a team read every rota.
 */
export function seesEveryTeamRota({
  seesAllTeams,
  assignsAnywhere,
  ownTeamIds,
  departments,
}: {
  seesAllTeams: boolean
  assignsAnywhere: boolean
  ownTeamIds: readonly string[]
  departments: readonly { id: string; is_service_flow: boolean }[]
}): boolean {
  if (seesAllTeams || assignsAnywhere) return true
  const mine = new Set(ownTeamIds)
  return departments.some((d) => d.is_service_flow && mine.has(d.id))
}
