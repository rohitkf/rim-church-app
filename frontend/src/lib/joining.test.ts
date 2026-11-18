import { describe, expect, it } from 'vitest'
import {
  EMERGENCY_RELATIONS,
  EMERGENCY_RELATIONS_BEFORE,
  JOINING_FORM,
  emergencyProblems,
  emergencyRelationLabel,
  emergencyRelationOf,
  emergencyRelationOptions,
  invalidAnswers,
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
  visaNote: '',
  addressLine1: '1 High Street',
  addressLine2: '',
  town: 'Leeds',
  postcode: 'LS1 1AA',
  emergencyName: 'Ama Mensah',
  emergencyRelation: 'sister',
  emergencyPhone: '+447812345678',
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

describe('the visa note', () => {
  it('is saved trimmed, and as null when empty', () => {
    expect(toProfileRows(answers({ visaNote: '  Applied 3 Oct  ' })).sensitive.visa_note).toBe('Applied 3 Oct')
    expect(toProfileRows(answers({ visaNote: '   ' })).sensitive.visa_note).toBeNull()
  })
})

describe('what is filled in and wrong', () => {
  const today = new Date(2026, 9, 16)
  it('accepts a normal set of answers', () => {
    expect(invalidAnswers(answers(), today)).toEqual({})
  })
  it('wants names that are names', () => {
    expect(invalidAnswers(answers({ firstName: 'R2D2!' }), today).firstName).toMatch(/letters/)
    expect(invalidAnswers(answers({ lastName: 'x'.repeat(51) }), today).lastName).toMatch(/50/)
    expect(invalidAnswers(answers({ firstName: "Mary-Jane O’Neil", lastName: 'Åsa' }), today)).toEqual({})
  })
  it('refuses a birth date in the future or from before 1900', () => {
    expect(invalidAnswers(answers({ dob: '2027-01-01' }), today).dob).toMatch(/future/)
    expect(invalidAnswers(answers({ dob: '1850-01-01' }), today).dob).toMatch(/right/)
  })
  it('keeps an anniversary after the person was old enough to marry', () => {
    const married = { maritalStatus: 'married' as const, dob: '1990-04-02' }
    expect(invalidAnswers(answers({ ...married, anniversary: '2027-01-01' }), today).anniversary).toMatch(/future/)
    expect(invalidAnswers(answers({ ...married, anniversary: '1995-01-01' }), today).anniversary).toMatch(/soon/)
    expect(invalidAnswers(answers({ ...married, anniversary: '2015-06-01' }), today)).toEqual({})
  })
  it('allows an expiry that has passed, not an absurd one', () => {
    const base = { visaType: 'student', visaHasExpiry: true }
    expect(invalidAnswers(answers({ ...base, visaExpiry: '2026-01-01' }), today)).toEqual({})
    expect(invalidAnswers(answers({ ...base, visaExpiry: '1990-01-01' }), today).visaExpiry).toBeDefined()
    expect(invalidAnswers(answers({ ...base, visaExpiry: '2099-01-01' }), today).visaExpiry).toBeDefined()
  })
})

/*
 * Where they live and who to ring (0301): asked of everybody, and the door
 * goes by them.
 */
describe('an address and somebody to ring', () => {
  it('are asked of everybody: line 1, the town, the postcode, a name and a number', () => {
    expect(
      missingAnswers(
        answers({ addressLine1: ' ', town: '', postcode: '', emergencyName: '', emergencyRelation: '', emergencyPhone: '' }),
      ),
    ).toEqual(['addressLine1', 'town', 'postcode', 'emergencyName', 'emergencyRelation', 'emergencyPhone'])
  })

  it('never ask for a second line of the address', () => {
    expect(missingAnswers(answers({ addressLine2: '' }))).toEqual([])
  })

  it('refuse somebody’s own number as the one to ring, however it is written', () => {
    expect(invalidAnswers(answers({ phone: '+447911123456', emergencyPhone: '+447911123456' })).emergencyPhone).toMatch(/your own number/)
    expect(emergencyProblems('Ama', '+44 7911 123456', '+447911123456').phone).toMatch(/your own number/)
    expect(invalidAnswers(answers()).emergencyPhone).toBeUndefined()
    // Nothing typed is "still to answer", not "wrong".
    expect(emergencyProblems('', '', '').phone).toBeUndefined()
  })

  it('keep the name to what the column holds', () => {
    expect(emergencyProblems('x'.repeat(101), '+447812345678', null).name).toMatch(/100/)
    expect(emergencyProblems('x'.repeat(100), '+447812345678', null).name).toBeUndefined()
  })

  it('go to the two places that keep them: the profile, and the household’s address', () => {
    const rows = toProfileRows(answers({ addressLine2: ' Flat 3 ', postcode: ' ls1 1aa ' }))
    expect(rows.profile).toMatchObject({
      emergency_contact_name: 'Ama Mensah',
      emergency_contact_relation: 'sister',
      emergency_contact_phone: '+447812345678',
    })
    expect(rows.address).toEqual({ line1: '1 High Street', line2: 'Flat 3', town: 'Leeds', postcode: 'LS1 1AA' })
  })

  it('make this the third form: who the person to ring is came after the rest (0302)', () => {
    expect(JOINING_FORM).toBe(3)
  })
})

/*
 * Who the person to ring is to them (0302): one of a short list, the same
 * list the database's check holds.
 */
describe('who the person to ring is', () => {
  const migrations = import.meta.glob('../../../supabase/migrations/*.sql', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  // The newest migration that sets the check is the one in force.
  const sql = Object.entries(migrations)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => text)
    .filter((text) => text.includes('profiles_emergency_contact_relation_known'))
    .pop()!

  it('is asked of everybody, by itself', () => {
    expect(missingAnswers(answers({ emergencyRelation: '' }))).toEqual(['emergencyRelation'])
  })

  it('is one of the values the database will keep: the ones offered, then the four from before', () => {
    const list = sql.match(/emergency_contact_relation in \(([^)]*)\)/)![1]
    const kept = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    expect(kept).toEqual([...EMERGENCY_RELATIONS, ...EMERGENCY_RELATIONS_BEFORE].map((r) => r.value))
  })

  /*
   * One word for one person (0305). "Husband or wife", "Brother or sister",
   * "Son or daughter" and "Parent" each stood for two, which confused
   * whoever was choosing and told whoever was ringing less than they wanted.
   */
  it('offers one word for one person: nobody shares an answer', () => {
    const labels = EMERGENCY_RELATIONS.map((r) => r.label)
    expect(labels).toEqual(['Husband', 'Wife', 'Partner', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Other relative', 'Friend', 'Other'])
    expect(labels.filter((word) => / or /.test(word))).toEqual([])
    expect(new Set(EMERGENCY_RELATIONS.map((r) => r.value)).size).toBe(EMERGENCY_RELATIONS.length)
  })

  it('keeps the four answers from before as answers: known, read as they were chosen, and not offered', () => {
    for (const before of EMERGENCY_RELATIONS_BEFORE) {
      expect(emergencyRelationOf(before.value)).toBe(before.value)
      expect(emergencyRelationLabel(before.value)).toBe(before.label)
      expect(emergencyRelationOptions(null).map((o) => o.value)).not.toContain(before.value)
    }
    // Somebody who answered with one is not missing an answer.
    expect(missingAnswers(answers({ emergencyRelation: 'spouse' }))).toEqual([])
  })

  it('offers somebody their own earlier answer, last, so it shows as chosen — and nobody else’s', () => {
    expect(emergencyRelationOptions('spouse').at(-1)).toEqual({ value: 'spouse', label: 'Husband or wife' })
    expect(emergencyRelationOptions('spouse')).toHaveLength(EMERGENCY_RELATIONS.length + 1)
    expect(emergencyRelationOptions('wife')).toHaveLength(EMERGENCY_RELATIONS.length)
    expect(emergencyRelationOptions('')).toHaveLength(EMERGENCY_RELATIONS.length)
  })

  it('reads as a word on a page, and a value nobody knows as itself', () => {
    expect(emergencyRelationLabel('mother')).toBe('Mother')
    expect(emergencyRelationLabel('godparent')).toBe('godparent')
    expect(emergencyRelationLabel(null)).toBeNull()
  })

  it('treats a stored value this app has never heard of as not answered, so it is asked', () => {
    expect(emergencyRelationOf('godparent')).toBe('')
    expect(emergencyRelationOf('friend')).toBe('friend')
    expect(emergencyRelationOf(null)).toBe('')
  })

  it('lets nobody be forced into a wrong answer', () => {
    expect(EMERGENCY_RELATIONS.at(-1)).toEqual({ value: 'other', label: 'Other' })
  })
})
