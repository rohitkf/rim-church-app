import { describe, expect, it } from 'vitest'
import { fold, markedPieces, matchRanges, matchScore, searchList, slips, snippetAround, tokensOf } from './searchMatch'

/*
 * Finding things by what somebody typed. Every search box used to ask
 * whether the text contained exactly what was typed, as one piece: two
 * words found nothing, a slip found nothing, and what was found came in
 * no order.
 */
const name = (text: string) => [{ text, weight: 3 }]
const score = (q: string, text: string) => matchScore(q, name(text))

describe('what counts as the same', () => {
  it('ignores case and accents, and keeps every place where it was', () => {
    expect(fold('José ÅNGSTRÖM')).toBe('jose angstrom')
    expect(fold('José').length).toBe('José'.length)
    expect(score('jose', 'José Núñez')).not.toBeNull()
    expect(score('JOSÉ', 'jose nunez')).not.toBeNull()
  })

  it('reads what was typed as words, whatever is between them', () => {
    expect(tokensOf('  Grace,  Mensah-Boateng ')).toEqual(['grace', 'mensah', 'boateng'])
    expect(tokensOf('grace@example.com')).toEqual(['grace', 'example', 'com'])
    expect(tokensOf('   ')).toEqual([])
  })
})

describe('finding', () => {
  it('finds every word typed, in any order and in any field', () => {
    const grace = [{ text: 'Grace Mensah', weight: 3 }, { text: 'Media · Worship', weight: 2 }, { text: 'grace@example.com' }]
    expect(matchScore('grace mensah', grace)).not.toBeNull()
    expect(matchScore('mensah grace', grace)).not.toBeNull()
    expect(matchScore('grace media', grace)).not.toBeNull()
    expect(matchScore('grace example', grace)).not.toBeNull()
    // Every word, not any word: one that is nowhere means it is somebody else.
    expect(matchScore('grace kids', grace)).toBeNull()
  })

  it('finds a word by its start, and by a piece of it', () => {
    expect(score('vol', 'Volunteers')).not.toBeNull()
    expect(score('unteer', 'Volunteers')).not.toBeNull()
    // One letter only ever finds the start of a word.
    expect(score('o', 'Volunteers')).toBeNull()
    expect(score('v', 'Volunteers')).not.toBeNull()
  })

  it('forgives a slip in a longer word, and none in a short one', () => {
    expect(score('volnteers', 'Volunteers')).not.toBeNull()
    expect(score('voluntere', 'Volunteers')).not.toBeNull()
    expect(score('mensha', 'Grace Mensah')).not.toBeNull()
    expect(score('calender', 'Calendar')).not.toBeNull()
    expect(score('volnt', 'Volunteers')).not.toBeNull()
    // Two slips are forgiven only a long word.
    expect(score('avalability', 'Availability')).not.toBeNull()
    expect(score('claendra', 'Calendar')).not.toBeNull()
    expect(score('rita', 'Team Rota')).not.toBeNull()
    // Short words are different things, not slips.
    expect(score('rot', 'Rita')).toBeNull()
    expect(score('sam', 'Sue')).toBeNull()
    expect(score('kids', 'Media')).toBeNull()
  })

  it('finds a name by its first letters', () => {
    expect(score('tr', 'Team Rota')).not.toBeNull()
    expect(score('sp', 'Service Planner')).not.toBeNull()
    expect(score('dbs', 'DBS Checks')).not.toBeNull()
    expect(score('xy', 'Team Rota')).toBeNull()
  })

  it('finds a telephone number however it was typed or kept', () => {
    const phone = [{ text: 'Grace Mensah', weight: 3 }, { text: '+44 7700 900123' }]
    for (const typed of ['07700 900123', '07700900123', '+447700900123', '7700 900', '900123']) {
      expect(matchScore(typed, phone), typed).not.toBeNull()
    }
    expect(matchScore('07700 900999', phone)).toBeNull()
    // Three digits are not a telephone number: they are looked for as a word.
    expect(matchScore('770', phone)).not.toBeNull()
    expect(matchScore('123', [{ text: 'Grace', weight: 3 }])).toBeNull()
  })

  it('finds nothing with nothing typed, and nothing in nothing', () => {
    expect(matchScore('', name('Grace'))).toBeNull()
    expect(matchScore('grace', [{ text: null }, { text: '' }])).toBeNull()
  })
})

describe('what comes first', () => {
  const order = (q: string, names: string[]) => searchList(q, names, (n) => name(n))

  it('puts the whole word before the start of one, and that before the middle of one', () => {
    expect(order('rota', ['Rotary lunch', 'Team Rota', 'Protagonist'])).toEqual(['Team Rota', 'Rotary lunch', 'Protagonist'])
  })

  it('puts an exact name before a longer one that starts the same, and a real match before a slip', () => {
    expect(order('grace', ['Grace Mensah', 'Grace', 'Gracie Hall'])[0]).toBe('Grace')
    expect(order('media', ['Medie Okafor', 'Media'])).toEqual(['Media', 'Medie Okafor'])
  })

  it('counts a match in the name for more than one in the small print', () => {
    const things = [
      { label: 'Settings', also: 'rota tags' },
      { label: 'Team Rota', also: '' },
    ]
    expect(searchList('rota', things, (t) => [{ text: t.label, weight: 3 }, { text: t.also }])[0].label).toBe('Team Rota')
  })

  it('leaves a list as it came when nothing is typed, and keeps its order among equals', () => {
    expect(order('', ['b', 'a'])).toEqual(['b', 'a'])
    expect(order('sam', ['Sam Varghese', 'Sam Adeyemi'])).toEqual(['Sam Varghese', 'Sam Adeyemi'])
  })
})

describe('showing what was found', () => {
  it('marks where each word typed sits, in the text as it was written', () => {
    expect(matchRanges('gra men', 'Grace Mensah')).toEqual([[0, 3], [6, 9]])
    expect(markedPieces('jose', 'José Núñez')).toEqual([
      { text: 'José', found: true },
      { text: ' Núñez', found: false },
    ])
    expect(markedPieces('unteer', 'Volunteers')).toEqual([
      { text: 'Vol', found: false },
      { text: 'unteer', found: true },
      { text: 's', found: false },
    ])
  })

  it('marks nothing for a match that was a slip, and gives the text back whole', () => {
    expect(markedPieces('volnteers', 'Volunteers')).toEqual([{ text: 'Volunteers', found: false }])
    expect(markedPieces('', 'Volunteers')).toEqual([{ text: 'Volunteers', found: false }])
  })

  it('cuts a long piece of writing to the part that was found', () => {
    const body = `${'Lorem ipsum dolor sit amet. '.repeat(6)}The projector bulb needs replacing before Sunday. ${'More words follow here. '.repeat(4)}`
    const cut = snippetAround('projector', body)
    expect(cut).toContain('projector bulb')
    expect(cut.startsWith('…')).toBe(true)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut.length).toBeLessThanOrEqual(82)
    // Near the start, it starts at the start; short enough, it is left alone.
    expect(snippetAround('lorem', body).startsWith('Lorem')).toBe(true)
    expect(snippetAround('bulb', 'The bulb has gone.')).toBe('The bulb has gone.')
  })
})

describe('counting slips', () => {
  it('counts a wrong, missing, extra or swapped letter as one', () => {
    expect(slips('calendar', 'calender', 2)).toBe(1)
    expect(slips('mensah', 'mensha', 2)).toBe(1)
    expect(slips('rota', 'rta', 2)).toBe(1)
    expect(slips('rota', 'rotaa', 2)).toBe(1)
    expect(slips('rota', 'rota', 2)).toBe(0)
    expect(slips('abcdef', 'uvwxyz', 2)).toBe(3)
  })
})
