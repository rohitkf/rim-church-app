import { ageFrom } from './celebrations'

/*
 * What an account's own date of birth has to be (0321).
 *
 * The date picker opens on today, and whatever it was left on was taken:
 * an account could say its owner was born this morning. The Owner,
 * November 2026: "I hope there's validation for people who's age is 0
 * [...] For anyone who's age is 0 or something like that, they have to
 * strictly fill it in next time in order to use the app."
 *
 * So somebody with an account is between 5 and 110. The database holds
 * the rule (`dob_problem()`, the trigger on `profiles`, form 4 of the
 * joining form); these are the same numbers and the same sentences, so
 * the form can say what is wrong before anything is sent. `ownAge.test.ts`
 * reads the migration and fails if the two disagree.
 *
 * It is about an account's own date only. A child written into a family
 * by hand (lib/family.ts) can be a baby, and is.
 */
export const ACCOUNT_MIN_AGE = 5
export const ACCOUNT_MAX_AGE = 110
/** Under this, a person is marked "Under 18" for whoever may see it (`people.minors`). */
export const ADULT_AGE = 18

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The date somebody born `years` ago today was born, as the database counts it. */
function yearsAgo(years: number, today: Date): string {
  const d = new Date(today.getFullYear() - years, today.getMonth(), today.getDate())
  // 29 February in a year without one: the database takes the 28th, and so does this.
  if (d.getMonth() !== today.getMonth()) d.setDate(0)
  return iso(d)
}

/** The latest date an account's date of birth can be: the youngest somebody with an account is. */
export function latestOwnDob(today: Date = new Date()): string {
  return yearsAgo(ACCOUNT_MIN_AGE, today)
}

/** What is wrong with a date as somebody's own date of birth, in the database's words; null when nothing is. */
export function ownDobProblem(dob: string | null | undefined, today: Date = new Date()): string | null {
  if (!dob) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return 'That date doesn’t look right.'
  if (dob > iso(today)) return 'A date of birth cannot be in the future.'
  if (dob > latestOwnDob(today)) return `That date of birth would make you under ${ACCOUNT_MIN_AGE}. Enter your own date of birth.`
  if (dob < yearsAgo(ACCOUNT_MAX_AGE, today)) return `That date of birth is more than ${ACCOUNT_MAX_AGE} years ago. Check the year.`
  return null
}

/**
 * How old somebody is, for a page that shows it: the age when their date
 * can be right, and `wrong` when it cannot (born today, born in 1850) so
 * the page says the date needs correcting rather than "0".
 */
export function ageToShow(dob: string | null | undefined, today: Date = new Date()): { age: number } | { wrong: true } | null {
  if (!dob) return null
  if (ownDobProblem(dob, today)) return { wrong: true }
  const age = ageFrom(dob, today)
  return age === null ? { wrong: true } : { age }
}
