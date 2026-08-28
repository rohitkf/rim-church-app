/**
 * Naming someone with an @.
 *
 * Two halves, both here rather than in the component, because both are
 * fiddly in the ways that only show up in a test: working out which token
 * the caret is inside while someone is still typing it, and turning a
 * finished body of text back into the people it names.
 *
 * A mention is resolved at the moment it is written and the ids are stored
 * with the message. Re-parsing later would mean a name that changes, or a
 * person who leaves, quietly changes who was spoken to — and a chat should
 * mean what it meant when it was sent.
 */

export interface MentionablePerson {
  id: string
  first_name: string
  last_name: string
}

export const fullName = (p: MentionablePerson) => `${p.first_name} ${p.last_name}`.trim()

/** How a person is written into the text once picked. */
export const mentionToken = (p: MentionablePerson) => `@${fullName(p)}`

/**
 * The @word the caret is currently inside, if any.
 *
 * Only counts when the @ starts a word — an email address is not a
 * mention — and stops at a second space, so "@Grace Mensah" can be matched
 * as one name while a sentence after it is left alone.
 */
export function activeMentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at === -1) return null
  // Must begin a word.
  if (at > 0 && !/\s/.test(before[at - 1])) return null

  const query = before.slice(at + 1)
  // A newline ends it, and so does a third word: nobody is called three
  // words, and without a limit the whole paragraph becomes the query.
  if (/\n/.test(query)) return null
  if (query.split(' ').length > 2) return null

  return { query, start: at }
}

/** People whose name starts with what has been typed so far. */
export function matchPeople(
  query: string,
  people: MentionablePerson[],
  limit = 6,
): MentionablePerson[] {
  const needle = query.trim().toLowerCase()
  const scored = people
    .map((person) => {
      const name = fullName(person).toLowerCase()
      if (needle === '') return { person, rank: 1 }
      if (name.startsWith(needle)) return { person, rank: 0 }
      if (person.last_name.toLowerCase().startsWith(needle)) return { person, rank: 1 }
      if (name.includes(needle)) return { person, rank: 2 }
      return null
    })
    .filter((row): row is { person: MentionablePerson; rank: number } => row !== null)
    .sort((a, b) => a.rank - b.rank || fullName(a.person).localeCompare(fullName(b.person)))

  return scored.slice(0, limit).map((row) => row.person)
}

/** Replace the @token being typed with a chosen person's name. */
export function applyMention(
  text: string,
  caret: number,
  person: MentionablePerson,
): { text: string; caret: number } {
  const active = activeMentionQuery(text, caret)
  if (!active) return { text, caret }
  const inserted = `${mentionToken(person)} `
  const next = text.slice(0, active.start) + inserted + text.slice(caret)
  return { text: next, caret: active.start + inserted.length }
}

/**
 * Everyone named in a finished message.
 *
 * Longest name first, so "@Grace Mensah" is matched as Grace Mensah rather
 * than as a Grace who happens to be followed by a word.
 */
export function parseMentions(body: string, people: MentionablePerson[]): string[] {
  const found = new Set<string>()
  const byLength = [...people].sort((a, b) => fullName(b).length - fullName(a).length)
  const lower = body.toLowerCase()

  for (const person of byLength) {
    const token = `@${fullName(person)}`.toLowerCase()
    let from = 0
    for (;;) {
      const at = lower.indexOf(token, from)
      if (at === -1) break
      const before = at === 0 || /\s/.test(body[at - 1])
      const after = at + token.length >= body.length || /[\s.,!?;:)]/.test(body[at + token.length])
      if (before && after) {
        found.add(person.id)
        break
      }
      from = at + token.length
    }
  }

  return [...found]
}

export interface BodySegment {
  text: string
  /** The person named, when this segment is a mention. */
  person?: MentionablePerson
}

/** The message broken into plain runs and the mentions between them. */
export function splitBody(body: string, people: MentionablePerson[]): BodySegment[] {
  const named = people.filter((p) => parseMentions(body, [p]).length > 0)
  if (named.length === 0) return [{ text: body }]

  const byLength = [...named].sort((a, b) => fullName(b).length - fullName(a).length)
  const segments: BodySegment[] = []
  let rest = body

  outer: while (rest.length > 0) {
    for (const person of byLength) {
      const token = `@${fullName(person)}`
      const at = rest.toLowerCase().indexOf(token.toLowerCase())
      if (at === -1) continue
      const before = at === 0 || /\s/.test(rest[at - 1])
      if (!before) continue
      if (at > 0) segments.push({ text: rest.slice(0, at) })
      segments.push({ text: rest.slice(at, at + token.length), person })
      rest = rest.slice(at + token.length)
      continue outer
    }
    segments.push({ text: rest })
    break
  }

  return segments
}
