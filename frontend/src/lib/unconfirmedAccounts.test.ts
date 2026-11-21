import { describe, expect, it } from 'vitest'
import { UNCONFIRMED_ACCOUNT_DAYS } from './unconfirmedAccounts'
import migration from '../../../supabase/migrations/0317_an_account_never_confirmed_is_removed.sql?raw'

describe('how long an account may go unconfirmed', () => {
  it('is the number the database removes them after', () => {
    const days = /days constant integer := (\d+);/.exec(migration)
    expect(days).not.toBeNull()
    expect(Number(days![1])).toBe(UNCONFIRMED_ACCOUNT_DAYS)
  })

  it('is counted from when the link was last sent, so sending it again starts it over', () => {
    expect(migration).toContain('greatest(u.created_at, coalesce(u.confirmation_sent_at, u.created_at)) < now() - make_interval(days => days)')
  })

  it('leaves alone anybody invited, confirmed, signed in, or the Owner', () => {
    for (const rule of ['u.email_confirmed_at is null', 'u.phone_confirmed_at is null', 'u.last_sign_in_at is null', 'u.invited_at is null', 'public.app_owner']) {
      expect(migration).toContain(rule)
    }
  })

  it('is run by the timer and by nobody signed in', () => {
    expect(migration).toContain('revoke all on function public.delete_unconfirmed_accounts() from public, anon, authenticated;')
    expect(migration).toContain("cron.schedule('delete-unconfirmed-accounts'")
  })
})
