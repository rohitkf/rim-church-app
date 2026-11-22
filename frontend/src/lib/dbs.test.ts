import { describe, expect, it, vi } from 'vitest'
import migration from '../../../supabase/migrations/0324_a_dbs_is_details_and_somebody_checks_it.sql?raw'

vi.mock('./supabaseClient', () => ({ supabase: {} }))

import {
  DBS_CONSENT_WORDING,
  DBS_EARLIEST,
  DBS_KINDS,
  DBS_TEXT,
  DBS_WORKFORCES,
  EMPTY_DBS,
  dbsAge,
  dbsAnswersOf,
  dbsAsked,
  dbsChecksText,
  dbsComplete,
  dbsDate,
  dbsInvalid,
  dbsMissing,
  dbsStanding,
  tidyCertificate,
  tidyShareCode,
  type DbsAnswers,
} from './dbs'

const TODAY = '2026-11-22'

const enhanced = (over: Partial<DbsAnswers> = {}): DbsAnswers => ({
  kind: 'enhanced',
  certificate: '001234567890',
  surname: 'Mensah',
  issued: '2023-03-14',
  workforce: 'child',
  updateService: true,
  shareCode: '',
  consent: true,
  ...over,
})

const basic = (over: Partial<DbsAnswers> = {}): DbsAnswers => ({
  ...EMPTY_DBS,
  kind: 'basic',
  surname: 'Bello',
  issued: '2024-06-01',
  shareCode: 'AB12CD34',
  consent: true,
  ...over,
})

describe('what a DBS yes has to come with', () => {
  it('asks only which check it is until one is chosen', () => {
    expect(dbsMissing(EMPTY_DBS)).toEqual(['kind'])
    expect(dbsAsked(EMPTY_DBS)).toEqual(['kind'])
    expect(dbsInvalid({ ...EMPTY_DBS, certificate: '12' }, TODAY)).toEqual({})
  })

  it('asks a Standard or Enhanced check for its number, surname, date, workforce, the Update Service and permission', () => {
    for (const kind of ['enhanced', 'standard'] as const) {
      expect(dbsMissing({ ...EMPTY_DBS, kind })).toEqual(['certificate', 'surname', 'issued', 'workforce', 'updateService', 'consent'])
      expect(dbsAsked({ ...EMPTY_DBS, kind })).not.toContain('shareCode')
    }
    expect(dbsMissing(enhanced())).toEqual([])
    expect(dbsComplete(enhanced(), TODAY)).toBe(true)
  })

  it('counts an answer of no about the Update Service as an answer', () => {
    expect(dbsMissing(enhanced({ updateService: false }))).toEqual([])
    expect(dbsMissing(enhanced({ updateService: null }))).toEqual(['updateService'])
  })

  it('asks a Basic check for a share code or a certificate number, and nothing about a workforce', () => {
    expect(dbsMissing({ ...EMPTY_DBS, kind: 'basic' })).toEqual(['shareCode', 'surname', 'issued', 'consent'])
    expect(dbsMissing(basic())).toEqual([])
    // A paper certificate that came through an employer has a number and no code.
    expect(dbsMissing(basic({ shareCode: '', certificate: '001234567890' }))).toEqual([])
    expect(dbsMissing(basic({ shareCode: '  ', certificate: '' }))).toEqual(['shareCode'])
    expect(dbsAsked(basic())).toEqual(['kind', 'certificate', 'shareCode', 'surname', 'issued', 'consent'])
  })

  it('does not take the details without permission', () => {
    expect(dbsMissing(enhanced({ consent: false }))).toEqual(['consent'])
    expect(dbsComplete(enhanced({ consent: false }), TODAY)).toBe(false)
  })
})

describe('a DBS answer that cannot be right', () => {
  it('holds a certificate number to exactly 12 digits, and says how many were typed', () => {
    expect(dbsInvalid(enhanced({ certificate: '00123456789' }), TODAY).certificate).toBe('A DBS certificate number is 12 digits. That is 11.')
    expect(dbsInvalid(enhanced({ certificate: '0012345678901' }), TODAY).certificate).toBe('A DBS certificate number is 12 digits. That is 13.')
    expect(dbsInvalid(enhanced({ certificate: '00123456789A' }), TODAY).certificate).toBe('A DBS certificate number is 12 digits.')
    expect(dbsInvalid(enhanced(), TODAY)).toEqual({})
  })

  it('reads a number typed with spaces or dashes as the number', () => {
    expect(tidyCertificate(' 0012 3456-7890 ')).toBe('001234567890')
    expect(dbsInvalid(enhanced({ certificate: '0012 3456 7890' }), TODAY)).toEqual({})
    expect(tidyShareCode('ab12 cd-34')).toBe('AB12CD34')
  })

  it('holds a Basic check’s number to the same rule when one is given', () => {
    expect(dbsInvalid(basic({ certificate: '123' }), TODAY).certificate).toBe('A DBS certificate number is 12 digits. That is 3.')
  })

  it('refuses a share code that is not letters and digits', () => {
    expect(dbsInvalid(basic({ shareCode: 'ab$c12' }), TODAY).shareCode).toMatch(/does not look right/)
    expect(dbsInvalid(basic({ shareCode: 'abc' }), TODAY).shareCode).toMatch(/does not look right/)
    expect(dbsInvalid(basic({ shareCode: 'ab12 cd34' }), TODAY)).toEqual({})
    // Not looked at on a check that has no share code.
    expect(dbsInvalid(enhanced({ shareCode: '$$' }), TODAY)).toEqual({})
  })

  it('refuses a date of issue that is to come, or from before there were certificates', () => {
    expect(dbsInvalid(enhanced({ issued: '2026-11-23' }), TODAY).issued).toBe('The date of issue cannot be in the future.')
    expect(dbsInvalid(enhanced({ issued: TODAY }), TODAY)).toEqual({})
    expect(dbsInvalid(enhanced({ issued: '2002-02-28' }), TODAY).issued).toBe('No certificate is that old. Check the year.')
    expect(dbsInvalid(enhanced({ issued: DBS_EARLIEST }), TODAY)).toEqual({})
  })
})

describe('how old a certificate is', () => {
  it('says it in whole years and months', () => {
    expect(dbsAge('2023-03-14', TODAY)).toBe('3 years 8 months old')
    expect(dbsAge('2025-11-22', TODAY)).toBe('1 year old')
    expect(dbsAge('2025-11-23', TODAY)).toBe('11 months old')
    expect(dbsAge('2026-10-22', TODAY)).toBe('1 month old')
    expect(dbsAge('2025-10-01', TODAY)).toBe('1 year 1 month old')
  })

  it('says a certificate from this month is new, and says nothing of no date or a date to come', () => {
    expect(dbsAge('2026-11-01', TODAY)).toBe('Less than a month old')
    expect(dbsAge(TODAY, TODAY)).toBe('Less than a month old')
    expect(dbsAge('', TODAY)).toBeNull()
    expect(dbsAge(null, TODAY)).toBeNull()
    expect(dbsAge('2027-01-01', TODAY)).toBeNull()
    expect(dbsAge('14/03/2023', TODAY)).toBeNull()
  })

  it('writes a date as a person reads one, without moving it a day', () => {
    expect(dbsDate('2023-03-14')).toBe('14 March 2023')
    expect(dbsDate('1990-05-04')).toBe('4 May 1990')
    expect(dbsDate('2026-11-21T23:30:00+00:00')).toBe('21 November 2026')
    expect(dbsDate(null)).toBe('')
  })
})

describe('where somebody stands', () => {
  it('is no DBS, details to give, waiting to be checked, or verified', () => {
    expect(dbsStanding(false, undefined)).toBe('none')
    // A row left behind a no is not a DBS.
    expect(dbsStanding(false, { verified_at: '2026-11-21T09:00:00Z' })).toBe('none')
    expect(dbsStanding(true, undefined)).toBe('details')
    expect(dbsStanding(true, { verified_at: null })).toBe('check')
    expect(dbsStanding(true, { verified_at: '2026-11-21T09:00:00Z' })).toBe('verified')
  })

  it('says what was looked at in the words the log keeps', () => {
    expect(dbsChecksText({ status_checked: true, certificate_seen: true, id_seen: true })).toBe('checked online, original certificate seen, photo ID seen')
    expect(dbsChecksText({ status_checked: false, certificate_seen: true, id_seen: false })).toBe('original certificate seen')
    expect(migration).toContain("then 'checked online' end")
    expect(migration).toContain("then 'original certificate seen' end")
    expect(migration).toContain("then 'photo ID seen' end")
  })

  it('offers the surname above for a certificate not yet given, with permission still to give', () => {
    expect(dbsAnswersOf(null, 'Mensah')).toEqual({ ...EMPTY_DBS, surname: 'Mensah' })
  })
})

/*
 * The form's rules are a copy of save_my_dbs()'s. A copy drifts, so the
 * things that have to be the same in both are read out of the migration.
 */
describe('the form and the database ask for the same thing', () => {
  it('shows the person the words the database keeps as what they agreed to', () => {
    const kept = migration.match(/function public\.dbs_consent_wording\(\)[\s\S]*?select '([^']+)';/)?.[1]
    expect(kept).toBe(DBS_CONSENT_WORDING)
  })

  it('refuses in the same words', () => {
    const said = [...migration.matchAll(/raise exception '([^']+)'/g)].map((m) => m[1])
    for (const field of ['kind', 'certificate', 'surname', 'issued', 'workforce', 'updateService', 'shareCode', 'consent'] as const) {
      expect(said, field).toContain(DBS_TEXT[field].message)
    }
    expect(said).toContain('A DBS certificate number is 12 digits.')
    expect(said).toContain('The date of issue cannot be in the future.')
    expect(said).toContain('No certificate is that old. Check the year.')
    expect(said).toContain('That share code does not look right. Copy it exactly as GOV.UK gave it.')
    expect(said).toContain('Keep the surname to 80 letters or fewer.')
  })

  it('offers the kinds and workforces the table allows, and no others', () => {
    const kinds = migration.match(/check \(kind in \(([^)]+)\)\)/)?.[1].replace(/['\s]/g, '').split(',')
    expect(kinds).toEqual(DBS_KINDS.map((k) => k.value))
    const workforces = migration.match(/check \(workforce in \(([^)]+)\)\)/)?.[1].replace(/['\s]/g, '').split(',')
    expect(workforces).toEqual(DBS_WORKFORCES.map((w) => w.value))
  })

  it('holds the number and the share code to the table’s own patterns, and the date to its earliest', () => {
    expect(migration).toContain("certificate_number ~ '^[0-9]{12}$'")
    expect(migration).toContain("share_code ~ '^[A-Z0-9]{4,20}$'")
    expect(migration).toContain(`date '${DBS_EARLIEST}'`)
  })

  it('leaves nobody a way to write a row but through the functions', () => {
    expect(migration).toMatch(/revoke all on public\.dbs_details from authenticated;\s*grant select on public\.dbs_details to authenticated;/)
    expect(migration).toMatch(/revoke all on public\.dbs_log from authenticated;\s*grant select on public\.dbs_log to authenticated;/)
    expect(migration).not.toMatch(/create policy \w+ on public\.dbs_(details|log)\s+for (insert|update|delete|all)/)
  })
})
