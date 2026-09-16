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
 * much of it is here. They are more useful together than in sequence, so
 * both figures sit in the row all week — the tile used to carry neither
 * until somebody started marking people in.
 */
describe('before anybody is marked', () => {
  it('shows what the team said it would do', () => {
    const r = team({ yes: 7 })
    expect(r.state).toBe('predicted')
    expect(r.predictedPct).toBe(70)
    expect(r.expectedSub).toBe('7 of 10')
    expect(r.toAnswer).toBe(3)
  })

  // A turnout figure of 0% would read as "nobody came"; nobody has been
  // asked yet, which is a different thing.
  it('says nothing rather than zero about a turnout nobody has recorded', () => {
    const r = team({ yes: 7 })
    expect(r.actualPct).toBeNull()
    expect(r.actualValue).toBe('—')
    expect(r.actualSub).toBe('not yet')
  })

  // A prediction is not a fact and should not wear the colour of one.
  it('stays grey, because none of it has happened yet', () => {
    const r = team({ yes: 7 })
    expect(r.color).not.toContain('green')
    expect(r.color).not.toContain('orange')
  })

  it('counts silence against the team rather than shrinking the denominator', () => {
    // Two of ten said yes and the other eight never answered: 20%, not 100%.
    expect(team({ yes: 2 }).predictedPct).toBe(20)
  })

  it('is red and empty when nobody said they could serve', () => {
    const r = team({ yes: 0 })
    expect(r.state).toBe('none-available')
    expect(r.predictedPct).toBe(0)
    expect(r.color).toContain('red')
    expect(r.actualSub).toBe('nobody due')
  })

  it('counts a team that answered no as nobody available, not as no data', () => {
    const r = ring(['a'], [{ user_id: 'a', status: 'unavailable', attended: null }])
    expect(r.state).toBe('none-available')
    expect(r.expectedSub).toBe('0 of 1')
  })
})

/*
 * The register is filled in one name at a time. With seven expected and
 * one marked, turnout is technically 14% — a tile that shouts that at nine
 * in the morning is telling the truth in a way that misleads.
 */
describe('while the register is being filled in', () => {
  it('keeps both figures live, and says the turnout is still climbing', () => {
    const r = team({ yes: 7, came: 3 })
    expect(r.state).toBe('counting')
    expect(r.predictedPct).toBe(70)
    expect(r.actualPct).toBe(30)
    expect(r.actualValue).toBe('30%')
    expect(r.actualSub).toBe('3 of 7 so far')
  })

  /*
   * Grey until the last person is accounted for. A team reading 20%
   * because one of five has been marked is true in a way that misleads,
   * and a colour would make it look settled.
   */
  it('stays grey until the last person is accounted for', () => {
    expect(team({ yes: 7, came: 6 }).color).not.toContain('green')
    expect(team({ yes: 7, came: 6 }).state).toBe('counting')
  })
})

describe('once everyone who said yes has been marked', () => {
  it('reports what actually happened, and who was missing', () => {
    const r = team({ yes: 7, came: 5, noShow: 2 })
    expect(r.state).toBe('settled')
    expect(r.actualValue).toBe('50%')
    expect(r.actualSub).toBe('5 of 10 · 2 no-show')
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
    expect(r.predictedPct).toBe(70)
    expect(r.color).toContain('green')
    expect(r.actualSub).toBe('7 of 10')
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
