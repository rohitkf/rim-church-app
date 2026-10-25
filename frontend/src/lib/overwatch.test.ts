import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './appSettings'
import { overwatchMay, overwatchOpens, overwatchPageKey } from './overwatch'

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

  it('may do one of its five things only with the switch on and the page open', () => {
    const settings = { ...DEFAULT_SETTINGS }
    expect(overwatchMay(settings, 'chat')).toBe(true)
    expect(overwatchMay({ ...settings, overwatch_chat_posts: false }, 'chat')).toBe(false)
    expect(overwatchMay({ ...settings, overwatch_pages: { 'team-chat': false } }, 'chat')).toBe(false)
    expect(overwatchMay({ ...settings, overwatch_pages: { 'team-chat': false } }, 'board')).toBe(true)
  })
})
