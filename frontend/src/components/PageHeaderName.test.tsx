import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageHeader } from './Surface'
import { NavNamesContext } from '../lib/navNames'

const at = (path: string) => window.history.replaceState(null, '', path)
afterEach(() => at('/'))

describe('a page the church has renamed (Settings › Menu)', () => {
  it('wears its new name at the top of the page', () => {
    at('/polls')
    render(
      <NavNamesContext.Provider value={{ '/polls': 'Votes' }}>
        <PageHeader title="Polls" />
      </NavNamesContext.Provider>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Votes')
  })

  it('renames a page whose heading is not its menu name, like Messages’ Message Board', () => {
    at('/messages')
    render(
      <NavNamesContext.Provider value={{ '/messages': 'Notice Board' }}>
        <PageHeader title="Message Board" />
      </NavNamesContext.Provider>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Notice Board')
  })

  it('keeps the dashboard’s greeting, a page further in, and every page outside the shell as they are', () => {
    at('/')
    const { unmount } = render(
      <NavNamesContext.Provider value={{ '/': 'Home' }}>
        <PageHeader title="Good morning, Grace." />
      </NavNamesContext.Provider>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Grace.')
    unmount()
    at('/departments/abc')
    const second = render(
      <NavNamesContext.Provider value={{ '/departments': 'Ministries' }}>
        <PageHeader title="Media" />
      </NavNamesContext.Provider>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Media')
    second.unmount()
    at('/polls')
    unmount()
    render(<PageHeader title="Polls" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Polls')
  })
})
