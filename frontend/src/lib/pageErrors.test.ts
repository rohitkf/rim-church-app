import { describe, expect, it } from 'vitest'
import { errorSummary, isChunkLoadError, mayReloadOnce, pageErrorKind } from './pageErrors'

/*
 * What went wrong with a page, sorted into what a person can do about it.
 */

/** What the router throws for a response, as isRouteErrorResponse knows it. */
const response = (status: number, statusText: string) => ({ status, statusText, internal: true, data: null })

function memory(): Pick<Storage, 'getItem' | 'setItem'> & { held: Map<string, string> } {
  const held = new Map<string, string>()
  return { held, getItem: (k) => held.get(k) ?? null, setItem: (k, v) => void held.set(k, v) }
}

describe('a page whose code would not download', () => {
  it('is known by what each browser says', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://rim.example/assets/EventsPage-Ckox16Ed.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://rim.example/assets/EventsPage-Ckox16Ed.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error("Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of \"text/html\"."))).toBe(true)
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/EventsPage-B1x.css'))).toBe(true)
  })

  it('is not any other failure', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false)
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isChunkLoadError({ message: 'Failed to fetch dynamically imported module' })).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe('the three kinds', () => {
  it('is not-found for an address the router has no page for', () => {
    expect(pageErrorKind(response(404, 'Not Found'))).toBe('not-found')
  })

  it('is stale for code that would not download', () => {
    expect(pageErrorKind(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))).toBe('stale')
  })

  it('is broken for everything else, another response included', () => {
    expect(pageErrorKind(new Error('kaboom'))).toBe('broken')
    expect(pageErrorKind(response(500, 'Internal Server Error'))).toBe('broken')
    expect(pageErrorKind('a string somebody threw')).toBe('broken')
    expect(pageErrorKind(undefined)).toBe('broken')
  })
})

describe('the error in a line', () => {
  it('is what it calls itself and what it said', () => {
    expect(errorSummary(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe("TypeError: Cannot read properties of undefined (reading 'map')")
  })

  it('is the first line only, never a stack', () => {
    expect(errorSummary(new Error('first line\n    at Page (page.tsx:12)\n    at render'))).toBe('Error: first line')
  })

  it('is the status for a response', () => {
    expect(errorSummary(response(500, 'Internal Server Error'))).toBe('500 Internal Server Error')
  })

  it('says something for an error that says nothing', () => {
    expect(errorSummary(new Error(''))).toBe('Error')
    expect(errorSummary('thrown text')).toBe('thrown text')
    expect(errorSummary(null)).toBe('An error with nothing to say for itself')
  })
})

describe('reloading by itself for a stale page', () => {
  it('is allowed once', () => {
    const storage = memory()
    expect(mayReloadOnce(1_000_000, storage)).toBe(true)
    expect(mayReloadOnce(1_000_500, storage)).toBe(false)
    expect(mayReloadOnce(1_030_000, storage)).toBe(false)
  })

  it('is allowed again once the last one is a minute old: another release, another day', () => {
    const storage = memory()
    expect(mayReloadOnce(1_000_000, storage)).toBe(true)
    expect(mayReloadOnce(1_060_001, storage)).toBe(true)
    expect(mayReloadOnce(1_060_002, storage)).toBe(false)
  })

  it('is not allowed where it cannot be remembered: a loop is worse than a button', () => {
    expect(mayReloadOnce(1_000_000, null)).toBe(false)
    const refusing = { getItem: () => { throw new Error('storage is off') }, setItem: () => {} }
    expect(mayReloadOnce(1_000_000, refusing)).toBe(false)
    const readOnly = { getItem: () => null, setItem: () => { throw new Error('quota') } }
    expect(mayReloadOnce(1_000_000, readOnly)).toBe(false)
  })

  it('treats a stamp it cannot read as none', () => {
    const storage = memory()
    storage.held.set('rim:reloaded-for-stale-page', 'not a number')
    expect(mayReloadOnce(1_000_000, storage)).toBe(true)
  })
})
