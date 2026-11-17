import { describe, expect, it } from 'vitest'
import senderSource from '../../../supabase/functions/registration-email/index.ts?raw'

/*
 * The email function's quiet ten minutes (registration-email/quiet.ts),
 * found by pattern like the other function files the app's tests run:
 * the function itself runs in Deno, where none of them do.
 */
interface Quiet {
  QUIET_MINUTES: number
  heldByQuiet: (orders: readonly { email_sent_at: string | null }[], nowMs: number, minutes?: number) => boolean
}
const [quiet] = Object.values(import.meta.glob('../../../supabase/functions/registration-email/quiet.ts', { eager: true })) as Quiet[]
const { QUIET_MINUTES, heldByQuiet } = quiet

const NOW = Date.UTC(2026, 10, 17, 10, 0, 0)
const ago = (minutes: number) => ({ email_sent_at: new Date(NOW - minutes * 60_000).toISOString() })
const never = { email_sent_at: null }

describe('the quiet ten minutes', () => {
  it('is ten minutes', () => {
    expect(QUIET_MINUTES).toBe(10)
  })

  it('holds an email back when its one ticket was emailed a moment ago', () => {
    expect(heldByQuiet([ago(1)], NOW)).toBe(true)
    expect(heldByQuiet([ago(9.9)], NOW)).toBe(true)
  })

  it('lets it go once ten minutes have passed, or when the ticket has never been emailed', () => {
    expect(heldByQuiet([ago(10)], NOW)).toBe(false)
    expect(heldByQuiet([ago(45)], NOW)).toBe(false)
    expect(heldByQuiet([never], NOW)).toBe(false)
  })

  it('does not hold a ticket that has never been sent because another under the same address just was', () => {
    // Registered at the usual price, then again by a personal invitation a minute later (0297):
    // the second ticket reaches its holder by this email and no other way.
    expect(heldByQuiet([ago(1), never], NOW)).toBe(false)
    expect(heldByQuiet([never, ago(1)], NOW)).toBe(false)
    // One sent long ago beside one sent just now: there is still something that has not gone lately.
    expect(heldByQuiet([ago(1), ago(120)], NOW)).toBe(false)
  })

  it('holds when every ticket was emailed in the last ten minutes: pressing again writes to nobody', () => {
    expect(heldByQuiet([ago(1), ago(2), ago(9)], NOW)).toBe(true)
  })

  it('has nothing to hold when there is nothing to send', () => {
    expect(heldByQuiet([], NOW)).toBe(false)
  })

  it('is what the function asks, for the attendee’s own two kinds and no others', () => {
    expect(senderSource).toContain("import { heldByQuiet } from './quiet.ts'")
    expect(senderSource).toMatch(/if \(kind === 'confirm' \|\| kind === 'resend'\) \{[\s\S]{0,400}if \(heldByQuiet\(orders, Date\.now\(\)\)\) return json\(\{ ok: true, sent: false \}\)/)
    // The old rule, which held everything back when any one ticket had been sent.
    expect(senderSource).not.toContain('orders.some((o) => o.email_sent_at')
  })
})
