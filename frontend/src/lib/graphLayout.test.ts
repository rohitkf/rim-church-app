import { describe, expect, it } from 'vitest'
import { edgeLetters, familyGraph, type Graph } from './familyGraph'
import { CIRCLE, LETTER, layoutGraph, type Layout, type Point } from './graphLayout'
import type { Family, FamilyMember } from './families'

/*
 * Where the nodes of a family graph go: worked out from the top down, the
 * same way every time, with nobody on top of anybody and no line from
 * parents to children crossing another.
 */

const row = (id: string, account: string | null, kind: 'adult' | 'child', first: string): FamilyMember => ({
  id,
  user_id: account,
  kind,
  first_name: first,
  last_name: 'T',
})
const family = (id: string, members: FamilyMember[]): Family => ({ id, members })
const couple = (id: string, kids: number) =>
  family(id, [row(`${id}a`, `${id}-a`, 'adult', 'A'), row(`${id}b`, `${id}-b`, 'adult', 'B'), ...Array.from({ length: kids }, (_, i) => row(`${id}k${i}`, null, 'child', `K${i}`))])

const big = () => {
  // Three generations: a grandparent, their child with a husband and seven children, and one of those with a wife and a baby.
  const top = family('g', [row('g1', 'gran', 'adult', 'Gran'), row('a1', 'g2-a', 'child', 'A')])
  const mid = couple('g2', 7)
  mid.members[2] = row('g2k0', 'son', 'child', 'Son')
  const low = family('g3', [row('s2', 'son', 'adult', 'Son'), row('w', null, 'adult', 'Wife'), row('b', null, 'child', 'Baby')])
  return familyGraph([top, mid, low])
}

const nearest = (points: { x: number; y: number }[]) => {
  let least = Infinity
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) least = Math.min(least, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y))
  }
  return least
}

/** Every line as the two points it runs between. */
const segments = (graph: Graph, layout: Layout): [Point, Point][] =>
  graph.edges.map((e) => {
    if (e.kind !== 'hub') return [layout.at.get(e.a)!, layout.at.get(e.b)!]
    const [a, b] = [layout.at.get(e.couple[0])!, layout.at.get(e.couple[1])!]
    return [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, layout.at.get(e.child)!]
  })

/** Whether two lines cross somewhere that is not an end they share. */
function cross([p, q]: [Point, Point], [r, s]: [Point, Point]): boolean {
  const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5
  if (same(p, r) || same(p, s) || same(q, r) || same(q, s)) return false
  const side = (a: Point, b: Point, c: Point) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
  // Each line's ends on opposite sides of the other. One that only starts on another, as a
  // child's does on the middle of their parents', is a join and not a crossing.
  return side(p, q, r) * side(p, q, s) < 0 && side(r, s, p) * side(r, s, q) < 0
}

describe('where everybody goes', () => {
  it('places every node, inside the picture', () => {
    const graph = big()
    const layout = layoutGraph(graph)
    expect(layout.at.size).toBe(graph.nodes.length)
    for (const p of layout.at.values()) {
      expect(p.x).toBeGreaterThanOrEqual(28)
      expect(p.y).toBeGreaterThanOrEqual(28)
      expect(p.x).toBeLessThanOrEqual(layout.width - 28)
      expect(p.y).toBeLessThanOrEqual(layout.height - 28)
    }
  })

  it('puts nobody on top of anybody: room for a circle and the name under it', () => {
    expect(nearest([...layoutGraph(big()).at.values()])).toBeGreaterThanOrEqual(118)
    expect(nearest([...layoutGraph(familyGraph([couple('c', 9)])).at.values()])).toBeGreaterThanOrEqual(118)
  })

  it('is the same picture every time', () => {
    const [one, two] = [layoutGraph(big()), layoutGraph(big())]
    expect([...one.at]).toEqual([...two.at])
    expect([one.width, one.height]).toEqual([two.width, two.height])
  })

  it('stands each generation on its own level, parents above their children', () => {
    const graph = big()
    const layout = layoutGraph(graph)
    const y = (first: string) => layout.at.get(graph.nodes.find((n) => n.first_name === first)!.id)!.y
    expect(y('Gran')).toBeLessThan(y('A'))
    expect(y('A')).toBe(y('B'))
    expect(y('A')).toBeLessThan(y('Son'))
    expect(y('Son')).toBe(y('Wife'))
    expect(y('Son')).toBeLessThan(y('Baby'))
  })

  it('crosses no line with another, in a family of three generations and seven children', () => {
    const graph = big()
    const lines = segments(graph, layoutGraph(graph))
    const crossings = lines.flatMap((one, i) => lines.slice(i + 1).filter((two) => cross(one, two)))
    expect(crossings).toEqual([])
  })

  it('leaves a line between two people long enough for its words between the two circles', () => {
    const siblings = family('s', [row('b', 'bill', 'child', 'Bill'), row('m', 'mary', 'child', 'Mary'), row('n', null, 'child', 'Ned')])
    for (const graph of [big(), familyGraph([couple('c', 3)]), familyGraph([siblings])]) {
      const layout = layoutGraph(graph)
      for (const e of graph.edges) {
        if (e.kind === 'hub') continue
        const [a, b] = [layout.at.get(e.a)!, layout.at.get(e.b)!]
        expect(Math.hypot(a.x - b.x, a.y - b.y) - CIRCLE, e.id).toBeGreaterThanOrEqual(edgeLetters(e) * LETTER + 12)
      }
    }
  })

  it('spreads a couple’s children under the middle of the two', () => {
    const graph = familyGraph([couple('c', 3)])
    const layout = layoutGraph(graph)
    const x = (id: string) => layout.at.get(graph.nodes.find((n) => n.id.endsWith(id))!.id)!.x
    expect((x('c-a') + x('c-b')) / 2).toBeCloseTo(x('ck1'), 0)
    expect(x('ck0')).toBeLessThan(x('ck1'))
    expect(x('ck1')).toBeLessThan(x('ck2'))
  })

  it('places a couple whose parents on both sides are in the family once, joined to both', () => {
    // His parents, her parents, and the two of them with a child.
    const his = family('his', [row('hf', 'hisdad', 'adult', 'HisDad'), row('hm', 'hismum', 'adult', 'HisMum'), row('h1', 'he', 'child', 'He')])
    const hers = family('hers', [row('sf', 'herdad', 'adult', 'HerDad'), row('s1', 'she', 'child', 'She')])
    const theirs = family('theirs', [row('h2', 'he', 'adult', 'He'), row('s2', 'she', 'adult', 'She'), row('k', null, 'child', 'Kid')])
    const graph = familyGraph([his, hers, theirs])
    const layout = layoutGraph(graph)
    expect(layout.at.size).toBe(6)
    expect(nearest([...layout.at.values()])).toBeGreaterThanOrEqual(118)
    // One picture: his parents and hers on the same level, the two of them under, their child under them.
    const y = (first: string) => layout.at.get(graph.nodes.find((n) => n.first_name === first)!.id)!.y
    expect(y('HisDad')).toBe(y('HerDad'))
    expect(y('He')).toBe(y('She'))
    expect(y('HerDad')).toBeLessThan(y('She'))
    expect(y('She')).toBeLessThan(y('Kid'))
  })

  it('sets families side by side without one running into the next', () => {
    const graph = familyGraph([couple('one', 2), couple('two', 2)])
    const layout = layoutGraph(graph)
    const xs = (id: string) => graph.nodes.filter((n) => n.id.includes(id)).map((n) => layout.at.get(n.id)!.x)
    expect(Math.max(...xs('one'))).toBeLessThan(Math.min(...xs('two')))
    expect(nearest([...layout.at.values()])).toBeGreaterThanOrEqual(118)
  })

  it('puts everybody linked to nobody after the families, in rows, apart', () => {
    const alone = Array.from({ length: 30 }, (_, i) => ({ id: `lone${i}`, first_name: `L${i}`, last_name: '' }))
    const graph = familyGraph([couple('c', 2)], alone)
    const layout = layoutGraph(graph)
    const family = graph.nodes.filter((n) => !n.id.includes('lone')).map((n) => layout.at.get(n.id)!.y)
    const lone = graph.nodes.filter((n) => n.id.includes('lone')).map((n) => layout.at.get(n.id)!)
    expect(Math.min(...lone.map((p) => p.y))).toBeGreaterThan(Math.max(...family))
    expect(nearest(lone)).toBeGreaterThanOrEqual(110)
    expect(new Set(lone.map((p) => p.y)).size).toBeGreaterThan(1)
  })

  it('draws nobody but people linked to nobody as a block of them', () => {
    const graph = familyGraph([], [{ id: 'a', first_name: 'A', last_name: '' }, { id: 'b', first_name: 'B', last_name: '' }])
    const layout = layoutGraph(graph)
    expect(layout.at.size).toBe(2)
    expect(layout.width).toBeGreaterThanOrEqual(260)
  })

  it('makes a picture of nothing with nothing in it', () => {
    expect(layoutGraph({ nodes: [], edges: [], units: [] }).at.size).toBe(0)
  })
})
