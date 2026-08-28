import { describe, expect, it } from 'vitest'
import { activitySentence, activityTone } from './activity'

const say = (kind: string, subject: string | null, detail: string | null) =>
  activitySentence({ kind, subject, detail })

describe('activitySentence', () => {
  it('says availability in words rather than in enum values', () => {
    expect(say('availability', 'Audio', 'available')).toBe('can serve — Audio')
    expect(say('availability', 'Audio', 'tentative')).toBe('might be able to serve — Audio')
    expect(say('availability', 'Audio', 'unavailable')).toBe("can't serve — Audio")
  })

  it('reads as a predicate, so the feed can put a name in front of it', () => {
    expect(say('attendance', 'Audio', 'turned up')).toBe('turned up — Audio')
    expect(say('checklist', 'Line check', 'signed off')).toBe('signed off Line check')
    expect(say('planner', 'Worship Set', 'added')).toBe('added Worship Set in the running order')
  })

  it('turns the rota’s "X assigned" into who did it to whom', () => {
    expect(say('rota', 'Monitors', 'Dave Smith assigned')).toBe('put Dave Smith on Monitors')
    expect(say('rota', 'Monitors', 'Dave Smith taken off')).toBe('took Dave Smith off Monitors')
  })

  it('names the team a post spoke for', () => {
    expect(say('message', 'Audio', 'posted')).toBe('posted as Audio')
    expect(say('message', 'the board', 'posted')).toBe('posted on the board')
  })

  it('still says something for a kind this build has never heard of', () => {
    expect(say('something_new', 'a thing', 'did')).toBe('did a thing')
    expect(say('something_new', 'a thing', null)).toBe('a thing')
  })

  it('copes with a row missing its subject', () => {
    expect(say('checklist', null, 'ticked')).toBe('ticked off something')
  })

  it('shows a row written by an older build rather than dropping it', () => {
    // Rows written before the direction fix carry the raw stage name.
    expect(say('checklist', 'Clean Lens', 'pending')).toBe('pending Clean Lens')
  })
})

describe('activityTone', () => {
  it('gives each kind its own accent, and anything else a neutral one', () => {
    expect(activityTone('availability')).not.toBe(activityTone('rota'))
    expect(activityTone('mystery')).toBe('bg-on-surface-faint')
  })
})
