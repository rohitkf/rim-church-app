import { describe, expect, it } from 'vitest'
import {
  isSettledStatus,
  isComplete,
  maritalLabel,
  missingAnswers,
  toProfileRows,
  visaLabel,
  type JoiningAnswers,
} from './joining'

const answers = (over: Partial<JoiningAnswers> = {}): JoiningAnswers => ({
  firstName: 'Grace',
  lastName: 'Mensah',
  phone: '07700900123',
  dob: '1990-04-02',
  maritalStatus: 'single',
  anniversary: '',
  visaType: 'british_citizen',
  visaHasExpiry: null,
  visaExpiry: '',
  hasDbs: false,
  ...over,
})

describe('what the church has to be told', () => {
  it('is happy with a complete set', () => {
    expect(missingAnswers(answers())).toEqual([])
    expect(isComplete(answers())).toBe(true)
  })

  it('names every blank rather than saying "something is missing"', () => {
    const missing = missingAnswers(
      answers({ firstName: '  ', phone: '', dob: '', maritalStatus: '', hasDbs: null }),
    )
    expect(missing).toEqual(['firstName', 'phone', 'dob', 'maritalStatus', 'hasDbs'])
  })

  /*
   * The two questions that are only questions sometimes. Asking a single
   * person for an anniversary, or a British citizen for a visa expiry, is
   * an app that has not listened to the answer before it.
   */
  it('asks a married person for their anniversary, and nobody else', () => {
    expect(missingAnswers(answers({ maritalStatus: 'married' }))).toEqual(['anniversary'])
    expect(missingAnswers(answers({ maritalStatus: 'widowed' }))).toEqual([])
  })

  it('never asks a citizen or somebody settled here about an expiry', () => {
    for (const visaType of ['british_citizen', 'irish_citizen', 'ilr', 'eu_settled']) {
      expect(isSettledStatus(visaType)).toBe(true)
      expect(missingAnswers(answers({ visaType }))).toEqual([])
    }
  })

  it('asks everyone else whether theirs runs out, and then when', () => {
    expect(missingAnswers(answers({ visaType: 'student' }))).toEqual(['visaHasExpiry'])
    expect(missingAnswers(answers({ visaType: 'student', visaHasExpiry: true }))).toEqual([
      'visaExpiry',
    ])
    // "No expiry" is a complete answer, not a missing one.
    expect(missingAnswers(answers({ visaType: 'student', visaHasExpiry: false }))).toEqual([])
  })

  it('takes a no about DBS as an answer, and no answer as missing', () => {
    expect(missingAnswers(answers({ hasDbs: false }))).toEqual([])
    expect(missingAnswers(answers({ hasDbs: null }))).toEqual(['hasDbs'])
  })
})

describe('what gets written to the two tables', () => {
  it('keeps an anniversary only while somebody is married', () => {
    const married = toProfileRows(answers({ maritalStatus: 'married', anniversary: '2015-07-11' }))
    expect(married.profile).toMatchObject({
      marital_status: 'married',
      anniversary: '2015-07-11',
    })

    // Widowed or divorced, the date goes rather than lingering on the
    // Celebrations page.
    const after = toProfileRows(answers({ maritalStatus: 'widowed', anniversary: '2015-07-11' }))
    expect(after.profile.anniversary).toBeNull()
  })

  it('cannot leave a stale expiry on a status that does not run out', () => {
    const settled = toProfileRows(
      answers({ visaType: 'ilr', visaHasExpiry: true, visaExpiry: '2027-08-19' }),
    )
    expect(settled.sensitive).toMatchObject({
      visa_type: 'ilr',
      visa_has_expiry: false,
      visa_expiry: null,
    })
  })

  it('keeps the date when it is a date somebody gave', () => {
    const visa = toProfileRows(
      answers({ visaType: 'dependant', visaHasExpiry: true, visaExpiry: '2027-08-19' }),
    )
    expect(visa.sensitive).toMatchObject({
      visa_type: 'dependant',
      visa_has_expiry: true,
      visa_expiry: '2027-08-19',
    })
  })

  // "No expiry" and "nobody has asked" are different facts, and an Admin
  // looking for people whose right to work needs checking has to tell them
  // apart.
  it('records a no about expiry as a no, not as a blank', () => {
    const none = toProfileRows(answers({ visaType: 'refugee', visaHasExpiry: false }))
    expect(none.sensitive).toMatchObject({ visa_has_expiry: false, visa_expiry: null })
  })

  it('writes DBS as the yes or no it was given as', () => {
    expect(toProfileRows(answers({ hasDbs: true })).sensitive).toMatchObject({ has_dbs: true })
    expect(toProfileRows(answers({ hasDbs: false })).sensitive).toMatchObject({ has_dbs: false })
  })
})

describe('how the stored values read', () => {
  it('turns a stored value back into the words somebody chose', () => {
    expect(visaLabel('skilled_worker')).toBe('Skilled Worker visa')
    expect(maritalLabel('married')).toBe('Married')
  })

  // A value from before this list existed is shown as it is rather than
  // hidden, because a profile that silently drops a field is worse than
  // one that shows an old word.
  it('shows an unknown value rather than nothing', () => {
    expect(visaLabel('Tier 2 (General)')).toBe('Tier 2 (General)')
    expect(visaLabel(null)).toBeNull()
  })
})
