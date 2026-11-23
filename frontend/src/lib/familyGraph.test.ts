import { describe, expect, it } from 'vitest'
import { accountNode, edgeSentence, edgeText, familyGraph, nodeId, type PairEdge } from './familyGraph'
import type { Family, FamilyMember } from './families'

/*
 * Families as a graph: everybody a node, every relationship a line with
 * what the people on it are to each other written along it.
 */

const row = (id: string, account: string | null, kind: 'adult' | 'child', first: string, gender?: 'male' | 'female'): FamilyMember => ({
  id,
  user_id: account,
  kind,
  first_name: first,
  last_name: 'T',
  gender: gender ?? null,
})
const family = (id: string, members: FamilyMember[]): Family => ({ id, members })

const grans = family('g', [row('g1', 'gran', 'adult', 'Gran', 'female'), row('a1', 'anna', 'child', 'Anna', 'female'), row('w', null, 'child', 'Wren')])
const annas = family('a', [row('a2', 'anna', 'adult', 'Anna', 'female'), row('t', 'tom', 'adult', 'Tom', 'male'), row('k', 'kid', 'child', 'Kid', 'male'), row('z', null, 'child', 'Zoe', 'female')])

/**
 * A line as a few words: "Anna-Tom: Wife/Husband" between two people, by
 * their first names and what each is to the other; "Anna+Tom>Kid: Son"
 * from the middle of a couple's line to their child.
 */
const lines = (households: Family[]) => {
  const g = familyGraph(households)
  const name = (id: string) => g.nodes.find((n) => n.id === id)?.first_name
  return g.edges.map((e) =>
    e.kind === 'hub' ? `${name(e.couple[0])}+${name(e.couple[1])}>${name(e.child)}: ${e.word}` : `${name(e.a)}-${name(e.b)}: ${e.aWord}/${e.bWord}${e.hub ? ' (children)' : ''}`,
  )
}

describe('who is a node', () => {
  it('is everybody once: an account by its account, somebody written in by their row', () => {
    const g = familyGraph([annas])
    expect(g.nodes.map((n) => n.id)).toEqual(['u:anna', 'u:tom', 'u:kid', 'w:z'])
    expect(nodeId({ id: 'z', user_id: null })).toBe('w:z')
    expect(accountNode('anna')).toBe('u:anna')
  })

  it('is one node for somebody in two households', () => {
    const g = familyGraph([grans, annas])
    expect(g.nodes.filter((n) => n.first_name === 'Anna')).toHaveLength(1)
    expect(g.nodes).toHaveLength(6)
  })

  it('stands each in their generation: somebody with a household of their own beside their husband or wife', () => {
    const g = familyGraph([grans, annas])
    const generation = Object.fromEntries(g.nodes.map((n) => [n.first_name, n.generation]))
    expect(generation).toEqual({ Gran: 0, Anna: 1, Wren: 1, Tom: 1, Kid: 2, Zoe: 2 })
    // Whichever order the households come in.
    expect(Object.fromEntries(familyGraph([annas, grans]).nodes.map((n) => [n.first_name, n.generation]))).toEqual(generation)
  })

  it('has somebody linked to nobody as a node with no lines', () => {
    const g = familyGraph([annas], [{ id: 'rose', first_name: 'Rose', last_name: 'M' }])
    expect(g.nodes.map((n) => n.first_name)).toContain('Rose')
    expect(JSON.stringify(g.edges)).not.toContain('u:rose')
  })

  it('does not add somebody alone who is already in a family', () => {
    expect(familyGraph([annas], [{ id: 'anna', first_name: 'Anna', last_name: 'T' }]).nodes.filter((n) => n.id === 'u:anna')).toHaveLength(1)
  })

  it('hands the households over oldest first, for whoever places them', () => {
    const units = familyGraph([annas, grans]).units
    expect(units).toEqual([
      { adults: ['u:gran'], children: ['u:anna', 'w:w'] },
      { adults: ['u:anna', 'u:tom'], children: ['u:kid', 'w:z'] },
    ])
  })
})

describe('what is a line', () => {
  it('joins a couple, and each child to the middle of their line: one line to a child of two parents', () => {
    expect(lines([annas])).toEqual(['Anna-Tom: Wife/Husband (children)', 'Anna+Tom>Kid: Son', 'Anna+Tom>Zoe: Daughter'])
  })

  it('joins a parent alone and their child with both words, since no other line says the parent’s', () => {
    expect(lines([grans])).toEqual(['Gran-Anna: Mother/Daughter', 'Gran-Wren: Mother/Child'])
  })

  it('joins the generations through the one who is in both households', () => {
    expect(lines([grans, annas])).toEqual([
      'Gran-Anna: Mother/Daughter',
      'Gran-Wren: Mother/Child',
      'Anna-Tom: Wife/Husband (children)',
      'Anna+Tom>Kid: Son',
      'Anna+Tom>Zoe: Daughter',
    ])
  })

  it('has no children hanging from a couple with none', () => {
    const two = family('c', [row('x', 'xavier', 'adult', 'Xavier', 'male'), row('y', 'yara', 'adult', 'Yara', 'female')])
    expect(lines([two])).toEqual(['Xavier-Yara: Husband/Wife'])
  })

  it('has no line between brothers and sisters who have a parent listed: they are joined through the parent', () => {
    expect(lines([annas]).some((l) => /^(Kid-Zoe|Zoe-Kid)/.test(l))).toBe(false)
  })

  it('joins brothers and sisters with no parent listed in a chain, since nothing else does', () => {
    const three = family('s', [row('b', 'bill', 'child', 'Bill', 'male'), row('m', 'mary', 'child', 'Mary', 'female'), row('n', null, 'child', 'Ned')])
    expect(lines([three])).toEqual(['Bill-Mary: Brother/Sister', 'Mary-Ned: Sister/Brother or sister'])
  })

  it('says the pair where nobody has said who is a man and who a woman, and never guesses', () => {
    const unsaid = family('u', [row('x', 'xavier', 'adult', 'Xavier'), row('y', 'yara', 'adult', 'Yara'), row('p', null, 'child', 'Pip')])
    expect(lines([unsaid])).toEqual(['Xavier-Yara: Husband or wife/Husband or wife (children)', 'Xavier+Yara>Pip: Child'])
  })

  it('knows a husband from a wife said of only one of them: the word says it of both (0328)', () => {
    const half = family('h', [row('x', 'xavier', 'adult', 'Xavier', 'male'), row('y', null, 'adult', 'Yara')])
    expect(lines([half])).toEqual(['Xavier-Yara: Husband/Wife'])
  })

  it('is one line for two people, whatever order the households come in', () => {
    expect(familyGraph([annas, grans]).edges).toHaveLength(5)
  })
})

describe('what is written on a line', () => {
  const edge = (over: Partial<PairEdge>): PairEdge => ({ id: 'e', a: 'a', b: 'b', kind: 'child', aWord: 'Father', bWord: 'Daughter', hub: false, ...over })

  it('is the word of whoever is at the start of it, then of whoever is at the end', () => {
    expect(edgeText(edge({}), true)).toBe('Father · Daughter')
    expect(edgeText(edge({}), false)).toBe('Daughter · Father')
  })

  it('is what the child is, on a line from a couple to their child', () => {
    expect(edgeText({ id: 'h', kind: 'hub', couple: ['a', 'b'], child: 'c', word: 'Son' })).toBe('Son')
  })

  it('says a pair nobody has said a word for once, not twice', () => {
    expect(edgeText(edge({ kind: 'spouse', aWord: 'Husband or wife', bWord: 'Husband or wife' }), true)).toBe('Husband and wife')
    expect(edgeText(edge({ kind: 'sibling', aWord: 'Brother or sister', bWord: 'Brother or sister' }), false)).toBe('Brothers or sisters')
    // One of two said is still two words.
    expect(edgeText(edge({ kind: 'sibling', aWord: 'Brother', bWord: 'Brother or sister' }), true)).toBe('Brother · Brother or sister')
    expect(edgeText(edge({ aWord: 'Parent', bWord: 'Child' }), true)).toBe('Parent · Child')
  })

  it('is a sentence for whoever cannot see the line', () => {
    const g = familyGraph([grans, annas])
    expect(g.edges.map((e) => edgeSentence(e, g))).toEqual([
      'Gran T is the mother of Anna T.',
      'Gran T is the mother of Wren T.',
      'Anna T is the wife of Tom T.',
      'Kid T is the son of Anna T and Tom T.',
      'Zoe T is the daughter of Anna T and Tom T.',
    ])
  })
})
