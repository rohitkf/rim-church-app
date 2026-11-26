/*
 * A password that is already out there.
 *
 * The first passwords an attacker tries are the ones already found in
 * other people's breaches. Supabase can refuse those, on a paid plan. On
 * this one the form asks instead, before the password is ever sent to be
 * stored: Have I Been Pwned keeps a list of every password seen in a
 * breach and answers without being told which one is being asked about.
 * The form sends the first five characters of the password's fingerprint
 * (never the password, never the whole fingerprint) and gets back every
 * fingerprint that starts that way, hundreds of them; it looks for its own
 * among those here, on the device.
 *
 * Not being able to ask stops nobody: no signal, a slow answer or a
 * browser too old to work out a fingerprint all mean "not known", and the
 * eight-character rule still stands.
 */

const RANGE = 'https://api.pwnedpasswords.com/range/'
const ASK_FOR_MS = 4000

async function fingerprint(password: string): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null
  const bytes = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(password))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** How many times the list has seen `suffix`, from an answer of "SUFFIX:COUNT" lines. */
export function timesSeen(answer: string, suffix: string): number {
  for (const line of answer.split('\n')) {
    const [tail, count] = line.trim().split(':')
    if (tail === suffix) return Number(count) || 0
  }
  return 0
}

/**
 * How many known breaches this password has been found in: nought for
 * none, null when it could not be asked.
 */
export async function seenInBreaches(password: string, ask: typeof fetch = fetch): Promise<number | null> {
  try {
    const whole = await fingerprint(password)
    if (!whole) return null
    const stop = new AbortController()
    const timer = setTimeout(() => stop.abort(), ASK_FOR_MS)
    try {
      // Add-Padding: the answer is padded to a fixed size, so its length says nothing about what was asked.
      const res = await ask(RANGE + whole.slice(0, 5), { headers: { 'Add-Padding': 'true' }, signal: stop.signal })
      if (!res.ok) return null
      return timesSeen(await res.text(), whole.slice(5))
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

/** What the form says when the answer is "yes". */
export const BREACHED_PASSWORD =
  'That password has turned up in a known data breach, so it is among the first anybody guessing would try. Choose a different one.'
