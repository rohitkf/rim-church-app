import { describe, expect, it } from 'vitest'
import migration from '../../../supabase/migrations/0321_a_date_of_birth_has_to_be_somebodys.sql?raw'
import { ACCOUNT_MAX_AGE, ACCOUNT_MIN_AGE, ADULT_AGE, ageToShow, latestOwnDob, ownDobProblem } from './ownAge'

const today = new Date('2026-11-22T12:00:00')

describe('what an account’s own date of birth has to be', () => {
  it('takes no date as no problem: that is a blank, not a wrong answer', () => {
    expect(ownDobProblem('', today)).toBeNull()
    expect(ownDobProblem(null, today)).toBeNull()
  })

  it('refuses today, which is where the picker opens', () => {
    expect(ownDobProblem('2026-11-22', today)).toBe('That date of birth would make you under 5. Enter your own date of birth.')
  })

  it('refuses this year, and anything short of five years', () => {
    expect(ownDobProblem('2026-01-01', today)).toMatch(/under 5/)
    expect(ownDobProblem('2021-11-23', today)).toMatch(/under 5/)
  })

  it('takes somebody five today, and a teenager, and somebody old', () => {
    expect(ownDobProblem('2021-11-22', today)).toBeNull()
    expect(ownDobProblem('2012-03-04', today)).toBeNull()
    expect(ownDobProblem('1916-11-22', today)).toBeNull()
  })

  it('refuses the future in its own words', () => {
    expect(ownDobProblem('2026-11-23', today)).toBe('A date of birth cannot be in the future.')
  })

  it('refuses more than 110 years ago', () => {
    expect(ownDobProblem('1916-11-21', today)).toBe('That date of birth is more than 110 years ago. Check the year.')
    expect(ownDobProblem('1850-06-01', today)).toMatch(/110 years ago/)
  })

  it('refuses something that is not a date', () => {
    expect(ownDobProblem('yesterday', today)).toBe('That date doesn’t look right.')
  })

  it('says the latest date a picker should offer', () => {
    expect(latestOwnDob(today)).toBe('2021-11-22')
    // On 29 February the database takes the 28th of a year without one.
    expect(latestOwnDob(new Date('2028-02-29T12:00:00'))).toBe('2023-02-28')
  })
})

describe('an age, for a page that shows one', () => {
  it('is the age when the date can be right', () => {
    expect(ageToShow('1990-06-01', today)).toEqual({ age: 36 })
    expect(ageToShow('2011-11-23', today)).toEqual({ age: 14 })
  })

  it('is “wrong” rather than 0 for a date that cannot be right', () => {
    expect(ageToShow('2026-11-22', today)).toEqual({ wrong: true })
    expect(ageToShow('1850-01-01', today)).toEqual({ wrong: true })
  })

  it('is nothing when there is no date', () => {
    expect(ageToShow(null, today)).toBeNull()
  })
})

describe('the same numbers and sentences as the database (0321)', () => {
  it('holds the youngest and the oldest an account can be', () => {
    expect(migration).toMatch(new RegExp(`function public\\.account_min_age\\(\\)[\\s\\S]*?select ${ACCOUNT_MIN_AGE};`))
    expect(migration).toMatch(new RegExp(`function public\\.account_max_age\\(\\)[\\s\\S]*?select ${ACCOUNT_MAX_AGE};`))
  })

  it('says each thing in the words the database says it', () => {
    expect(migration).toContain("'A date of birth cannot be in the future.'")
    expect(migration).toContain("'That date of birth would make you under %s. Enter your own date of birth.'")
    expect(migration).toContain("'That date of birth is more than %s years ago. Check the year.'")
  })

  it('draws the line for “Under 18” where the database does', () => {
    expect(migration).toContain(`interval '${ADULT_AGE} years'`)
  })

  it('asks for the date again on form 4 only, so the app before it is told nothing it cannot show', () => {
    expect(migration).toContain("when p_form >= 4 and public.dob_problem(p.dob) is not null then 'dob' end")
    expect(migration).toMatch(/function public\.joining_form\(\)[\s\S]*?select 4;/)
  })

  it('refuses a wrong date when it is written, and leaves one already there alone', () => {
    expect(migration).toContain('before insert or update of dob on public.profiles')
    expect(migration).toContain("if tg_op = 'UPDATE' and new.dob is not distinct from old.dob then")
  })

  it('hands whoever may see it ids and nothing else', () => {
    expect(migration).toContain("public.may(auth.uid(), 'people.minors') as sees")
    expect(migration).toMatch(/function public\.people_under_18\(p_ids uuid\[\] default null\)\s+returns table \(id uuid\)/)
  })
})
