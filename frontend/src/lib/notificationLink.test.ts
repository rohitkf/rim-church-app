import { describe, expect, it } from 'vitest'
import { NOTIFICATION_TYPES, notificationHref, notificationLabel } from './notificationLink'
import pushSource from '../../../supabase/functions/push-notify/index.ts?raw'

describe('notificationLabel', () => {
  it('says what happened in a sentence', () => {
    expect(notificationLabel('message')).toBe('New message board post')
  })

  it('falls back to the raw type rather than to nothing', () => {
    expect(notificationLabel('something_new')).toBe('something_new')
  })
})

describe('an alert someone wrote', () => {
  it('says what they wrote, not the generic sentence for its type', () => {
    expect(notificationLabel('team_alert', 'Sound check at 8:30')).toBe('Sound check at 8:30')
  })

  it('falls back to the type when the body is empty rather than showing blank', () => {
    expect(notificationLabel('team_alert', '   ')).toBe('A message from your team')
    expect(notificationLabel('team_alert', null)).toBe('A message from your team')
  })
})

describe('notificationHref', () => {
  it('sends each notification to the page it came from', () => {
    expect(notificationHref('message')).toBe('/messages')
    expect(notificationHref('rota_release_request')).toBe('/rota')
    expect(notificationHref('team_join_requested')).toBe('/departments')
    expect(notificationHref('availability_reminder')).toBe('/availability')
    expect(notificationHref('checklist_reminder')).toBe('/checklists')
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

describe('a poll', () => {
  it('says what was asked when the question came with it', () => {
    expect(notificationLabel('team_poll', 'Which night suits rehearsal?')).toBe(
      'Which night suits rehearsal?',
    )
  })

  it('falls back to a sentence when it did not', () => {
    expect(notificationLabel('team_poll')).toBe('Your team has a question for you')
  })

  it('opens the room it was asked in', () => {
    expect(notificationHref('team_poll', 'dept-1')).toBe('/team-chat?team=dept-1')
  })

  it('still opens Team Chat without one', () => {
    expect(notificationHref('team_poll')).toBe('/team-chat')
  })
})

describe('somebody dropping off a rota', () => {
  /*
   * Raised by the database when a volunteer marks themselves unavailable
   * for a service they had a role on (0092): the role goes back to
   * unassigned and the head and assisting head are told.
   */
  it('takes the head to the rota, carrying the sentence the trigger wrote', () => {
    expect(notificationHref('rota_dropout')).toBe('/rota')
    expect(
      notificationLabel('rota_dropout', 'Jesson Sunny can no longer serve at English Service on Sunday 11 Oct — their Audio role is unassigned again'),
    ).toContain('can no longer serve')
  })

  it('has a sentence of its own if the body ever goes missing', () => {
    expect(notificationLabel('rota_dropout')).toBe('Somebody has dropped off your rota')
  })
})


/*
 * The push sender keeps its own copy of this map, because it runs in Deno
 * and the app runs in the browser. It has drifted twice — team_poll, then
 * rota_dropout and both availability-change types — and a drifted type
 * still pushes, it just says the generic line on the lock screen and a
 * tap lands on the dashboard. Nobody notices that by reading a diff.
 */
describe('the push sender’s copy of the map', () => {
  const sender = pushSource.slice(
    pushSource.indexOf('const NOTIFICATIONS'),
    pushSource.indexOf('\n}\n', pushSource.indexOf('const NOTIFICATIONS')),
  )
  const entries = new Map(
    [...sender.matchAll(/^\s+(\w+): \{\s*label: '([^']*)',\s*href: '([^']*)'/gm)].map((m) => [
      m[1],
      { label: m[2], href: m[3] },
    ]),
  )

  it('knows every type the app knows, and no others', () => {
    expect([...entries.keys()].sort()).toEqual([...NOTIFICATION_TYPES].sort())
  })

  it.each(NOTIFICATION_TYPES.map((t) => [t]))('says and links %s the same way', (type) => {
    expect(entries.get(type)).toEqual({
      label: notificationLabel(type),
      href: notificationHref(type),
    })
  })
})
