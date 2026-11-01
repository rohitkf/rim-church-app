/**
 * Web addresses in what people write, found so they can be tapped.
 *
 * Board posts, team chat and Church Updates are plain text, and people
 * paste links into them — a sign-up form, a livestream, a song. Drawn as
 * text, a link has to be copied out by hand, which on a phone is a long
 * press, a drag and a paste. So the screen finds them and makes them
 * links. Nothing is stored differently: a message written last year lights
 * up the same as one written today.
 *
 * Only http(s), and a bare `www.` address, which is given https. Anything
 * else that looks like a scheme (`javascript:`, `data:`) stays text.
 */

export interface TextPart {
  text: string
  /** Where it goes, when this part is a link. */
  href?: string
}

// A run of non-space characters starting http(s):// or www. — trimmed of
// the punctuation that ends a sentence rather than the address, below.
const ADDRESS = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi

/** What a sentence leaves stuck to the end of an address: "see example.org." */
const TRAILING = /[.,!?;:'"’”…]+$/

function trimEnd(candidate: string): string {
  let url = candidate.replace(TRAILING, '')
  // A closing bracket belongs to the address only if it opened one:
  // (https://en.wikipedia.org/wiki/Psalm_(song)) keeps one, not both.
  while (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    url = url.slice(0, -1).replace(TRAILING, '')
  }
  return url
}

/** A piece of text, cut into plain runs and the addresses inside it. */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = []
  let at = 0
  for (const match of text.matchAll(ADDRESS)) {
    const start = match.index ?? 0
    const url = trimEnd(match[0])
    // "www." alone, or an address that was all punctuation, is just text.
    if (url.replace(/^(?:https?:\/\/|www\.)/i, '').length === 0) continue
    if (start > at) parts.push({ text: text.slice(at, start) })
    parts.push({ text: url, href: /^www\./i.test(url) ? `https://${url}` : url })
    at = start + url.length
  }
  if (at < text.length) parts.push({ text: text.slice(at) })
  return parts.length > 0 ? parts : [{ text }]
}

/**
 * A link somebody typed into a field of its own (an event's, 0239), as the
 * address to store: trimmed, a bare `www.` given https, empty as null.
 * Anything that is not a web address is `false`, so the form can say so
 * rather than save something that will not open (or opens a script).
 */
export function webAddress(input: string): string | null | false {
  const typed = input.trim()
  if (!typed) return null
  const url = /^www\./i.test(typed) ? `https://${typed}` : typed
  return /^https?:\/\/[^\s]+$/i.test(url) && url.length <= 2000 ? url : false
}
