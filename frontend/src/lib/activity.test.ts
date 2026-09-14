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

  /*
   * The hole the feed used to have. Somebody could answer and then take the
   * answer away, and the second half was never written down — so the rota
   * lost a name with nothing on the dashboard to say why.
   */
  it('says so when an answer is taken back', () => {
    expect(say('availability', 'Audio', 'removed')).toBe('took their answer back — Audio')
  })

  /*
   * An Admin answering for somebody over the phone is a different event
   * from that person changing their own mind, and the feed is the only
   * place the difference can be seen.
   */
  it('names whose answer it was when somebody else changed it', () => {
    expect(say('availability', 'Audio', 'available for Grace Mensah')).toBe(
      'marked Grace Mensah available — Audio',
    )
    expect(say('availability', 'Audio', 'tentative for Grace Mensah')).toBe(
      'marked Grace Mensah a maybe — Audio',
    )
    expect(say('availability', 'Audio', 'removed for Grace Mensah')).toBe(
      "took Grace Mensah's answer off — Audio",
    )
  })

  /*
   * An answer can carry a sentence — "there, but not until 9.30" — and
   * that changes a morning as much as the yes does.
   */
  it('says when the note beside an answer changes', () => {
    expect(say('availability', 'Audio', 'note added')).toBe('added a note — Audio')
    expect(say('availability', 'Audio', 'note changed')).toBe('changed their note — Audio')
    expect(say('availability', 'Audio', 'note removed')).toBe('took their note off — Audio')
  })

  it('names whose note it was when an Admin corrected it', () => {
    expect(say('availability', 'Audio', 'note added for Grace Mensah')).toBe(
      'added a note for Grace Mensah — Audio',
    )
    expect(say('availability', 'Audio', 'note changed for Grace Mensah')).toBe(
      "changed Grace Mensah's note — Audio",
    )
    expect(say('availability', 'Audio', 'note removed for Grace Mensah')).toBe(
      "took Grace Mensah's note off — Audio",
    )
  })

  it('reads as a predicate, so the feed can put a name in front of it', () => {
    expect(say('attendance', 'Audio', 'turned up')).toBe('turned up — Audio')
    expect(say('checklist', 'Line check', 'signed off')).toBe('signed off Line check')
    expect(say('planner', 'Worship Set', 'added')).toBe('added Worship Set in the running order')
  })

  it('says an attendance mark being undone, and who it was about', () => {
    expect(say('attendance', 'Audio', 'attendance cleared')).toBe(
      'cleared their attendance mark — Audio',
    )
    expect(say('attendance', 'Audio', 'attendance cleared for Grace Mensah')).toBe(
      "cleared Grace Mensah's attendance mark — Audio",
    )
    expect(say('attendance', 'Audio', 'did not turn up for Grace Mensah')).toBe(
      'marked Grace Mensah as did not turn up — Audio',
    )
  })

  /*
   * A date moving takes every rota, checklist and answer with it, and it
   * was the one change nothing in the feed mentioned.
   */
  it('says what happened to the service itself', () => {
    expect(say('service', 'English Service', 'added')).toBe('added English Service')
    expect(say('service', 'English Service', 'moved to Sunday 20 Sep')).toBe(
      'moved English Service to Sunday 20 Sep',
    )
    expect(say('service', 'Evening Service', 'renamed from English Service')).toBe(
      'renamed English Service to Evening Service',
    )
    expect(say('service', 'English Service', 'called the end')).toBe(
      'called the end of English Service',
    )
    expect(say('service', 'English Service', 'reopened')).toBe('reopened English Service')
  })

  it('says when a team is told to be in, and when that changes', () => {
    expect(say('call_time', 'Audio', 'called in at 08:00')).toBe('called Audio in at 08:00')
    expect(say('call_time', 'Audio', 'call time moved to 08:30')).toBe(
      "moved Audio's call time to 08:30",
    )
    expect(say('call_time', 'Audio', 'call time removed')).toBe("took Audio's call time off")
  })

  it('says a late request and the answer it got', () => {
    expect(say('availability_request', 'Audio', 'asked to be marked available after the deadline')).toBe(
      'asked to be marked available after the deadline — Audio',
    )
    expect(say('availability_request', 'Audio', "turned down Grace Mensah's late change")).toBe(
      "turned down Grace Mensah's late change — Audio",
    )
  })

  it('says what happened to a team’s minutes', () => {
    expect(say('debrief', 'Audio', 'wrote up the debrief')).toBe("wrote up Audio's debrief")
    expect(say('debrief', 'Audio', 'updated the debrief')).toBe("updated Audio's debrief")
    expect(say('debrief', 'Audio', 'removed the debrief')).toBe("took Audio's debrief down")
  })

  it('says a song going on and coming off', () => {
    expect(say('set_list', 'Great Is Thy Faithfulness', 'added to the set list')).toBe(
      'added Great Is Thy Faithfulness to the set list',
    )
    expect(say('set_list', 'Great Is Thy Faithfulness', 'taken off the set list')).toBe(
      'took Great Is Thy Faithfulness off the set list',
    )
  })

  /*
   * More than one person can take a session, so the line has to name which
   * one went on — "changed Worship 1" said nothing anybody could act on.
   */
  it('names who went on and off a running-order session', () => {
    expect(say('planner', 'Worship 1', 'Grace Mensah put on')).toBe('put Grace Mensah on Worship 1')
    expect(say('planner', 'Worship 1', 'Grace Mensah taken off')).toBe(
      'took Grace Mensah off Worship 1',
    )
  })

  /*
   * The row that holds every tick, verification and sign-off for a team.
   * Deleting it takes all of them with it, so it cannot be silent.
   */
  it('says a team’s checklist being started and taken down', () => {
    expect(say('checklist', 'Audio', 'started the checklist')).toBe("started Audio's checklist")
    expect(say('checklist', 'Audio', 'took the checklist down')).toBe("took Audio's checklist down")
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
    // And before the actor fix, a bare "changed" for a session.
    expect(say('planner', 'Worship 1', 'changed')).toBe('changed Worship 1 in the running order')
  })
})

describe('activityTone', () => {
  it('gives each kind its own accent, and anything else a neutral one', () => {
    expect(activityTone('availability')).not.toBe(activityTone('rota'))
    expect(activityTone('service')).not.toBe(activityTone('availability'))
    expect(activityTone('mystery')).toBe('bg-on-surface-faint')
  })

  /*
   * Every kind the triggers write has to come out coloured: a neutral dot
   * is what the feed shows for something it does not understand.
   */
  it('has a colour for every kind the database writes', () => {
    for (const kind of [
      'availability',
      'attendance',
      'checklist',
      'rota',
      'planner',
      'service',
      'call_time',
      'availability_request',
      'debrief',
      'set_list',
    ]) {
      expect(activityTone(kind)).not.toBe('bg-on-surface-faint')
    }
  })
})
