import type { ListSearchState } from '../lib/useListSearch'
import { SearchField } from './SearchField'

/**
 * The search box over a page's own list.
 *
 * Volunteers got one because finding a person meant opening team after
 * team; the Owner then asked for the same on the other lists (November
 * 2026). So it is one thing, used the same way everywhere: the box sits
 * above the list, what is typed narrows the list and puts the best match
 * first (lib/searchMatch: any order, a slip forgiven), a line under the
 * box says how many were found, and the cross empties it.
 *
 *     const search = useListSearch(teams, (t) => [{ text: t.name, weight: 3 }])
 *     <ListSearch search={search} label="Find a team" placeholder="Find a team" noun={['team', 'teams']} />
 *     {search.shown.map(...)}
 *
 * With nothing typed, `shown` is the list as it came, in its own order.
 */
export function ListSearch<T>({
  search,
  label,
  placeholder,
  noun,
  people = false,
  className = '',
}: {
  search: ListSearchState<T>
  /** What the box is for, read out: "Find a team". */
  label: string
  /** What can be typed: "Find a team by name". */
  placeholder: string
  /** One and many of what is listed: ['team', 'teams']. */
  noun: [string, string]
  /** The list is of people: "Nobody matches", not "Nothing matches". */
  people?: boolean
  className?: string
}) {
  // One thing needs no finding. The box stays while something is typed, so a
  // list narrowed to one does not lose the box that narrowed it.
  if (search.total < 2 && !search.typed) return null
  const found = search.shown.length
  return (
    <SearchField
      className={className}
      value={search.typed}
      onChange={search.setTyped}
      label={label}
      placeholder={placeholder}
      status={
        search.searching
          ? found === 0
            ? `${people ? 'Nobody' : 'Nothing'} matches “${search.typed.trim()}”. Try fewer letters.`
            : `${found} ${found === 1 ? noun[0] : noun[1]} found`
          : null
      }
    />
  )
}
