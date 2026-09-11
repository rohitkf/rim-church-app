/**
 * Which key the app tells you to hold.
 *
 * The box in the header advertised ⌘K to everybody, including the people
 * on Windows and Linux who do not have that key and for whom the answer
 * is Ctrl. A shortcut hint that names a key the keyboard does not have is
 * worse than no hint: it reads as "this is for Mac people".
 *
 * Both shortcuts have always worked — the handler takes either modifier —
 * so this is only about what the label says.
 */

export interface PlatformFacts {
  platform?: string
  userAgent?: string
}

/**
 * Apple, by the only signals a browser gives us.
 *
 * `navigator.platform` is deprecated and still the most reliable of them,
 * so it is asked first and the user-agent string is the fallback. An iPad
 * that claims to be a Mac is not a problem here: it would take ⌘ too, if
 * a keyboard were attached.
 */
export function isApplePlatform({ platform, userAgent }: PlatformFacts): boolean {
  const haystack = `${platform ?? ''} ${userAgent ?? ''}`
  return /\b(mac|iphone|ipad|ipod)/i.test(haystack)
}

/** What to print on the key cap. */
export function shortcutLabel(facts: PlatformFacts): string {
  return isApplePlatform(facts) ? '⌘K' : 'Ctrl K'
}

/** The same, read out rather than drawn. */
export function shortcutSpoken(facts: PlatformFacts): string {
  return isApplePlatform(facts) ? 'Command K' : 'Control K'
}

/** The facts as this browser has them. */
export function thisPlatform(): PlatformFacts {
  if (typeof navigator === 'undefined') return {}
  return { platform: navigator.platform, userAgent: navigator.userAgent }
}
