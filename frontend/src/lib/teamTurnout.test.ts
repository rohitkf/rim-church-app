import { describe, expect, it } from 'vitest'
import { turnoutRing } from './teamTurnout'
import { availabilitySummary } from './availabilitySummary'
import { turnoutFrom } from './turnout'

type Answer = Parameters<typeof turnoutFrom>[1][number]

const ring = (memberIds: string[], answers: Answer[]) =>
  turnoutRing(availabilitySummary(memberIds, answers), turnoutFrom(memberIds, answers))

/** A team of ten: `yes` said they would come, `came` of those turned up,
 *  `noShow` of them did not, and the rest have not been marked. */
const team = ({ yes, came = 0, noShow = 0 }: { yes: number; came?: number; noShow?: number }) => {
  const ids = Array.from({ length: 10 }, (_, i) => `m${i}`)
  const answers: Answer[] = ids.slice(0, yes).map((id, i) => ({
    user_id: id,
    status: 'available' as const,
    attended: i < came ? true : i < came + noShow ? false : null,
  }))
  return ring(ids, answers)
}

/*
 * A team is two questions a week apart: how much of it is coming, and how
 * much of it is here. The tile used to answer only the second, and only
 * once somebody had started marking people in — so all week it showed an
 * empty ring and a count, and whoever was planning on Saturday night had
 * no number at all.
 */
describe('before anybody is marked', () => {
  it('shows what the team said it would do', () => {
    const r = team({ yes: 7 })
    expect(r.state).toBe('predicted')
    expect(r.predictedPct).toBe(70)
    expect(r.pct).toBe(70)
    expect(r.caption).toBe('70% expected')
    expect(r.detail).toBe('7 of 10 said yes · 3 unanswered')
  })

  // A prediction is not a fact and should not wear the colour of one.
  it('stays grey, because none of it has happened yet', () => {
    const r = team({ yes: 7 })
    expect(r.color).not.toContain('green')
    expect(r.color).not.toContain('orange')
    expect(r.actualPct).toBeNull()
  })

  it('counts silence against the team rather than shrinking the denominator', () => {
    // Two of ten said yes and the other eight never answered: 20%, not 100%.
    expect(team({ yes: 2 }).predictedPct).toBe(20)
  })

  it('is red and empty when nobody said they could serve', () => {
    const r = team({ yes: 0 })
    expect(r.state).toBe('none-available')
    expect(r.pct).toBe(0)
    expect(r.color).toContain('red')
    expect(r.caption).toBe('Nobody available yet')
  })

  it('counts a team that answered no as nobody available, not as no data', () => {
    const r = ring(['a'], [{ user_id: 'a', status: 'unavailable', attended: null }])
    expect(r.state).toBe('none-available')
    expect(r.detail).toBe('0 of 1 said yes')
  })
})

/*
 * The register is filled in one name at a time. With seven expected and
 * one marked, turnout is technically 14% — a tile that shouts that at nine
 * in the morning is telling the truth in a way that misleads.
 */
describe('while the register is being filled in', () => {
  it('keeps the prediction as the headline and counts arrivals beside it', () => {
    const r = team({ yes: 7, came: 3 })
    expect(r.state).toBe('counting')
    expect(r.caption).toBe('70% expected')
    expect(r.detail).toBe('3 of 7 in so far')
    expect(r.pct).toBe(70)
  })

  it('still reports the real figure for anybody who wants it', () => {
    expect(team({ yes: 7, came: 3 }).actualPct).toBe(30)
  })

  it('stays grey until the last person is accounted for', () => {
    expect(team({ yes: 7, came: 6 }).color).not.toContain('green')
    expect(team({ yes: 7, came: 6 }).state).toBe('counting')
  })
})

describe('once everyone who said yes has been marked', () => {
  it('hands the headline to what actually happened', () => {
    const r = team({ yes: 7, came: 5, noShow: 2 })
    expect(r.state).toBe('settled')
    expect(r.caption).toBe('50% turned up')
    expect(r.detail).toBe('5 of 10 in · 2 no-show')
    expect(r.pct).toBe(50)
  })

  /*
   * Both figures are measured against the whole team, so they can be read
   * against each other — 70% expected, 50% turned up, and the gap is the
   * story. Measuring turnout against only the people who promised would
   * let the goalpost move with the answers.
   */
  it('measures both against the whole team, so the two compare', () => {
    const r = team({ yes: 7, came: 5, noShow: 2 })
    expect(r.predictedPct).toBe(70)
    expect(r.actualPct).toBe(50)
  })

  /*
   * The colour answers the narrower question the number cannot. Seven of
   * ten said yes and all seven came: 70% of the roster, and the team did
   * everything it said it would. The missing three are an availability
   * problem — already visible in the prediction — not a turnout one.
   */
  it('goes green when everybody who promised turned up, even below 100%', () => {
    const r = team({ yes: 7, came: 7 })
    expect(r.state).toBe('settled')
    expect(r.actualPct).toBe(70)
    expect(r.color).toContain('green')
    expect(r.detail).toBe('7 of 10 in · expected 70%')
  })

  it('goes orange when some of those who promised did not come', () => {
    expect(team({ yes: 7, came: 5, noShow: 2 }).color).toContain('orange')
  })

  it('goes red when nobody who promised came', () => {
    const r = team({ yes: 3, noShow: 3 })
    expect(r.color).toContain('red')
    expect(r.actualPct).toBe(0)
  })
})
