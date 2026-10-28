import { describe, expect, it } from 'vitest'
import { overwatchActOf, overwatchMay, overwatchOpens, overwatchPageKey } from './overwatch'

describe('what Overwatch sees and may do', () => {
  it('names a page by its route, as the database does, and never the dashboard', () => {
    expect(overwatchPageKey('/team-chat')).toBe('team-chat')
    expect(overwatchPageKey('/service-planner/abc')).toBe('service-planner')
    expect(overwatchPageKey('/')).toBeNull()
  })

  it('opens every page but Volunteers out of the box, and follows the church after', () => {
    expect(overwatchOpens('/rota', {})).toBe(true)
    expect(overwatchOpens('/volunteers', {})).toBe(false)
    expect(overwatchOpens('/', { volunteers: false })).toBe(true)
    expect(overwatchOpens('/volunteers', { volunteers: true })).toBe(true)
    expect(overwatchOpens('/team-chat', { 'team-chat': false })).toBe(false)
  })

  it('may do one of its five things only with its cell on and the page open (0214)', () => {
    expect(overwatchMay({}, {}, 'chat')).toBe(true)
    expect(overwatchMay({ 'msg.chat': { overwatch: 'none' } }, {}, 'chat')).toBe(false)
    // Another profile's cell on the same row is not Overwatch's.
    expect(overwatchMay({ 'msg.chat': { member: 'none' } }, {}, 'chat')).toBe(true)
    expect(overwatchMay({}, { 'team-chat': false }, 'chat')).toBe(false)
    expect(overwatchMay({}, { 'team-chat': false }, 'board')).toBe(true)
    expect(overwatchMay({ 'issue.as_overwatch': { overwatch: 'none' } }, {}, 'issues')).toBe(false)
  })

  it('knows which row each of the five is', () => {
    expect(overwatchActOf('msg.board_post')).toBe('board')
    expect(overwatchActOf('debrief.as_overwatch')).toBe('debriefs')
    expect(overwatchActOf('rota.assign')).toBeNull()
  })
})
