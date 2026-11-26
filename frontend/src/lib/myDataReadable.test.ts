import { describe, expect, it } from 'vitest'
import { NO_LOOKUPS, countReadable, plainName, readableData, readableHtml, readableValue, type Lookups } from './myDataReadable'

/*
 * The copy of your own data as something a person can read. The first
 * download was the database's rows as they are stored, and the Owner sent
 * theirs back: all there, none of it readable.
 */
const TEAM = '11111111-1111-4111-8111-111111111111'
const SERVICE = '22222222-2222-4222-8222-222222222222'
const GONE = '33333333-3333-4333-8333-333333333333'
const ME = '44444444-4444-4444-8444-444444444444'
const ADA = '55555555-5555-4555-8555-555555555555'
const look: Lookups = {
  ...NO_LOOKUPS,
  me: ME,
  team: new Map([[TEAM, 'Media']]),
  service: new Map([[SERVICE, 'English Service, Sun 30 Nov']]),
  person: new Map([[ADA, 'Ada Grace']]),
}

const answer = {
  made_at: '2026-11-26T18:02:00Z',
  account: { email: 'grace@example.com', created_at: '2026-01-05T09:00:00Z', last_sign_in_at: null },
  tables: {
    notifications: [{ id: 'n1', user_id: ME, body: 'Your call time is 08:15', type: 'call_time', read_boolean: true, created_at: '2026-11-20T10:00:00Z', reference_id: SERVICE }],
    profiles: [{ id: ME, first_name: 'Grace', last_name: 'Mensah', dob: '1990-03-14', phone: '', avatar_url: null, single_name: false, marital_status: 'married', created_at: '2026-01-05T09:00:00Z' }],
    availability: [
      { id: 'a1', user_id: ME, department_id: TEAM, service_id: SERVICE, status: 'available', attended: null, updated_at: '2026-11-01T10:00:00Z' },
      { id: 'a2', user_id: ME, department_id: TEAM, service_id: GONE, status: 'not_available', attended: false, updated_at: '2026-11-08T10:00:00Z' },
    ],
    clock_in_history: [{ id: 'h1', user_id: ME, kind: 'clocked_in', changed_by: ME, changed_at: '2026-11-22T08:05:00Z' }, { id: 'h2', user_id: ME, kind: 'corrected', changed_by: ADA, changed_at: '2026-11-23T08:05:00Z' }],
    onboarding: [{ user_id: ME, seen: { welcome: '2026-01-05T09:00:00Z', around: '2026-01-05T09:02:00Z' }, releases_seen: {} }],
    'family_link_requests (asked_by)': [{ id: 'f1', asked_by: ME, note: 'My husband' }],
    a_table_added_later: [{ id: 'x1', user_id: ME, shoe_size: 9, favourite_colour: 'dark_blue', empty_thing: null }],
  },
}
const doc = readableData(answer, look)
const section = (title: string) => doc.sections.find((s) => s.title === title)!
const lines = (title: string, entry = 0) => Object.fromEntries(section(title).entries[entry].lines)

describe('the document', () => {
  it('has a heading in plain words for each kind of thing, in the order a person would ask', () => {
    expect(doc.sections.map((s) => s.title)).toEqual([
      'Your profile',
      'Family links you asked for (asked by)',
      'Whether you could serve',
      'Changes to your clock-ins',
      'Notifications sent to you',
      'The tour and what is new',
      // Not known to this file: still in the document, under its own name.
      'A table added later',
    ])
    expect(countReadable(doc)).toEqual({ sections: 7, entries: 9 })
  })

  it('says a name where the database keeps an id, and "You" for the reader', () => {
    expect(lines('Whether you could serve', 1)).toMatchObject({ Team: 'Media', Service: 'English Service, Sun 30 Nov' })
    expect(lines('Changes to your clock-ins', 0)['Changed by']).toBe('Ada Grace')
    expect(lines('Changes to your clock-ins', 1)['Changed by']).toBe('You')
    // A service already deleted is said to be, not shown as a number.
    expect(lines('Whether you could serve', 0).Service).toBe('A service that is no longer kept')
  })

  it('writes dates as dates, yes and no as words, and the database’s codes as words', () => {
    const profile = lines('Your profile')
    expect(profile['Date of birth']).toBe('14 March 1990')
    expect(profile['Has one name only']).toBe('No')
    expect(profile['Married or single']).toBe('Married')
    expect(lines('Whether you could serve', 0)).toMatchObject({ Answer: 'Not available', 'Turned up': 'No' })
    expect(lines('Notifications sent to you')).toMatchObject({ About: 'Call time', Read: 'Yes' })
    expect(lines('Notifications sent to you').Added).toMatch(/^20 November 2026, \d\d:\d\d$/)
    expect(doc.made).toMatch(/^26 November 2026/)
  })

  it('leaves out a blank, the row’s own number and the reader repeated on every row', () => {
    const profile = lines('Your profile')
    expect(Object.keys(profile)).toEqual(['First name', 'Last name', 'Has one name only', 'Date of birth', 'Married or single', 'Added'])
    for (const s of doc.sections) for (const e of s.entries) for (const [label, value] of e.lines) {
      expect(label).not.toMatch(/^(Id|User)$/)
      expect(value, `${s.title} / ${label}`).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
    }
  })

  it('puts the newest first, and reads each entry name before date before who', () => {
    expect(section('Whether you could serve').entries.map((e) => Object.fromEntries(e.lines)['Last changed'].slice(0, 2))).toEqual(['8 ', '1 '])
    expect(section('Changes to your clock-ins').entries[0].lines.map((l) => l[0])).toEqual(['Kind', 'When', 'Changed by'])
  })

  it('says which parts of the tour were seen, not when to the second', () => {
    expect(lines('The tour and what is new')).toEqual({ 'Parts of the tour seen': 'Welcome, Around' })
  })

  it('still shows a table and columns it has never heard of, by their own names', () => {
    expect(lines('A table added later')).toEqual({ 'Shoe size': '9', 'Favourite colour': 'Dark blue' })
    expect(plainName('service_session_assignees')).toBe('Service session assignees')
    expect(plainName('verified_at')).toBe('Verified')
  })

  it('gives the account its own lines, less what is blank', () => {
    expect(doc.account.map((l) => l[0])).toEqual(['Signs in as', 'Account made'])
    expect(doc.account[0][1]).toBe('grace@example.com')
  })

  it('makes a document of nothing from an answer it cannot read', () => {
    expect(readableData(null).sections).toEqual([])
    expect(readableData({ tables: 'nonsense' }).sections).toEqual([])
    expect(readableData({ tables: { profiles: [{ id: 'x', user_id: 'y' }] } }).sections).toEqual([])
  })
})

describe('one value', () => {
  it('keeps a certificate number as it is written, though it looks like a code', () => {
    expect(readableValue('certificate_number', 'abc123', NO_LOOKUPS)).toBe('abc123')
    expect(readableValue('status', 'not_available', NO_LOOKUPS)).toBe('Not available')
    // Ordinary writing is left alone.
    expect(readableValue('note', 'Running late, sorry', NO_LOOKUPS)).toBe('Running late, sorry')
  })

  it('names nobody it cannot name', () => {
    expect(readableValue('changed_by', ADA, NO_LOOKUPS)).toBeNull()
    expect(readableValue('department_id', TEAM, NO_LOOKUPS)).toBeNull()
  })
})

describe('the file', () => {
  it('is one page that needs nothing else: no script, nothing fetched', () => {
    const html = readableHtml(doc, 'Grace Mensah')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>What Rehoboth International Ministries’s app holds about Grace Mensah</title>')
    expect(html).not.toMatch(/<script|<img|<link|src=|href=|url\(/i)
    // How many, where there are several; one thing is not counted.
    expect(html).toContain('<h2>Your profile</h2>')
    expect(html).toContain('<h2>Whether you could serve <span class="count">2</span></h2>')
    expect(html).toContain('<dt>Date of birth</dt><dd>14 March 1990</dd>')
    expect(html).toContain('Save as PDF')
  })

  it('treats everything in it as words, whatever somebody typed', () => {
    const nasty = readableData({ tables: { messages: [{ id: 'm1', body: '<script>alert(1)</script> & "quotes"', created_at: '2026-11-20T10:00:00Z' }] } })
    const html = readableHtml(nasty, '<b>Somebody</b>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;')
    expect(html).toContain('about &lt;b&gt;Somebody&lt;/b&gt;')
  })
})
