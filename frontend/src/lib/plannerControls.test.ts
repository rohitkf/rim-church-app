import { describe, expect, it } from 'vitest'
import {
  NO_CONTROLS,
  controlGrantChanges,
  controlsFromGrants,
  controlsHeld,
  plannerControlsSchema,
  toggleControl,
  withHolder,
  type PlannerControl,
} from './plannerControls'

describe('the planner’s buttons, given to a team or a person', () => {
  it('reads what is stored, dropping a button this app does not know', () => {
    expect(plannerControlsSchema.parse({ teams: { t1: ['start', 'fly', 'end'] }, people: { p1: 'oops' } })).toEqual({
      teams: { t1: ['start', 'end'] },
      people: { p1: [] },
    })
    expect(plannerControlsSchema.parse({})).toEqual(NO_CONTROLS)
    expect(plannerControlsSchema.parse(null)).toEqual(NO_CONTROLS)
  })

  it('gives somebody their own buttons and every team’s they are on, and nobody else’s', () => {
    const mine = controlsHeld(
      { teams: { media: ['start', 'add_time'], sound: ['end'] }, people: { me: ['hold'], you: ['remove'] } },
      { id: 'me', teamIds: ['media'] },
    )
    expect([...mine].sort()).toEqual(['add_time', 'hold', 'start'])
    expect(controlsHeld(NO_CONTROLS, { id: 'me', teamIds: ['media'] }).size).toBe(0)
    // Previewing as a team: no name of one's own.
    expect([...controlsHeld({ teams: {}, people: { me: ['hold'] } }, { id: null, teamIds: [] })]).toEqual([])
  })

  it('keeps each holder’s buttons in the menu’s order, and removes a holder outright', () => {
    let c = withHolder(NO_CONTROLS, 'people', 'p1', ['end', 'start'])
    expect(c.people.p1).toEqual(['start', 'end'])
    c = toggleControl(c, 'people', 'p1', 'skip')
    expect(c.people.p1).toEqual(['start', 'skip', 'end'])
    c = toggleControl(c, 'people', 'p1', 'start')
    expect(c.people.p1).toEqual(['skip', 'end'])
    c = withHolder(c, 'people', 'p1', null)
    expect(c).toEqual(NO_CONTROLS)
  })
})

/*
 * Since 0211 each button is a capability, `planner.<key>`, and each holder's
 * tick a grant. The room still edits holders and ticks; these turn one into
 * the other and back.
 */
describe('the buttons as grants', () => {
  it('reads holders and their buttons, in the menu’s order, from the grants', () => {
    expect(
      controlsFromGrants([
        { capability: 'planner.skip', userId: null, departmentId: 'media', reach: 'all' },
        { capability: 'planner.start', userId: null, departmentId: 'media', reach: 'all' },
        { capability: 'planner.end', userId: 'asha', departmentId: null, reach: 'all' },
        { capability: 'rota.assign', userId: 'asha', departmentId: null, reach: 'all' },
        { capability: 'planner.warp', userId: 'asha', departmentId: null, reach: 'all' },
      ]),
    ).toEqual({ teams: { media: ['start', 'skip'] }, people: { asha: ['end'] } })
  })

  it('gives what was ticked and takes back what was not, and nothing else', () => {
    const stored = { teams: { media: ['start', 'skip'] as PlannerControl[] }, people: {} }
    const next = { teams: { media: ['start', 'add_time'] as PlannerControl[] }, people: { asha: ['end'] as PlannerControl[] } }
    expect(controlGrantChanges(stored, next)).toEqual([
      { capability: 'planner.add_time', team: 'media', reach: 'all' },
      { capability: 'planner.skip', team: 'media', reach: null },
      { capability: 'planner.end', person: 'asha', reach: 'all' },
    ])
    expect(controlGrantChanges(stored, stored)).toEqual([])
  })
})
