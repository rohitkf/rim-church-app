import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  ERROR_SOURCES,
  REPORTS_PER_LOAD,
  SAME_AGAIN_MS,
  describeError,
  forgetReports,
  installErrorReporting,
  isDatabaseFault,
  isNetworkFailure,
  reportError,
  scrubPage,
  worthReporting,
} from './clientErrors'
import { RequestTimeoutError } from './fetchTimeout'
import migration from '../../../supabase/migrations/0284_the_app_says_when_something_broke.sql?raw'

/*
 * Telling the church that something broke (0284): which failures are
 * news, what is said about one, what never leaves the device, and that
 * reporting can never itself be the thing that breaks.
 */

const rpc = vi.hoisted(() => vi.fn<(name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>>())
vi.mock('./supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (name: string, args: Record<string, unknown>) => rpc(name, args) },
}))

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ data: '7F3K2Q9A', error: null })
  forgetReports()
  window.history.replaceState(null, '', '/rota')
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

const api = (code: string, message = 'said the database') => ({ code, message, details: 'Key (email)=(somebody@example.org) already exists.', hint: null })

describe('a request that never got an answer', () => {
  it('is known by what each browser calls it', () => {
    for (const said of [
      'Failed to fetch',
      'Load failed',
      'NetworkError when attempting to fetch resource.',
      'Network request failed',
      'The Internet connection appears to be offline.',
      'The network connection was lost.',
      'fetch failed',
    ]) {
      expect(isNetworkFailure(new TypeError(said)), said).toBe(true)
    }
  })

  it('is a deadline passed, and a request given up on', () => {
    expect(isNetworkFailure(new RequestTimeoutError())).toBe(true)
    expect(isNetworkFailure(new DOMException('The operation was aborted.', 'AbortError'))).toBe(true)
  })

  it('is not a mistake in the code that happens to be a TypeError', () => {
    expect(isNetworkFailure(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false)
  })
})

describe('the database saying the app asked for what it has not got', () => {
  it('is a function, column or table that does not exist, and a schema cache that has not heard of one', () => {
    for (const code of ['PGRST202', 'PGRST204', 'PGRST205', 'PGRST200', '42883', '42703', '42P01', '42804']) {
      expect(isDatabaseFault(api(code)), code).toBe(true)
    }
  })

  it('is a statement out of time, no connection to spare, and its own internal error', () => {
    for (const code of ['57014', '53300', '53100', 'XX000']) expect(isDatabaseFault(api(code)), code).toBe(true)
  })

  it('is not a rule being kept: a refusal, a duplicate, a failed check, a raised message', () => {
    for (const code of ['42501', '23505', '23514', '23503', 'P0001', 'PGRST116', '22P02', '']) {
      expect(isDatabaseFault(api(code)), code).toBe(false)
    }
  })
})

describe('whether a failure is news', () => {
  it('is, when a page or the app itself threw', () => {
    for (const source of ['page', 'boundary', 'window', 'promise'] as const) {
      expect(worthReporting(source, new Error('boom')), source).toBe(true)
      expect(worthReporting(source, new TypeError("Cannot read properties of undefined (reading 'x')")), source).toBe(true)
    }
  })

  it('never is, with no connection', () => {
    for (const source of ERROR_SOURCES) {
      expect(worthReporting(source, new TypeError('Failed to fetch')), source).toBe(false)
      expect(worthReporting(source, new RequestTimeoutError()), source).toBe(false)
    }
  })

  it('never is, for a page a release behind: that reloads by itself', () => {
    for (const source of ERROR_SOURCES) {
      expect(worthReporting(source, new TypeError('Failed to fetch dynamically imported module: https://x/assets/Page-abc.js')), source).toBe(false)
      expect(worthReporting(source, new Error('Importing a module script failed.')), source).toBe(false)
    }
  })

  it('never is, for somebody removed, blocked, or met by a closed app', () => {
    for (const detail of ['account_removed', 'account_blocked', 'app_closed']) {
      const turnedAway = { code: '42501', message: 'no', details: detail }
      for (const source of ERROR_SOURCES) expect(worthReporting(source, turnedAway), `${detail} ${source}`).toBe(false)
    }
  })

  it('never is, for a row that is not there', () => {
    expect(worthReporting('query', api('PGRST116'))).toBe(false)
    expect(worthReporting('query', api('22P02'))).toBe(false)
  })

  it('never is, for something that is not this app’s', () => {
    expect(worthReporting('window', 'Script error.')).toBe(false)
    expect(worthReporting('window', new Error('ResizeObserver loop completed with undelivered notifications.'))).toBe(false)
    expect(worthReporting('window', new Error('boom'), 'chrome-extension://abcdef/content.js')).toBe(false)
    const fromExtension = new Error('boom')
    fromExtension.stack = 'Error: boom\n    at f (moz-extension://1234/inject.js:1:1)'
    expect(worthReporting('promise', fromExtension)).toBe(false)
    expect(worthReporting('window', new Error('boom'), 'https://rim-church-app.vercel.app/assets/index-abc.js')).toBe(true)
  })

  it('never is, for nothing at all', () => {
    for (const nothing of [null, undefined, '']) expect(worthReporting('promise', nothing)).toBe(false)
  })

  it('is, for a read the database could not answer because the app asked wrongly', () => {
    expect(worthReporting('query', api('PGRST202', 'Could not find the function public.new_thing in the schema cache'))).toBe(true)
    expect(worthReporting('query', api('42703', 'column profiles.shoe_size does not exist'))).toBe(true)
    expect(worthReporting('query', api('57014', 'canceling statement due to statement timeout'))).toBe(true)
  })

  it('is, for a read that was refused: a rule of the church’s returns fewer rows, never an error', () => {
    expect(worthReporting('query', api('42501', 'permission denied for table profiles'))).toBe(true)
  })

  it('is, for an answer the app could not read', () => {
    const refused = z.object({ paid: z.boolean() }).safeParse({ paid: null })
    expect(refused.success).toBe(false)
    if (!refused.success) {
      expect(worthReporting('query', refused.error)).toBe(true)
      expect(worthReporting('save', refused.error)).toBe(true)
    }
  })

  it('is not, for a read that failed in an ordinary way', () => {
    expect(worthReporting('query', api('P0001', 'No such ticket'))).toBe(false)
    expect(worthReporting('query', new Error('Could not load the rota'))).toBe(false)
  })

  it('is not, for a save the database rightly refused', () => {
    expect(worthReporting('save', api('42501', 'You may not change this registration.'))).toBe(false)
    expect(worthReporting('save', api('P0001', 'That ticket has sold out.'))).toBe(false)
    expect(worthReporting('save', api('23505', 'duplicate key value violates unique constraint'))).toBe(false)
    expect(worthReporting('save', new Error('Add a title first'))).toBe(false)
  })

  it('is, for a save that failed because the two disagree about what exists', () => {
    expect(worthReporting('save', api('PGRST204', "Could not find the 'email_status' column of 'registration_orders' in the schema cache"))).toBe(true)
    expect(worthReporting('save', new TypeError("Cannot read properties of null (reading 'id')"))).toBe(true)
  })
})

describe('what is said about an error', () => {
  it('is what it calls itself and its first line, with where it came from', () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'name')\nand a second line")
    error.stack = "TypeError: Cannot read…\n    at Row (Rota.tsx:10:3)"
    expect(describeError(error)).toEqual({
      message: "TypeError: Cannot read properties of undefined (reading 'name')",
      stack: "TypeError: Cannot read…\n    at Row (Rota.tsx:10:3)",
    })
  })

  it('adds which part of the page it was in, when React says', () => {
    const error = new Error('boom')
    error.stack = 'Error: boom\n    at f'
    expect(describeError(error, '\n    at Row\n    at RotaPage').stack).toBe('Error: boom\n    at f\n— in —\n    at Row\n    at RotaPage')
  })

  it('gives a database error’s code and message, and never its details: a refused row’s values are written there', () => {
    const said = describeError(api('42703', 'column profiles.shoe_size does not exist'))
    expect(said).toEqual({ message: '42703: column profiles.shoe_size does not exist', stack: null })
    expect(JSON.stringify(said)).not.toContain('somebody@example.org')
  })

  it('says where a schema refused an answer and why, never the value', () => {
    const refused = z.object({ order: z.object({ email: z.string().email(), paid: z.boolean() }) }).safeParse({ order: { email: 'secret-typo@', paid: null } })
    expect(refused.success).toBe(false)
    if (refused.success) return
    const { message } = describeError(refused.error)
    expect(message).toMatch(/^ZodError: order\.email: /)
    expect(message).toMatch(/\(and 1 more\)$/)
    expect(message).not.toContain('secret-typo')
  })

  it('takes a string as it is, and anything else as what it can', () => {
    expect(describeError('  it fell over  ').message).toBe('it fell over')
    expect(describeError({}).message).toBe('An error with nothing to say for itself')
    expect(describeError(42).message).toBe('42')
  })

  it('keeps both to what their columns hold', () => {
    const error = new Error('x'.repeat(900))
    error.stack = 's'.repeat(5000)
    const said = describeError(error)
    expect(said.message).toHaveLength(500)
    expect(said.stack).toHaveLength(2000)
  })
})

describe('the page it happened on', () => {
  it('is the path and nothing after it', () => {
    expect(scrubPage('/rota')).toBe('/rota')
    expect(scrubPage('/reset-password#access_token=SECRET&type=recovery')).toBe('/reset-password')
    expect(scrubPage('/prayer?tab=inbox')).toBe('/prayer')
  })

  it('never carries a ticket’s code, which is the key to the ticket', () => {
    expect(scrubPage('/ticket/ABCD1234EFGH')).toBe('/ticket/…')
    expect(scrubPage('/ticket/ABCD1234EFGH/print?x=1')).toBe('/ticket/…/print')
  })

  it('leaves a public page’s name alone', () => {
    expect(scrubPage('/register/harvest-supper')).toBe('/register/harvest-supper')
  })
})

describe('reporting one', () => {
  it('sends what it is, where, on which build and device, and answers the reference', async () => {
    window.history.replaceState(null, '', '/ticket/ABCD1234EFGH?from=email')
    const error = new Error('boom')
    error.stack = 'Error: boom\n    at f'
    await expect(reportError('page', error)).resolves.toBe('7F3K2Q9A')
    expect(rpc).toHaveBeenCalledTimes(1)
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe('report_client_error')
    expect(args).toMatchObject({ p_source: 'page', p_message: 'Error: boom', p_stack: 'Error: boom\n    at f', p_page: '/ticket/…', p_installed: false })
    expect(String(args.p_device)).toContain(navigator.userAgent.slice(0, 20))
    expect(JSON.stringify(args)).not.toContain('ABCD1234EFGH')
  })

  it('sends nothing that is not news', async () => {
    await expect(reportError('query', new TypeError('Failed to fetch'))).resolves.toBeNull()
    await expect(reportError('save', api('42501', 'You may not.'))).resolves.toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends nothing with no connection: there is nobody to tell', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    await expect(reportError('boundary', new Error('boom'))).resolves.toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends the same thing on the same page once, and answers the same reference again', async () => {
    const first = reportError('page', new Error('boom'), { now: 1_000 })
    const again = reportError('boundary', new Error('boom'), { now: 2_000 })
    await expect(first).resolves.toBe('7F3K2Q9A')
    await expect(again).resolves.toBe('7F3K2Q9A')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('sends it again once enough time has passed, so the database can count it', async () => {
    await reportError('page', new Error('boom'), { now: 1_000 })
    await reportError('page', new Error('boom'), { now: 1_000 + SAME_AGAIN_MS + 1 })
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('counts another page, and another error, as another thing', async () => {
    await reportError('page', new Error('boom'), { now: 1 })
    window.history.replaceState(null, '', '/songs')
    await reportError('page', new Error('boom'), { now: 2 })
    await reportError('page', new Error('bang'), { now: 3 })
    expect(rpc).toHaveBeenCalledTimes(3)
  })

  it('holds its tongue after a dozen different things in one page load: a loop must not become a flood', async () => {
    for (let i = 0; i < REPORTS_PER_LOAD + 8; i += 1) await reportError('window', new Error(`loop ${i}`), { now: i })
    expect(rpc).toHaveBeenCalledTimes(REPORTS_PER_LOAD)
    await expect(reportError('window', new Error('one more'), { now: 99 })).resolves.toBeNull()
  })

  it('answers null when the database kept nothing, or refused', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(reportError('page', new Error('past the limit'))).resolves.toBeNull()
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'app_closed' } })
    await expect(reportError('page', new Error('while closed'))).resolves.toBeNull()
  })

  it('never rejects and never throws, whatever goes wrong in the telling', async () => {
    rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(reportError('page', new Error('and the report failed too'))).resolves.toBeNull()
    rpc.mockImplementationOnce(() => {
      throw new Error('the client itself threw')
    })
    await expect(reportError('page', new Error('and the client threw'))).resolves.toBeNull()
  })
})

describe('listening for what nothing else catches', () => {
  function listeners() {
    const heard = new Map<string, (event: unknown) => void>()
    installErrorReporting({ addEventListener: (type: string, listener: unknown) => heard.set(type, listener as (event: unknown) => void) } as unknown as Window)
    return heard
  }

  it('reports an error thrown outside React', async () => {
    const heard = listeners()
    heard.get('error')?.({ error: new Error('in a timer'), message: 'Uncaught Error: in a timer', filename: 'https://rim-church-app.vercel.app/assets/index-abc.js' })
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_source: 'window', p_message: 'Error: in a timer' })
  })

  it('reports a promise nobody was waiting on', async () => {
    const heard = listeners()
    heard.get('unhandledrejection')?.({ reason: new Error('nobody awaited me') })
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1))
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_source: 'promise', p_message: 'Error: nobody awaited me' })
  })

  it('has no use for a picture that would not load, or an extension’s error', async () => {
    const heard = listeners()
    heard.get('error')?.({ error: null, message: '' })
    heard.get('error')?.({ error: new Error('theirs'), message: 'theirs', filename: 'chrome-extension://abc/x.js' })
    heard.get('unhandledrejection')?.({ reason: new TypeError('Failed to fetch') })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('the app and the database agree', () => {
  it('on which nets there are', () => {
    const allowed = /source in \(([^)]+)\)\)/.exec(migration)?.[1].match(/[a-z]+/g) ?? []
    expect([...allowed].sort()).toEqual([...ERROR_SOURCES].sort())
  })

  it('on how much of each text is kept', () => {
    expect(migration).toContain("length(message) between 1 and 500")
    expect(migration).toContain('length(stack) <= 2000')
    expect(migration).toContain('length(device) <= 200')
    expect(migration).toContain('length(page) <= 200')
  })
})
