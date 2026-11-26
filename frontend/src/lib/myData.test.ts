import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
const signOut = vi.hoisted(() => vi.fn(() => Promise.resolve({ error: null })))
vi.mock('./supabaseClient', () => ({ supabase: { rpc, auth: { signOut } } }))

import { closedJustNow, countMyData, deleteMyAccount, fetchMyData, isOwnEmail, leaveAfterClosing, myDataDocumentName, myDataFileName } from './myData'
import migration from '../../../supabase/migrations/0334_a_second_step_and_your_own_data.sql?raw'

/*
 * Your own data, in your own hands (0334): a copy of it, and removing the
 * account, without having to ask anybody.
 */
beforeEach(() => {
  rpc.mockReset()
  sessionStorage.clear()
})

describe('a copy of what is kept', () => {
  it('names the file by the day it was made, the document and the data file alike', () => {
    expect(myDataFileName(new Date(2026, 10, 6))).toBe('my-data-2026-11-06.json')
    expect(myDataDocumentName(new Date(2026, 10, 6))).toBe('my-data-2026-11-06.html')
  })

  it('counts what came back, and does not trip on an answer it cannot read', () => {
    expect(countMyData({ tables: { profiles: [{}], messages: [{}, {}], odd: 'x' } })).toEqual({ tables: 2, rows: 3 })
    expect(countMyData(null)).toEqual({ tables: 0, rows: 0 })
    expect(countMyData({})).toEqual({ tables: 0, rows: 0 })
  })

  it('is the database’s answer, as given', async () => {
    rpc.mockResolvedValue({ data: { tables: { profiles: [{ first_name: 'Grace' }] } }, error: null })
    expect(await fetchMyData()).toEqual({ tables: { profiles: [{ first_name: 'Grace' }] } })
    expect(rpc).toHaveBeenCalledWith('my_data')
  })

  it('is found, not listed: every table whose rows go with an account, bar the browser’s keys and the bookkeeping', () => {
    expect(migration).toContain("c.confdeltype = 'c'")
    expect(migration).toContain("c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)")
    for (const left of ['push_subscriptions', 'registration_order_undos', 'clock_in_reminded', 'profile_completions', 'reception_event_limits']) {
      expect(migration).toContain(`'${left}'`)
    }
    // Only ever the rows of the person asking.
    expect(migration).toContain("from %s t where t.%I = $1")
    expect(migration).toContain('revoke all on function public.my_data() from public, anon;')
  })
})

describe('removing your own account', () => {
  it('takes the account’s own email address as the word, however it is cased or spaced', () => {
    expect(isOwnEmail(' Grace@Example.com ', 'grace@example.com')).toBe(true)
    expect(isOwnEmail('grace@example.co', 'grace@example.com')).toBe(false)
    expect(isOwnEmail('', 'grace@example.com')).toBe(false)
    expect(isOwnEmail('x', null)).toBe(false)
  })

  it('sends what was typed for the database to check again, and passes its refusal on', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await deleteMyAccount('grace@example.com')
    expect(rpc).toHaveBeenCalledWith('delete_my_account', { p_email: 'grace@example.com' })
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'The Owner’s account cannot be removed. Hand the app to somebody else first.' } })
    await expect(deleteMyAccount('owner@example.com')).rejects.toMatchObject({ code: 'P0001' })
  })

  it('refuses the Owner and a wrong address in the database, whatever the page allowed', () => {
    const fn = migration.slice(migration.indexOf('create or replace function public.delete_my_account'), migration.indexOf('revoke all on function public.delete_my_account'))
    expect(fn).toContain('if public.is_super_admin(me) then')
    expect(fn).toContain("lower(btrim(coalesce(p_email, ''))) <> lower(addr)")
    expect(fn).toContain('delete from auth.users where id = me;')
    expect(fn).toContain('set search_path = public')
  })

  it('leaves a note for the sign-in page before the database is asked, and takes it back on a refusal', async () => {
    // Before: the moment the account is gone, every other request in flight is refused as
    // "account removed" and the browser is on its way to the sign-in page with that story.
    let notedWhileAsking = false
    rpc.mockImplementationOnce(() => {
      notedWhileAsking = closedJustNow()
      return Promise.resolve({ data: null, error: null })
    })
    await deleteMyAccount('grace@example.com')
    expect(notedWhileAsking).toBe(true)
    // The browser can reach the sign-in page twice in a second (sent by the refusal, then by
    // this file): the second arrival says the same as the first. Then it lapses by itself.
    expect(closedJustNow()).toBe(true)
    expect(closedJustNow()).toBe(true)
    expect(closedJustNow(Date.now() + 3 * 60_000)).toBe(false)

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'no' } })
    await expect(deleteMyAccount('wrong@example.com')).rejects.toBeTruthy()
    expect(closedJustNow()).toBe(false)
  })

  it('then forgets the session and starts again at the sign-in page', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    await leaveAfterClosing()
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(assign).toHaveBeenCalledWith('/login')
    vi.unstubAllGlobals()
  })
})
