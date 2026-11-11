/**
 * Start the app again from a clean page.
 *
 * For the moments when what the app is holding cannot be trusted and
 * reading it all again piece by piece would be guesswork — somebody who
 * was shut out (the app closed for maintenance, their account blocked)
 * and is now let in holds a profile, roles and pages that were all
 * refused while the door was shut. One function, so the places that need
 * it say why they do and a test can see that they did.
 */
export function reloadApp(): void {
  window.location.reload()
}
