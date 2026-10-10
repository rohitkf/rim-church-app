import { describe, expect, it } from 'vitest'
import { describeChange, historyOf, type AvailabilityHistoryEntry } from './availabilityHistory'

const entry = (over: Partial<AvailabilityHistoryEntry> = {}): AvailabilityHistoryEntry => ({
  id: 'h1',
  user_id: 'u2',
  service_id: 's1',
  department_id: 'd1',
  kind: 'answered',
  status: 'available',
  previous_status: null,
  note: null,
  changed_by: 'u2',
  by_request: false,
  after_close: false,
  changed_at: '2026-09-01T10:00:00Z',
  changer: { first_name: 'Joel', last_name: 'Skaria' },
  ...over,
})

describe('a line of somebody’s availability log', () => {
  it('says what they answered, and nothing about who when it was them', () => {
    expect(describeChange(entry())).toMatchObject({ what: 'Answered Yes', was: null, who: null, late: false })
  })

  it('says what it was before a change', () => {
    expect(describeChange(entry({ kind: 'changed', status: 'unavailable', previous_status: 'available' }))).toMatchObject({
      what: 'Changed to No',
      was: 'was Yes',
      status: 'unavailable',
    })
  })

  it('names whoever changed it on their behalf', () => {
    const line = describeChange(
      entry({
        kind: 'changed',
        status: 'tentative',
        previous_status: 'available',
        changed_by: 'admin',
        changer: { first_name: 'Grace', last_name: 'Mensah' },
        after_close: true,
      }),
    )
    expect(line).toMatchObject({ what: 'Changed to Maybe', who: 'by Grace Mensah', late: true })
  })

  it('says a Head’s yes to their own late ask was an approval, not an overrule', () => {
    const line = describeChange(
      entry({
        kind: 'changed',
        status: 'unavailable',
        previous_status: 'available',
        changed_by: 'head',
        changer: { first_name: 'Blessy', last_name: 'Jijin' },
        by_request: true,
        after_close: true,
      }),
    )
    expect(line.who).toBe('approved by Blessy Jijin')
  })

  it('does not pretend to know who did it when the account has gone', () => {
    expect(describeChange(entry({ changed_by: null, changer: null })).who).toBe('by somebody no longer on the app')
  })

  it('says a removal and a note in words', () => {
    expect(describeChange(entry({ kind: 'removed', status: null, previous_status: 'tentative' }))).toMatchObject({
      what: 'Answer removed',
      was: 'was Maybe',
      status: null,
    })
    expect(describeChange(entry({ kind: 'note', note: 'Not until 9.30' }))).toMatchObject({
      what: 'Note changed',
      note: 'Not until 9.30',
    })
    expect(describeChange(entry({ kind: 'note', note: null })).what).toBe('Note removed')
  })

  it('marks the line written when the log began as that, not as a moment anything was said', () => {
    const line = describeChange(entry({ kind: 'before_log', changed_by: null, changer: null, after_close: null }))
    expect(line).toMatchObject({ what: 'Yes when this log began', who: null, beforeLog: true, late: false })
  })
})

describe('one answer’s log', () => {
  it('is that person, team and service only, oldest first', () => {
    const all = [
      entry({ id: 'late', changed_at: '2026-09-05T23:40:00Z' }),
      entry({ id: 'other person', user_id: 'u3' }),
      entry({ id: 'other team', department_id: 'd2' }),
      entry({ id: 'other service', service_id: 's2' }),
      entry({ id: 'early', changed_at: '2026-09-01T10:00:00Z' }),
    ]
    expect(historyOf(all, 'u2', 's1', 'd1').map((e) => e.id)).toEqual(['early', 'late'])
  })
})
