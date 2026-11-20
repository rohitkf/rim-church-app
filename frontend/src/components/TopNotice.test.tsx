import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { TopNotice } from './TopNotice'

const room = () => document.documentElement.style.getPropertyValue('--top-notice-h')

describe('a notice at the top of the screen', () => {
  it('tells the page how much room it takes while it is up, and gives it back when it goes', () => {
    expect(room()).toBe('')
    const { unmount } = render(
      <TopNotice label="The app was updated" text="The app was updated">
        <button type="button">Dismiss</button>
      </TopNotice>,
    )
    // Its height (nothing is laid out here, so 0) and the air under it: the page is never told nothing.
    expect(room()).toBe('12px')
    unmount()
    expect(room()).toBe('')
  })

  it('keeps the room while a second notice is still up', () => {
    const first = render(
      <TopNotice label="A new version is ready" text="New version ready">
        <button type="button">Later</button>
      </TopNotice>,
    )
    const second = render(
      <TopNotice label="The app was updated" text="The app was updated">
        <button type="button">Dismiss</button>
      </TopNotice>,
    )
    first.unmount()
    expect(room()).toBe('12px')
    second.unmount()
    expect(room()).toBe('')
  })
})
