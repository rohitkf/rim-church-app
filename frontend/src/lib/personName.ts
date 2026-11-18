/**
 * A person's name, written the way a name is written (0306).
 *
 * People type their names as they type everything else — "john smith",
 * "JOHN SMITH", " anne - marie " — and some type what is not a name at all
 * ("y@cht_234"). The first is put right without asking; the second is
 * refused with the reason.
 *
 * **The database has the last word.** `person_name_tidy()` and
 * `person_name_ok()` are the same two rules in SQL, and a trigger on every
 * table that keeps the name of somebody in the church (profiles,
 * household_members, guests) applies them to whatever arrives, from this
 * app or from anything else. Not registrations and reception: a visitor's
 * name is kept as they typed it (0307, the Owner's instruction), and so is
 * the name on a bank account.
 * What is here is so the form can show the name as it will be saved and
 * say what is wrong before the save is sent. The two are held together by
 * one list of examples: `NAME_EXAMPLES` below is what this file's test
 * runs, and the same pairs are a `do` block in the newest migration that
 * sets the rule (0307).
 * Change the rule in both, and the list in both.
 *
 * The rule:
 *  - spaces at the ends go, runs of spaces become one, a curly apostrophe
 *    or a long dash becomes the plain one, a hyphen loses the spaces round
 *    it, a doubled hyphen, apostrophe or full stop becomes one;
 *  - every word starts with a capital and the rest is small, however it
 *    was typed. A word starts after a space, a hyphen or a full stop
 *    (Anne-Marie, St. John);
 *  - after an apostrophe only when one letter stands before it (O'Brien,
 *    D'Souza — but Sa'id, where the apostrophe is inside the word);
 *  - Mc takes a capital after it (McDonald). Mac does not: Mackenzie and
 *    Macey are as common as MacDonald, and a guess would be wrong half
 *    the time;
 *  - **a capital inside a word is kept only where it was plainly meant**:
 *    the word was typed with a capital first, a small letter stands before
 *    the inner capital and two small letters after it (MacDonald, DeShawn,
 *    LeAnn). That is how somebody types their own name and not how
 *    anybody types carelessly: JOHN, jOhN, JoHn and JoHnNy all come out
 *    John and Johnny. Without it MacDonald could never be saved as
 *    MacDonald, whatever its owner did;
 *  - **initials stay capitals** where they were plainly meant: a word of
 *    one or two letters typed in capitals, in a name that has a small
 *    letter somewhere (Ps Emmanuel KB, KK Renjith), or a name that is
 *    nothing else — a last name of "YL" is initials (0307). A longer name
 *    typed all in capitals says nothing about which of its words are
 *    initials, so JO SMITH is Jo Smith — and initials can always be
 *    given with full stops (K.B.);
 *  - a name is letters — of any alphabet — with spaces, hyphens,
 *    apostrophes and full stops between them, and starts with a letter.
 *    No digits, no @, no underscore.
 */

/** What may stand in a name besides letters. */
const BETWEEN = "' .-"

const APOSTROPHES = /[’‘ʼ`´]/g
const DASHES = /[‐-—]/g
const SPACES = /[ \t\n\r]/g

const IS_NAME = /^\p{L}[\p{L}\p{M}' .-]*$/u
const NOT_IN_A_NAME = /[^\p{L}\p{M}' .-]/gu

/** One letter in the other case, or itself where the other case is not one letter (ß, İ). */
function upperOf(ch: string): string {
  const up = ch.toUpperCase()
  return up.length === ch.length ? up : ch
}

function lowerOf(ch: string): string {
  const low = ch.toLowerCase()
  return low.length === ch.length ? low : ch
}

const isCapital = (ch: string | undefined): boolean => ch !== undefined && ch !== lowerOf(ch)
const isSmall = (ch: string | undefined): boolean => ch !== undefined && ch !== upperOf(ch)

/** An ASCII character that is neither a letter nor an apostrophe ends a word. */
function endsWord(ch: string): boolean {
  return ch.charCodeAt(0) < 128 && !/[A-Za-z]/.test(ch)
}

/**
 * The name as it is saved: tidied and capitalised. Says nothing about
 * whether it is a name — `nameProblem` does.
 */
export function tidyName(raw: string | null | undefined): string {
  if (!raw) return ''
  const plain = raw
    .normalize('NFC')
    .replace(APOSTROPHES, "'")
    .replace(DASHES, '-')
    .replace(SPACES, ' ')
    .replace(/ +/g, ' ')
    .replace(/ ?- ?/g, '-')
    .replace(/([-'.])\1+/g, '$1')
    .replace(/^[-'. ]+/, '')
    .replace(/[-' ]+$/, '')

  const chars = [...plain]
  // A small letter anywhere says the capitals in it were chosen, not left on.
  const someSmall = chars.some(isSmall)
  let out = ''
  // The word so far, in small letters: what decides the next letter's case.
  let word = ''
  let capitalNext = false
  // Whether the word in hand was typed with a capital first: only then can
  // a capital inside it have been meant.
  let typedProper = false
  // Whether the word in hand is initials, kept as capitals.
  let initials = false
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]
    if (ch === "'") {
      initials = false
      capitalNext = word.length === 1
      word += ch
      out += ch
    } else if (endsWord(ch)) {
      word = ''
      capitalNext = false
      out += ch
    } else {
      if (word === '') {
        typedProper = isCapital(ch)
        let end = i
        while (end < chars.length && chars[end] !== "'" && !endsWord(chars[end])) end += 1
        // "'" ends the look but not the word: O'B is not initials.
        // Chosen, or all there is: one or two capitals with nothing beside them.
        const alone = i === 0 && end === chars.length
        initials = (someSmall || alone) && end - i <= 2 && chars[end] !== "'" && chars.slice(i, end).every(isCapital)
      }
      const meant =
        typedProper && word.length >= 2 && isCapital(ch) && isSmall(chars[i - 1]) && isSmall(chars[i + 1]) && isSmall(chars[i + 2])
      out += word === '' || capitalNext || word === 'mc' || meant || initials ? upperOf(ch) : lowerOf(ch)
      word += lowerOf(ch)
      capitalNext = false
    }
  }
  return out
}

/** Whether this is a name as the app keeps one. Empty is not: ask `tidyName(x) === ''` first where a blank is allowed. */
export function isName(raw: string | null | undefined): boolean {
  return IS_NAME.test(tidyName(raw))
}

function listed(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * What is wrong with this name, in words for the person who typed it, or
 * null when nothing is. A blank is not this function's business — whether
 * a name is needed is the form's — so a blank answers null.
 *
 * `what` names the field as the form does: "First name", "Their name".
 */
export function nameProblem(raw: string | null | undefined, what = 'Name'): string | null {
  const typed = (raw ?? '').trim()
  if (typed === '') return null
  const tidy = tidyName(typed)
  if (IS_NAME.test(tidy)) return null

  const strangers = [...new Set(tidy.match(NOT_IN_A_NAME) ?? [])].filter((ch) => !BETWEEN.includes(ch))
  if (strangers.length > 0) {
    const shown = strangers.slice(0, 6).map((ch) => (ch.trim() === '' ? 'the odd space' : ch))
    const out = strangers.length > shown.length ? `${shown.join(', ')} and the rest like them` : listed(shown)
    return `${what} can only have letters in it. Take out ${out}.`
  }
  return `${what} has to start with a letter.`
}

/**
 * A name refused before it was sent: its message is `nameProblem`'s words.
 *
 * Its own type so `humanError` passes the words through untouched, as it
 * does for an edge function's refusal and for the database's own — a
 * plain Error would reach most people as "Could not save".
 */
export class NotAName extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotAName'
  }
}

/**
 * The name as it goes to the database, or a `NotAName` saying why not.
 *
 * For the functions in lib/ that save a name: whatever form called them,
 * and whether or not it checked first, nothing that is not a name is sent.
 */
export function nameToSave(raw: string | null | undefined, what = 'Name'): string {
  const wrong = nameProblem(raw, what)
  if (wrong) throw new NotAName(wrong)
  return tidyName(raw)
}

/**
 * The examples both halves are held to: what was typed, and what is kept
 * (null: refused). The migration's own check runs the same pairs through
 * the SQL.
 */
export const NAME_EXAMPLES: readonly (readonly [typed: string, kept: string | null])[] = [
  ['john', 'John'],
  ['JOHN SMITH', 'John Smith'],
  ['jOhN sMiTh', 'John Smith'],
  ['  john   smith  ', 'John Smith'],
  ['anne-marie', 'Anne-Marie'],
  ['anne - marie', 'Anne-Marie'],
  ['ANNE–MARIE', 'Anne-Marie'],
  ["o'brien", "O'Brien"],
  ['o’brien', "O'Brien"],
  ["d'souza", "D'Souza"],
  ["sa'id", "Sa'id"],
  ["SHA'QUILLE", "Sha'quille"],
  ['mcdonald', 'McDonald'],
  ['MCCARTHY', 'McCarthy'],
  ['mc', 'Mc'],
  ['mackenzie', 'Mackenzie'],
  ['MacDonald', 'MacDonald'],
  ['MACDONALD', 'Macdonald'],
  ['macdonald', 'Macdonald'],
  ['DeShawn', 'DeShawn'],
  ['LeAnn', 'LeAnn'],
  ['McDONALD', 'McDonald'],
  ['JoHn', 'John'],
  ['JoHnNy', 'Johnny'],
  ['JOhn', 'John'],
  ['van der berg', 'Van Der Berg'],
  ['st. john', 'St. John'],
  ['j.r. smith', 'J.R. Smith'],
  ['smith jr.', 'Smith Jr.'],
  ['élodie', 'Élodie'],
  ['ÉLODIE DUPONT', 'Élodie Dupont'],
  ['ñuñez', 'Ñuñez'],
  ['oluwaseun adéyemí', 'Oluwaseun Adéyemí'],
  ['-john-', 'John'],
  ["''john", 'John'],
  ['john--paul', 'John-Paul'],
  ['McDonald', 'McDonald'],
  ["O'Brien-O'Neil", "O'Brien-O'Neil"],
  ['John Smith', 'John Smith'],
  ['Ps Emmanuel KB', 'Ps Emmanuel KB'],
  ['Ps KK Renjith', 'Ps KK Renjith'],
  ['jerry KJ', 'Jerry KJ'],
  ['JOEL V REJI', 'Joel V Reji'],
  ['M kurian', 'M Kurian'],
  ['JO SMITH', 'Jo Smith'],
  ['MR JOHN SMITH', 'Mr John Smith'],
  ['YL', 'YL'],
  ['yl', 'Yl'],
  ['Li', 'Li'],
  ['V', 'V'],
  ['RAJ', 'Raj'],
  ['kb', 'Kb'],
  ['k.b. ganesh', 'K.B. Ganesh'],
  ['John RAJ', 'John Raj'],
  ['y@cht_234', null],
  ['john2', null],
  ['john_smith', null],
  ['john@example.com', null],
  ['john (johnny)', null],
  ['mum & dad', null],
  ['smith, john', null],
  ['123', null],
  ['john 🙂', null],
  ['...', null],
]
