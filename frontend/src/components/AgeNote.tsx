import { ageFrom } from '../lib/celebrations'

/** "You're 31", under a date of birth — so a wrong year is seen before it is saved. */
export function AgeNote({ dob }: { dob: string }) {
  if (!dob) return null
  const age = ageFrom(dob)
  return (
    <span role="status" className={`text-label-sm ${age === null ? 'text-error' : 'text-on-surface-faint'}`}>
      {age === null ? 'That date doesn’t look right.' : age === 0 ? 'You’re under one year old.' : `You’re ${age} years old.`}
    </span>
  )
}
