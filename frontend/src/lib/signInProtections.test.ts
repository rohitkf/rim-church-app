import { describe, expect, it } from 'vitest'
import { IDLE_SIGN_OUT_DAYS, idleTooLong, lastUsed, noteIdleSignOut, noteUse, takeIdleNotice } from './idleSignOut'
import { TRIES_BEFORE_A_WAIT, forgetTries, noteWrongPassword, waitFor, waitWords } from './signInTries'
import { seenInBreaches, timesSeen } from './breachedPassword'
import authContext from '../auth/AuthContext.tsx?raw'
import loginPage from '../pages/LoginPage.tsx?raw'
import signupPage from '../pages/SignupPage.tsx?raw'
import resetPage from '../pages/ResetPasswordPage.tsx?raw'

/*
 * Three things the sign-in page did not do (the security rules the Owner
 * asked the app to be held to, November 2026), each built in the app
 * because the plan the church is on does not sell the server's version:
 * a session that ends, a wait after wrong passwords, and a password that
 * is not already in somebody's breach.
 */

function memory(): Storage {
  const held = new Map<string, string>()
  return {
    getItem: (k) => held.get(k) ?? null,
    setItem: (k, v) => void held.set(k, v),
    removeItem: (k) => void held.delete(k),
    clear: () => held.clear(),
    key: () => null,
    get length() {
      return held.size
    },
  }
}
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 26, 9)

describe('a device nobody has used for a month', () => {
  it('is signed out, and one used yesterday is not', () => {
    const store = memory()
    noteUse(NOW - (IDLE_SIGN_OUT_DAYS + 1) * DAY, store)
    expect(idleTooLong(NOW, store)).toBe(true)
    noteUse(NOW - DAY, store)
    expect(idleTooLong(NOW, store)).toBe(false)
  })

  it('does not end a session on the first visit after this was built', () => {
    // No date remembered: the count starts now. Nobody opens the app to a locked door for it.
    const store = memory()
    expect(idleTooLong(NOW, store)).toBe(false)
    noteUse(NOW, store)
    expect(lastUsed(store)).toBe(NOW)
  })

  it('is exactly thirty days: the gap between two Sundays is nowhere near it', () => {
    const store = memory()
    noteUse(NOW - 30 * DAY + 1000, store)
    expect(idleTooLong(NOW, store)).toBe(false)
    expect(IDLE_SIGN_OUT_DAYS).toBe(30)
  })

  it('writes at most once an hour, however often the app says it is in use', () => {
    const store = memory()
    noteUse(NOW, store)
    noteUse(NOW + 10 * 60 * 1000, store)
    expect(lastUsed(store)).toBe(NOW)
    noteUse(NOW + 61 * 60 * 1000, store)
    expect(lastUsed(store)).toBe(NOW + 61 * 60 * 1000)
  })

  it('tells the sign-in page why, once, and starts the count again', () => {
    const store = memory()
    const tab = memory()
    noteUse(NOW - 40 * DAY, store)
    noteIdleSignOut(store, tab)
    expect(lastUsed(store)).toBeNull()
    expect(takeIdleNotice(tab)).toBe(true)
    expect(takeIdleNotice(tab)).toBe(false)
  })

  it('is checked as the app opens, before anything is read, and signs out this device only', () => {
    // Asked before the session is fetched or listened for: the browser's
    // kept session is announced to the listener at once, and that
    // announcement counted as use would mean nobody was ever signed out
    // (found in the browser, not by these tests, the day this was built).
    const asked = authContext.indexOf('let stoodIdle = idleTooLong()')
    expect(asked).toBeGreaterThan(-1)
    expect(asked).toBeLessThan(authContext.indexOf('.getSession()'))
    expect(asked).toBeLessThan(authContext.indexOf('supabase.auth.onAuthStateChange('))
    expect(authContext).toContain('if (nextSession && !stoodIdle) noteUse()')
    const check = authContext.indexOf('if (session && stoodIdle)')
    expect(check).toBeGreaterThan(-1)
    expect(check).toBeLessThan(authContext.indexOf('return loadProfileAndRoles(session.user.id)'))
    expect(authContext).toContain("await supabase.auth.signOut({ scope: SIGN_OUT_SCOPE }).catch(() => undefined)")
    expect(loginPage).toContain('takeIdleNotice()')
  })
})

describe('wrong passwords at the sign-in page', () => {
  it('lets four go by and makes the fifth wait a minute', () => {
    const store = memory()
    for (let i = 0; i < TRIES_BEFORE_A_WAIT - 1; i++) expect(noteWrongPassword('ada@example.org', NOW + i, store)).toBe(0)
    expect(waitFor('ada@example.org', NOW + 10, store)).toBe(0)
    expect(noteWrongPassword('ada@example.org', NOW + 10, store)).toBe(60 * 1000)
    expect(waitFor('ada@example.org', NOW + 20, store)).toBeGreaterThan(0)
    expect(waitFor('ada@example.org', NOW + 61 * 1000, store)).toBe(0)
  })

  it('waits longer each time: one minute, five, then fifteen', () => {
    const store = memory()
    const round = (start: number) => {
      let earned = 0
      for (let i = 0; i < TRIES_BEFORE_A_WAIT; i++) earned = noteWrongPassword('ada@example.org', start + i, store)
      return earned
    }
    expect(round(NOW)).toBe(60 * 1000)
    expect(round(NOW + 2 * 60 * 1000)).toBe(5 * 60 * 1000)
    expect(round(NOW + 10 * 60 * 1000)).toBe(15 * 60 * 1000)
    expect(round(NOW + 40 * 60 * 1000)).toBe(15 * 60 * 1000)
  })

  it('counts each email on its own, however it is typed', () => {
    const store = memory()
    for (let i = 0; i < TRIES_BEFORE_A_WAIT; i++) noteWrongPassword(' Ada@Example.org ', NOW + i, store)
    expect(waitFor('ada@example.org', NOW + 10, store)).toBeGreaterThan(0)
    expect(waitFor('grace@example.org', NOW + 10, store)).toBe(0)
  })

  it('forgets slips more than a quarter of an hour old, and everything once signed in', () => {
    const store = memory()
    for (let i = 0; i < TRIES_BEFORE_A_WAIT - 1; i++) noteWrongPassword('ada@example.org', NOW + i, store)
    expect(noteWrongPassword('ada@example.org', NOW + 16 * 60 * 1000, store)).toBe(0)
    forgetTries('ada@example.org', store)
    for (let i = 0; i < TRIES_BEFORE_A_WAIT - 1; i++) expect(noteWrongPassword('ada@example.org', NOW + 20 * 60 * 1000 + i, store)).toBe(0)
  })

  it('says the wait in words', () => {
    expect(waitWords(60 * 1000)).toBe('1 minute')
    expect(waitWords(5 * 60 * 1000)).toBe('5 minutes')
    expect(waitWords(41 * 1000)).toBe('41 seconds')
  })

  it('counts only a wrong password, not a connection that failed, and stops before asking the server', () => {
    expect(loginPage).toContain('if (!/invalid login credentials/i.test(message)) return message')
    expect(loginPage.indexOf('const wait = waitFor(email)')).toBeLessThan(loginPage.indexOf('supabase.auth.signInWithPassword'))
  })
})

describe('a password already found in a breach', () => {
  // SHA-1 of "password": 5BAA6 1E4C9B93F3F0682250B6CF8331B7EE68FD8
  const answer = ['0018A45C4D1DEF81644B54AB7F969B88D65:1', '1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824', '011053FD0102E94D6AE2F8B83D76FAF94F6:0'].join('\r\n')

  it('is found among the fingerprints that start the same way, on the device', () => {
    expect(timesSeen(answer, '1E4C9B93F3F0682250B6CF8331B7EE68FD8')).toBe(9545824)
    expect(timesSeen(answer, 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBe(0)
  })

  it('sends five characters of the fingerprint and never the password', async () => {
    const asked: string[] = []
    const ask = ((url: string) => {
      asked.push(url)
      return Promise.resolve(new Response(answer))
    }) as unknown as typeof fetch
    expect(await seenInBreaches('password', ask)).toBe(9545824)
    expect(asked).toEqual(['https://api.pwnedpasswords.com/range/5BAA6'])
    expect(await seenInBreaches('a long and unlikely passphrase 9041', ask)).toBe(0)
    // Every question is the address and five characters, nothing more.
    for (const url of asked) expect(url).toMatch(/^https:\/\/api\.pwnedpasswords\.com\/range\/[0-9A-F]{5}$/)
    expect(asked.join(' ')).not.toContain('passphrase')
  })

  it('stops nobody when it cannot be asked', async () => {
    const down = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    expect(await seenInBreaches('password', down)).toBeNull()
    const refusedAsk = (() => Promise.resolve(new Response('', { status: 503 }))) as unknown as typeof fetch
    expect(await seenInBreaches('password', refusedAsk)).toBeNull()
  })

  it('is asked wherever a password is chosen, before it is sent to be stored', () => {
    expect(signupPage.indexOf('seenInBreaches(password)')).toBeGreaterThan(-1)
    expect(signupPage.indexOf('seenInBreaches(password)')).toBeLessThan(signupPage.indexOf('supabase.auth.signUp('))
    expect(resetPage.indexOf('seenInBreaches(password)')).toBeLessThan(resetPage.indexOf('supabase.auth.updateUser({ password })'))
  })
})
