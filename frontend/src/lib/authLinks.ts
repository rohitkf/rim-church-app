/**
 * Where the link in an account's email lands, and what to say when the
 * link was no good.
 *
 * Signing up sent a confirmation email without saying where its link
 * should land, so it landed wherever the project's "Site URL" said — and
 * that had been saved as `https://…/**`, an allow-list pattern typed into
 * the wrong box. The link confirmed the account and then opened a page
 * that does not exist: somebody who had just done the right thing was
 * told "Page not found" (found November 2026, while sending three
 * confirmation emails again for the Owner).
 *
 * The app now names the page itself, every time it asks for such an
 * email, so no setting outside the code decides it. The sign-in page is
 * the right one for both outcomes: pressed in time, the link signs them
 * in and the page sends them straight on; pressed too late, they are at
 * the form that gets them a new one, and it says why.
 */

/** The page a confirmation link lands on: the sign-in page of this very site. */
export const confirmationLanding = (origin: string = window.location.origin): string => `${origin}/login`

/**
 * What a link that did not work says in the address it lands on: the
 * sign-in service puts `error`, `error_code` and `error_description` in
 * the fragment (or the query). Null for an address with no such thing.
 *
 * The words are the app's own, not the service's: "Email link is invalid
 * or has expired" tells nobody what to do next.
 */
export function linkProblem(hash: string, search = ''): string | null {
  const said = new URLSearchParams(hash.replace(/^#/, ''))
  const asked = new URLSearchParams(search)
  const code = said.get('error_code') ?? asked.get('error_code')
  const error = said.get('error') ?? asked.get('error')
  if (!code && !error) return null
  if (code === 'otp_expired' || /expired|invalid/i.test(said.get('error_description') ?? asked.get('error_description') ?? ''))
    return 'That link has expired, or has already been used. If you have confirmed your email, sign in below. If not, sign up again with the same address and a new link is sent.'
  return 'That link did not work. Sign in below, or sign up again with the same address for a new one.'
}
