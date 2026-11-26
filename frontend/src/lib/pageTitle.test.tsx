import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PageHeader } from '../components/Surface'
import { AuthCard } from '../components/AuthCard'
import { titleFor, usePageTitle } from './pageTitle'
import { CHURCH_NAME } from './churchName'

/*
 * What the browser's tab says. Every page had the church's name and
 * nothing else, so tabs, history and a screen reader's first words were
 * the same on all of them (found by the design pass of November 2026).
 */

afterEach(() => {
  document.title = CHURCH_NAME
})

function Named({ name }: { name: string | null }) {
  usePageTitle(name)
  return null
}

describe('a page’s title', () => {
  it('is the page first and the church after', () => {
    expect(titleFor('Team Rota')).toBe(`Team Rota · ${CHURCH_NAME}`)
    expect(titleFor('  ')).toBe(CHURCH_NAME)
    expect(titleFor(null)).toBe(CHURCH_NAME)
  })

  it('names the tab while the page is on screen and gives the church’s name back as it leaves', () => {
    const { rerender, unmount } = render(<Named name="Polls" />)
    expect(document.title).toBe(`Polls · ${CHURCH_NAME}`)
    rerender(<Named name="Giving" />)
    expect(document.title).toBe(`Giving · ${CHURCH_NAME}`)
    unmount()
    expect(document.title).toBe(CHURCH_NAME)
  })

  it('waits for a name that has not loaded without saying anything wrong', () => {
    render(<Named name={null} />)
    expect(document.title).toBe(CHURCH_NAME)
  })
})

describe('the pages that name the tab', () => {
  it('every page with the shared header says its title', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Debriefs" />
      </MemoryRouter>,
    )
    expect(document.title).toBe(`Debriefs · ${CHURCH_NAME}`)
  })

  it('the Dashboard says Dashboard, not its greeting', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Good morning, Ada." tabTitle="Dashboard" />
      </MemoryRouter>,
    )
    expect(document.title).toBe(`Dashboard · ${CHURCH_NAME}`)
  })

  it('the signed-out screens say which one they are', () => {
    render(
      <AuthCard title="Sign in">
        <p>form</p>
      </AuthCard>,
    )
    expect(document.title).toBe(`Sign in · ${CHURCH_NAME}`)
  })
})
