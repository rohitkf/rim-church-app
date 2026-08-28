import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { useNotificationRouting } from './useNotificationRouting'

const container = new EventTarget() as EventTarget & { startMessages?: () => void }
const startMessages = vi.fn()

function Harness() {
  useNotificationRouting()
  return <span data-testid="where">{useLocation().pathname}</span>
}

// A real ServiceWorkerContainer stand-in on the real navigator: jsdom has
// no serviceWorker, and replacing the whole navigator object breaks the
// effect's own teardown.
beforeAll(() => {
  container.startMessages = startMessages
  Object.defineProperty(navigator, 'serviceWorker', {
    value: container,
    configurable: true,
  })
})

beforeEach(() => {
  startMessages.mockClear()
  render(
    <MemoryRouter initialEntries={['/']}>
      <Harness />
    </MemoryRouter>,
  )
})

function post(data: unknown) {
  // Inside act: the worker's message lands outside React's event system,
  // so the navigation it triggers has to be flushed explicitly.
  act(() => {
    container.dispatchEvent(Object.assign(new Event('message'), { data }))
  })
}

describe('useNotificationRouting', () => {
  it('opens the message queue, which Safari keeps shut until asked', () => {
    expect(startMessages).toHaveBeenCalled()
  })

  it('routes to the page the worker names', () => {
    post({ type: 'NOTIFICATION_CLICK', href: '/rota' })
    expect(screen.getByTestId('where')).toHaveTextContent('/rota')
  })

  it('ignores anything that is not a notification click', () => {
    post({ type: 'SOMETHING_ELSE', href: '/rota' })
    expect(screen.getByTestId('where')).toHaveTextContent('/')
  })

  it('refuses a destination that is not a path on this app', () => {
    post({ type: 'NOTIFICATION_CLICK', href: 'https://evil.example/steal' })
    expect(screen.getByTestId('where')).toHaveTextContent('/')
  })
})
