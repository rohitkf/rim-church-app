import { describe, expect, it } from 'vitest'
import {
  activeMentionQuery,
  applyMention,
  matchPeople,
  mentionToken,
  parseMentions,
  splitBody,
} from './mentions'

const people = [
  { id: 'u1', first_name: 'Grace', last_name: 'Mensah' },
  { id: 'u2', first_name: 'Tunde', last_name: 'Alabi' },
  { id: 'u3', first_name: 'Grace', last_name: 'Okoro' },
]

describe('the @ being typed', () => {
  it('finds the token the caret is inside', () => {
    expect(activeMentionQuery('hey @gra', 8)).toEqual({ query: 'gra', start: 4 })
    expect(activeMentionQuery('@Grace Men', 10)).toEqual({ query: 'Grace Men', start: 0 })
  })

  it('is nothing before an @ is typed', () => {
    expect(activeMentionQuery('hello there', 11)).toBeNull()
  })

  it('ignores an @ inside a word, so an email is never a mention', () => {
    expect(activeMentionQuery('mail grace@rim.org', 18)).toBeNull()
  })

  it('gives up after two words rather than eating the sentence', () => {
    expect(activeMentionQuery('@Grace Mensah please bring', 26)).toBeNull()
  })

  it('ends at a newline', () => {
    expect(activeMentionQuery('@Grace\nnext line', 16)).toBeNull()
  })
})

describe('matching people', () => {
  it('prefers a full-name match, then a surname, then anything containing it', () => {
    expect(matchPeople('grace m', people).map((p) => p.id)).toEqual(['u1'])
    expect(matchPeople('alabi', people).map((p) => p.id)).toEqual(['u2'])
    expect(matchPeople('grace', people).map((p) => p.id)).toEqual(['u1', 'u3'])
  })

  it('offers everyone when nothing has been typed yet', () => {
    expect(matchPeople('', people)).toHaveLength(3)
  })
})

describe('picking someone from the list', () => {
  it('replaces what was typed and leaves the caret after the name', () => {
    const result = applyMention('hey @gra', 8, people[0])
    expect(result.text).toBe('hey @Grace Mensah ')
    expect(result.caret).toBe(result.text.length)
  })

  it('keeps whatever came after the caret', () => {
    const result = applyMention('hey @gra can you', 8, people[0])
    expect(result.text).toBe('hey @Grace Mensah  can you')
  })
})

describe('reading a finished message', () => {
  it('names the people it names', () => {
    expect(parseMentions('@Grace Mensah can you bring it', people)).toEqual(['u1'])
  })

  it('tells two people with the same first name apart', () => {
    expect(parseMentions('@Grace Okoro and @Tunde Alabi', people).sort()).toEqual(['u2', 'u3'])
  })

  it('does not match a name buried inside a word or an address', () => {
    expect(parseMentions('email grace@rim.org', people)).toEqual([])
    expect(parseMentions('x@Grace Mensah', people)).toEqual([])
  })

  it('matches a name that ends the sentence, or is followed by punctuation', () => {
    expect(parseMentions('thanks @Tunde Alabi', people)).toEqual(['u2'])
    expect(parseMentions('@Tunde Alabi, are you in?', people)).toEqual(['u2'])
  })

  it('writes a person into text the same way it reads them back', () => {
    const body = `hello ${mentionToken(people[1])}`
    expect(parseMentions(body, people)).toEqual(['u2'])
  })
})

describe('drawing a message', () => {
  it('splits it into plain runs and the mentions between them', () => {
    expect(splitBody('hey @Tunde Alabi can you help', people)).toEqual([
      { text: 'hey ' },
      { text: '@Tunde Alabi', person: people[1] },
      { text: ' can you help' },
    ])
  })

  it('leaves a message with no mentions in one piece', () => {
    expect(splitBody('nothing to see', people)).toEqual([{ text: 'nothing to see' }])
  })
})
