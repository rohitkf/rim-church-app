import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListSearch } from './ListSearch'
import { useListSearch } from '../lib/useListSearch'

/*
 * The box over a page's own list. Volunteers got one, and the Owner asked
 * for the same on the other lists: one thing, used the same way on each.
 */
function Teams({ names }: { names: string[] }) {
  const search = useListSearch(names, (n) => [{ text: n, weight: 3 }])
  return (
    <div>
      <ListSearch search={search} label="Find a team" placeholder="Find a team" noun={['team', 'teams']} />
      <ul>
        {search.shown.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  )
}
const listed = () => screen.queryAllByRole('listitem').map((li) => li.textContent)

describe('the box over a list', () => {
  it('leaves the list as it came until something is typed', () => {
    render(<Teams names={['Worship', 'Media', 'Kids']} />)
    expect(listed()).toEqual(['Worship', 'Media', 'Kids'])
    expect(screen.getByRole('searchbox', { name: 'Find a team' })).toHaveValue('')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('narrows the list as letters are typed, best first, and says how many', async () => {
    render(<Teams names={['Worship', 'Media', 'Social media', 'Kids']} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a team' }), 'media')
    expect(listed()).toEqual(['Media', 'Social media'])
    expect(screen.getByRole('status')).toHaveTextContent('2 teams found')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a team' }), ' soc')
    expect(listed()).toEqual(['Social media'])
    expect(screen.getByRole('status')).toHaveTextContent('1 team found')
  })

  it('forgives a slip, as the search over everything does', async () => {
    render(<Teams names={['Worship', 'Media']} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a team' }), 'worhsip')
    expect(listed()).toEqual(['Worship'])
  })

  it('says when nothing matches, and the cross brings the whole list back', async () => {
    render(<Teams names={['Worship', 'Media']} />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a team' }), 'zzzz')
    expect(listed()).toEqual([])
    expect(screen.getByRole('status')).toHaveTextContent('Nothing matches “zzzz”. Try fewer letters.')
    await userEvent.click(screen.getByRole('button', { name: 'Clear the search' }))
    expect(listed()).toEqual(['Worship', 'Media'])
    expect(screen.getByRole('searchbox', { name: 'Find a team' })).toHaveFocus()
  })

  it('is not drawn over one thing, or none: there is nothing to find', () => {
    const { unmount } = render(<Teams names={['Media']} />)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(listed()).toEqual(['Media'])
    unmount()
    render(<Teams names={[]} />)
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('says "Nobody" of people', async () => {
    function People() {
      const search = useListSearch(['Grace Mensah', 'Sam Varghese'], (n) => [{ text: n, weight: 3 }])
      return <ListSearch search={search} label="Find somebody" placeholder="Find somebody" noun={['person', 'people']} people />
    }
    render(<People />)
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find somebody' }), 'zzzz')
    expect(screen.getByRole('status')).toHaveTextContent('Nobody matches “zzzz”.')
  })
})
