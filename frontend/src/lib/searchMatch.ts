/**
 * Whether some words somebody typed find a thing, and how well.
 *
 * Every search box in the app used to ask one question: does the text
 * contain exactly what was typed, as one piece? So "grace mensah" did not
 * find Grace Mensah (her names are two columns), "volnteers" found
 * nothing, "José" was not found by "jose", and whatever did match came
 * back in the order the database happened to hold it.
 *
 * This is the one answer to that, for the search over everything and for
 * the box on a page:
 *
 * - case and accents are ignored;
 * - each word typed has to be found, in any order, in any field;
 * - a word found at the start of a word counts for more than one found
 *   inside it, and a whole word for more than either;
 * - a longer word may be one letter out (two, for a long one), so a slip
 *   of the thumb still finds it;
 * - the first letters of a name find it ("tr" is Team Rota);
 * - digits find a phone number however it is spaced.
 *
 * It answers with a number, bigger for a better match, or null for none.
 * Nothing here reads the network or the screen.
 */

/** One character, as it is compared: lower case, without its accent. One in, one out, so places in the folded text are places in the original. */
function foldChar(ch: string): string {
  const plain = ch.normalize('NFD')[0] ?? ch
  const lower = plain.toLowerCase()
  return lower.length === 1 ? lower : plain
}

/** Text as it is compared. The same length as what went in. */
export function fold(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i += 1) out += foldChar(text[i])
  return out
}

interface Word {
  text: string
  start: number
}

const WORD = /[\p{L}\p{N}]+/gu

/** The words of a text, folded, with where each begins. */
export function wordsOf(text: string): Word[] {
  const folded = fold(text)
  return [...folded.matchAll(WORD)].map((m) => ({ text: m[0], start: m.index }))
}

/** What was typed, as the words to look for. */
export function tokensOf(query: string): string[] {
  return wordsOf(query).map((w) => w.text)
}

/**
 * How many single slips (a letter wrong, missing, extra, or two swapped)
 * turn one word into the other, up to `most`; more than that is `most + 1`.
 */
export function slips(a: string, b: string, most: number): number {
  if (Math.abs(a.length - b.length) > most) return most + 1
  let before: number[] = []
  let row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i]
    let least = i
    for (let j = 1; j <= b.length; j += 1) {
      const same = a[i - 1] === b[j - 1]
      let cost = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (same ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cost = Math.min(cost, before[j - 2] + 1)
      next.push(cost)
      if (cost < least) least = cost
    }
    if (least > most) return most + 1
    before = row
    row = next
  }
  return row[b.length]
}

/** How many slips a typed word of this length is forgiven. Short words none: "rota" and "rita" are different things. */
function forgiven(length: number): number {
  if (length >= 8) return 2
  if (length >= 4) return 1
  return 0
}

/** How well one typed word matches one word of the text: 1 for the whole word, less for less, 0 for not at all. */
function wordQuality(token: string, word: string): number {
  if (word === token) return 1
  if (word.startsWith(token)) return 0.85
  if (token.length >= 2 && word.includes(token)) return 0.5
  const most = forgiven(token.length)
  if (most === 0) return 0
  // Against the start of the word, so a slip in "volnt" still finds "volunteers".
  for (const length of [token.length, token.length + 1, token.length - 1]) {
    if (length < 3 || length > word.length) continue
    if (slips(token, word.slice(0, length), most) <= most) return word.length === length ? 0.4 : 0.3
  }
  return 0
}

/** A piece of text to look in, and how much a match there is worth. */
export interface Field {
  text: string | null | undefined
  /** The name of the thing is worth most; what describes it, less; words nobody sees, least. */
  weight?: number
}

interface Read {
  words: Word[]
  folded: string
  digits: string
  weight: number
}

function read(field: Field): Read | null {
  if (!field.text) return null
  const words = wordsOf(field.text)
  if (words.length === 0) return null
  return { words, folded: fold(field.text).trim(), digits: field.text.replace(/\D/g, ''), weight: field.weight ?? 1 }
}

/** Whether what was typed is a telephone number, or part of one: its digits, if so. */
function typedDigits(query: string): string | null {
  if (!/^[\d\s+()\-.]+$/.test(query)) return null
  const digits = query.replace(/\D/g, '')
  return digits.length >= 4 ? digits : null
}

/**
 * How well a thing matches what was typed, or null if it does not.
 *
 * Every word typed must be found in some field. The score is the average
 * of the best place each was found, weighted by the field, with a little
 * more for a name that begins with, or is, exactly what was typed.
 */
export function matchScore(query: string, fields: Field[]): number | null {
  const tokens = tokensOf(query)
  if (tokens.length === 0) return null
  const reads = fields.map(read).filter((r): r is Read => r !== null)
  if (reads.length === 0) return null

  // A number typed with or without its spaces, its leading 0 or its +44.
  const digits = typedDigits(query)
  if (digits) {
    const national = digits.replace(/^(0|44)/, '')
    for (const r of reads) {
      if (r.digits.length >= 7 && (r.digits.includes(digits) || (national.length >= 4 && r.digits.includes(national)))) {
        return 0.9 * r.weight
      }
    }
  }

  let total = 0
  for (const token of tokens) {
    let best = 0
    for (const r of reads) {
      for (let i = 0; i < r.words.length; i += 1) {
        const quality = wordQuality(token, r.words[i].text)
        if (quality === 0) continue
        // The first word of a name is what people type first.
        const here = (quality + (i === 0 ? 0.05 : 0)) * r.weight
        if (here > best) best = here
      }
    }
    if (best === 0) {
      // The first letters of a name: "tr" for Team Rota, "sp" for Service Planner. One word typed, only.
      if (tokens.length === 1 && token.length >= 2 && token.length <= 5) {
        for (const r of reads) {
          if (r.words.length < 2) continue
          const initials = r.words.map((w) => w.text[0]).join('')
          if (initials.startsWith(token)) best = Math.max(best, 0.6 * r.weight)
        }
      }
      if (best === 0) return null
    }
    total += best
  }

  let score = total / tokens.length
  const typed = tokens.join(' ')
  for (const r of reads) {
    const name = r.words.map((w) => w.text).join(' ')
    if (name === typed) score += 0.5 * r.weight
    // Begins with what was typed: whole words, or several words with the last still being typed.
    // One unfinished word is not that, or "rota" would put Rotary lunch above Team Rota.
    else if (name.startsWith(`${typed} `) || (tokens.length > 1 && name.startsWith(typed))) score += 0.25 * r.weight
  }
  return score
}

/**
 * The stretches of a text to draw as found: where a typed word begins a
 * word, or sits inside one. A match by a slip of the thumb is not marked;
 * there is no stretch of it that is what was typed.
 */
export function matchRanges(query: string, text: string): [number, number][] {
  const tokens = tokensOf(query)
  if (tokens.length === 0 || !text) return []
  const found: [number, number][] = []
  for (const word of wordsOf(text)) {
    let best: [number, number] | null = null
    for (const token of tokens) {
      const at = word.text.startsWith(token) ? 0 : token.length >= 2 ? word.text.indexOf(token) : -1
      if (at < 0) continue
      if (!best || token.length > best[1] - best[0]) best = [word.start + at, word.start + at + token.length]
    }
    if (best) found.push(best)
  }
  return found
}

/** A text cut into pieces, each said to be found or not: what a result row draws. */
export function markedPieces(query: string, text: string): { text: string; found: boolean }[] {
  const pieces: { text: string; found: boolean }[] = []
  let at = 0
  for (const [start, end] of matchRanges(query, text)) {
    if (start > at) pieces.push({ text: text.slice(at, start), found: false })
    pieces.push({ text: text.slice(start, end), found: true })
    at = end
  }
  if (at < text.length) pieces.push({ text: text.slice(at), found: false })
  return pieces
}

/** A list, narrowed to what matches and put best first. With nothing typed, the list as it came. */
export function searchList<T>(query: string, items: readonly T[], fields: (item: T) => Field[]): T[] {
  if (tokensOf(query).length === 0) return [...items]
  return items
    .map((item, index) => ({ item, index, score: matchScore(query, fields(item)) }))
    .filter((x): x is { item: T; index: number; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.item)
}

/**
 * A line of somebody's writing, cut to the part that was found, so a
 * result shows why it is one. From the start, if the words are near it.
 */
export function snippetAround(query: string, body: string, length = 80): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat.length <= length) return flat
  const first = matchRanges(query, flat)[0]
  const from = first && first[0] > length - 20 ? Math.max(0, first[0] - 20) : 0
  const cut = flat.slice(from, from + length).trim()
  return `${from > 0 ? '…' : ''}${cut}${from + length < flat.length ? '…' : ''}`
}
