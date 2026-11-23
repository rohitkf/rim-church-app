import { wordLabel, type FamilyPart, type Gender } from './familyLinks'
import { generationsOf, type Family, type FamilyMember, type PersonName } from './families'

/*
 * Families as a graph (the Owner, November 2026: "the relationship org
 * chart is bit weird. I was thinking to be like a graph kinda one like
 * neo4j where relationships between nodes are all connected and named and
 * labelled properly").
 *
 * The trees drew a family the way an org chart is drawn: a bar under the
 * parents, a drop to each child, boxes in rows. Here every person is a
 * round node and every relationship is a straight line with what the
 * people on it are to each other written along it: "Husband · Wife",
 * "Father · Daughter", "Son".
 *
 * This file is who is joined to whom and by what words. It is made from
 * `families()` (households, with what a word has said of each person,
 * 0329), so it knows nothing a holder of `people.family` does not already
 * read. Where the nodes go is lib/graphLayout; drawing is
 * components/FamilyGraph.
 *
 * What is a line:
 *   - the two adults of a household: husband and wife;
 *   - a child of a couple: ONE line, from the middle of their parents'
 *     line, saying what the child is ("Son"). The first cut drew a line
 *     to each parent, as a graph database would, and a couple with seven
 *     children was fourteen lines crossing each other with their words
 *     written over one another. Whose child they are is said by where the
 *     line starts; who is the father and who the mother, by the line it
 *     starts from;
 *   - a child of one parent alone: a line between the two, with both
 *     words ("Father · Daughter"), since no other line says the parent's;
 *   - the children of a household with no adults in it: brothers and
 *     sisters with no parent listed (0328), joined in a chain, since
 *     nothing else joins them.
 * Brothers and sisters with a parent listed have no line of their own:
 * they are joined through the parent.
 */

export interface GraphNode {
  /** One per person: an account once, however many households they are in. */
  id: string
  /** Their account, or null for somebody written in by hand. */
  userId: string | null
  first_name: string
  last_name: string
  /** How many generations down the family they are: which level they stand on. */
  generation: number
}

/** A line between two people, with what each is to the other. For a parent and child, `a` is the parent. */
export interface PairEdge {
  id: string
  a: string
  b: string
  kind: FamilyPart
  /** What `a` is to `b`, and what `b` is to `a`: "Father", "Daughter". */
  aWord: string
  bWord: string
  /** A couple with children: their lines start from the middle of this one. */
  hub: boolean
}

/** A child of a couple: a line from the middle of the couple's own line to the child. */
export interface HubEdge {
  id: string
  /** The two parents, as on their own line. */
  couple: [string, string]
  child: string
  kind: 'hub'
  /** What the child is to the two of them: "Son". */
  word: string
}

export type GraphEdge = PairEdge | HubEdge

/** One household, as the layout places it: its adults side by side, its children under them. */
export interface GraphUnit {
  adults: string[]
  children: string[]
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** The households, oldest generation first: who stands beside whom and under whom. */
  units: GraphUnit[]
}

/** The node somebody is: by their account, or by their written-in row. */
export const nodeId = (m: { id: string; user_id: string | null }) => (m.user_id ? `u:${m.user_id}` : `w:${m.id}`)
/** The node of an account. */
export const accountNode = (userId: string) => `u:${userId}`

const other = (g: Gender | null | undefined): Gender | null => (g === 'male' ? 'female' : g === 'female' ? 'male' : null)

/**
 * Households, and anybody linked to nobody, as one graph. `alone` are
 * accounts in no household given: nodes with no lines.
 */
export function familyGraph(households: readonly Family[], alone: readonly PersonName[] = []): Graph {
  const { depth, homeOf } = generationsOf(households)
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()
  const units: (GraphUnit & { depth: number; order: number })[] = []

  const see = (m: FamilyMember, at: number) => {
    const id = nodeId(m)
    // Somebody with a household of their own stands in its generation, beside their husband or wife.
    const own = m.user_id ? homeOf.get(m.user_id) : undefined
    const generation = m.kind === 'adult' ? at : own !== undefined ? depth[own] : at + 1
    const had = nodes.get(id)
    if (!had) nodes.set(id, { id, userId: m.user_id, first_name: m.first_name, last_name: m.last_name, generation })
    else if (m.kind === 'adult') had.generation = generation
    return id
  }
  const pair = (a: FamilyMember, b: FamilyMember, kind: FamilyPart, aWord: string, bWord: string, hub = false) => {
    const [ia, ib] = [nodeId(a), nodeId(b)]
    if (ia === ib) return
    // One line for two people, whichever household says it first.
    const key = [ia, ib].sort().join('|')
    if (!edges.has(key)) edges.set(key, { id: key, a: ia, b: ib, kind, aWord, bWord, hub })
  }

  households.forEach((h, i) => {
    for (const m of h.members) see(m, depth[i])
    const adults = h.members.filter((m) => m.kind === 'adult')
    const children = h.members.filter((m) => m.kind === 'child')
    units.push({ adults: adults.map(nodeId), children: children.map(nodeId), depth: depth[i], order: i })

    if (adults.length >= 2) {
      const [a, b] = adults
      // Husband and wife say it of both (0328): one said is the other known.
      const ga = a.gender ?? other(b.gender)
      const gb = b.gender ?? other(a.gender)
      pair(a, b, 'spouse', wordLabel('spouse', ga), wordLabel('spouse', gb), children.length > 0)
      for (const child of children) {
        const id = `${nodeId(a)}+${nodeId(b)}>${nodeId(child)}`
        edges.set(id, { id, couple: [nodeId(a), nodeId(b)], child: nodeId(child), kind: 'hub', word: wordLabel('child', child.gender) })
      }
    } else if (adults.length === 1) {
      for (const child of children) pair(adults[0], child, 'child', wordLabel('parent', adults[0].gender), wordLabel('child', child.gender))
    } else {
      for (let n = 1; n < children.length; n += 1) {
        const [a, b] = [children[n - 1], children[n]]
        pair(a, b, 'sibling', wordLabel('sibling', a.gender), wordLabel('sibling', b.gender))
      }
    }
  })

  for (const p of alone) {
    const id = accountNode(p.id)
    if (!nodes.has(id)) nodes.set(id, { id, userId: p.id, first_name: p.first_name, last_name: p.last_name, generation: 0 })
  }
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    // The oldest generation first, so a household is met before the ones under it.
    units: units.sort((a, b) => a.depth - b.depth || a.order - b.order).map(({ adults, children }) => ({ adults, children })),
  }
}

/** What nobody has said, for two people at once: the pair said once, not twice. */
const UNSAID: Partial<Record<FamilyPart, { one: string; both: string }>> = {
  spouse: { one: 'Husband or wife', both: 'Husband and wife' },
  sibling: { one: 'Brother or sister', both: 'Brothers or sisters' },
}

/**
 * What is written on a line. Between two people: the word of whoever is
 * at the start of it, then the word of whoever is at the end. `aFirst` is
 * whether `a` is at the start as the line is drawn, so each word is on
 * its own person's side: "Father · Daughter" with the father on the
 * left, "Daughter · Father" with him on the right. On a child's line from
 * a couple: what the child is.
 */
export function edgeText(edge: GraphEdge, aFirst = true): string {
  if (edge.kind === 'hub') return edge.word
  const unsaid = UNSAID[edge.kind]
  if (unsaid && edge.aWord === unsaid.one && edge.bWord === unsaid.one) return unsaid.both
  return aFirst ? `${edge.aWord} · ${edge.bWord}` : `${edge.bWord} · ${edge.aWord}`
}

/** The longest a line's words can be, whichever way round they are written. */
export const edgeLetters = (edge: GraphEdge): number => edgeText(edge).length

const fullName = (n: GraphNode | undefined) => (n ? `${n.first_name} ${n.last_name}`.trim() || 'Somebody with no name' : 'somebody')

/** A line as a sentence, for whoever cannot see it: "Dan Jacob is the father of Anna Thomas." */
export function edgeSentence(edge: GraphEdge, graph: Graph): string {
  const who = (id: string) => fullName(graph.nodes.find((n) => n.id === id))
  if (edge.kind === 'hub') return `${who(edge.child)} is the ${edge.word.toLowerCase()} of ${who(edge.couple[0])} and ${who(edge.couple[1])}.`
  return `${who(edge.a)} is the ${edge.aWord.toLowerCase()} of ${who(edge.b)}.`
}
