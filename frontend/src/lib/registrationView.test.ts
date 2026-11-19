import { afterEach, describe, expect, it, vi } from 'vitest'
import { readRegistrationView, writeRegistrationView } from './registrationView'

const wide = (matches: boolean) => vi.stubGlobal('matchMedia', () => ({ matches }))

afterEach(() => {
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('cards or a table', () => {
  it('starts as a table where there is room for one, and cards where there is not', () => {
    wide(true)
    expect(readRegistrationView()).toBe('table')
    wide(false)
    expect(readRegistrationView()).toBe('cards')
  })

  it('keeps what somebody chose, whatever the screen', () => {
    wide(true)
    writeRegistrationView('cards')
    expect(readRegistrationView()).toBe('cards')
    wide(false)
    writeRegistrationView('table')
    expect(readRegistrationView()).toBe('table')
  })

  it('is cards where the browser cannot say how wide it is, and ignores a stored word it does not know', () => {
    expect(readRegistrationView()).toBe('cards')
    window.localStorage.setItem('rim.registrations.view', 'grid')
    expect(readRegistrationView()).toBe('cards')
  })
})
