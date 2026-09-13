import { describe, expect, it } from 'vitest'
import { momentLabel } from './countdown'

/*
 * A clock says how long is left and never says when that is. Somebody
 * reading "6d 00:00:28 to answer" has to do arithmetic to find out whether
 * the deadline is Saturday night or Sunday morning — and then trust it.
 */
describe('the moment a countdown runs out', () => {
  const now = new Date('2026-09-13T12:00:00').getTime()

  it('says a time alone when it is today, because the day is not in question', () => {
    expect(momentLabel('2026-09-13T14:15:00', now)).toBe('2:15pm')
  })

  it('names tomorrow as tomorrow', () => {
    expect(momentLabel('2026-09-14T23:59:00', now)).toBe('11:59pm tomorrow')
  })

  it('takes a weekday inside the week ahead', () => {
    expect(momentLabel('2026-09-19T23:59:00', now)).toMatch(/^11:59pm Sat/)
  })

  /*
   * "Sat" a fortnight out is the wrong Saturday, so it takes a date. The
   * order of day and month is the reader's own — this runs in whatever
   * locale their browser is set to — so what matters is that both are
   * there.
   */
  it('takes a date beyond that', () => {
    const said = momentLabel('2026-09-27T23:59:00', now)!
    expect(said).toContain('11:59pm')
    expect(said).toContain('27')
    expect(said).toContain('Sep')
    expect(said).not.toMatch(/Sun|Mon|Tue|Wed|Thu|Fri|Sat/)
  })

  it('has nothing to say about a moment that is not one', () => {
    expect(momentLabel('not a date', now)).toBeNull()
  })
})
