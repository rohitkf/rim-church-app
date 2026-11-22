import { ageFrom } from '../lib/celebrations'
import { ownDobProblem } from '../lib/ownAge'

/**
 * "You're 31", under somebody's own date of birth — so a wrong year is
 * seen before it is saved. A date that cannot be theirs (today, this
 * year, 1850) says what is wrong in red instead (lib/ownAge, 0321).
 */
export function AgeNote({ dob }: { dob: string }) {
  if (!dob) return null
  const problem = ownDobProblem(dob)
  const age = ageFrom(dob)
  const wrong = problem ?? (age === null ? 'That date doesn’t look right.' : null)
  return (
    <span role="status" className={`text-label-sm ${wrong ? 'text-error' : 'text-on-surface-faint'}`}>
      {wrong ?? `You’re ${age} years old.`}
    </span>
  )
}
