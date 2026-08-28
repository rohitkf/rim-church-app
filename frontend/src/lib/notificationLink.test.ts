import { describe, expect, it } from 'vitest'
import { NOTIFICATION_TYPES, notificationHref, notificationLabel } from './notificationLink'

describe('notificationLabel', () => {
  it('says what happened in a sentence', () => {
    expect(notificationLabel('message')).toBe('New message board post')
  })

  it('falls back to the raw type rather than to nothing', () => {
    expect(notificationLabel('something_new')).toBe('something_new')
  })
})

describe('notificationHref', () => {
  it('sends each notification to the page it came from', () => {
    expect(notificationHref('message')).toBe('/messages')
    expect(notificationHref('rota_release_request')).toBe('/rota')
    expect(notificationHref('team_join_requested')).toBe('/departments')
  })

  it('deep-links to the team you were added to, when it says which', () => {
    expect(notificationHref('team_join_approved', 'dept-1')).toBe('/departments/dept-1')
    expect(notificationHref('team_join_approved', null)).toBe('/departments')
  })

  it('sends an unrecognised type somewhere rather than nowhere', () => {
    expect(notificationHref('something_new')).toBe('/')
  })

  it('has a destination for every type the database can produce', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(notificationHref(type)).toMatch(/^\//)
      expect(notificationLabel(type)).not.toBe(type)
    }
  })
})
