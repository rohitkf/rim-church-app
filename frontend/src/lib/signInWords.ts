/**
 * What the sign-in service says, read for what a person can do about it.
 *
 * Somebody who had not typed their password since the day they joined was
 * told "Invalid login credentials" sixty-seven times in twenty minutes,
 * tried to sign up again twice, and never pressed "Forgot?" (November
 * 2026). The service's words say what is wrong with the request; these say
 * what to do next.
 */

/** The email and password did not match an account. The service does not say which of the two. */
export function isWrongPassword(message: string | null | undefined): boolean {
  return /invalid login credentials/i.test(message ?? '')
}

/**
 * Sign-up answered for an address that already has an account.
 *
 * The service will not say so in an error — it answers as if it had made
 * the account, and sends nothing — but the person it hands back has no
 * identities, which a newly made one always has. Without reading that, the
 * page said "check your email" for an email that was never sent.
 */
export function alreadyHasAccount(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0
}
