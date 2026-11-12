import { useQuery } from '@tanstack/react-query'
import { BEHIND_ASKS_EVERY_MS, DATABASE_VERSION_KEY, VERSION_FRESH_MS, databaseIsBehind, fetchDatabaseVersion } from './databaseVersion'

/**
 * Where the database stands against this build, kept up to date.
 *
 * Asked once when the app opens, in the background — nothing waits on it,
 * and until it answers the app is open. While the answer is "behind" it
 * is asked again every fifteen seconds, so the page that says so goes
 * away by itself the moment the migration lands. The query caches ask it
 * again whenever the database says something does not exist (App.tsx),
 * which is the moment being out of step first shows.
 */
export function useDatabaseVersion() {
  const query = useQuery({
    queryKey: DATABASE_VERSION_KEY,
    queryFn: fetchDatabaseVersion,
    staleTime: VERSION_FRESH_MS,
    retry: false,
    refetchInterval: (q) => (databaseIsBehind(q.state.data) ? BEHIND_ASKS_EVERY_MS : false),
    refetchIntervalInBackground: false,
  })
  return {
    version: query.data ?? null,
    behind: databaseIsBehind(query.data),
    checking: query.isFetching,
    recheck: () => void query.refetch(),
  }
}
