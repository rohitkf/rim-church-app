import { useLayoutEffect, useRef, useState } from 'react'
import { wordLabel, type FamilyOf, type FamilyPart } from '../lib/familyLinks'
import { boxOf, hang as hangFrom, joinLines, type Box } from '../lib/treeLines'

/**
 * One family, drawn as a tree (the Owner's ask, November 2026: "node
 * based (like org chart) view of that family").
 *
 * Three rows, the way a family reads: the person's parents above, the
 * person beside their husband or wife, their children below. It is drawn
 * from `family_of()`, which reads somebody's own household and their
 * parents' together, so it is the same family the list under it changes.
 *
 * Brothers and sisters (0328) stand on the person's own row, to their
 * left, hanging from the same parents; with no parents listed a bar over
 * them is what says they are one family.
 *
 * What each person is to the one the tree is drawn from is written on
 * the line that reaches them, not in their box (the Owner, November 2026:
 * "Can we have the relationship mentioned in the edge instead of inside
 * the node ?"): "Wife" on the line between the two, "Son" on the line
 * down to him, "Mother" on the line down from her. It is the word the
 * church has said, or the pair ("Husband or wife") where nobody has yet.
 * A box holds who somebody is: their name, and that they are written in.
 * The word is still in the box for whoever cannot see a line, where a
 * screen reader finds it beside the name.
 *
 * The boxes are laid out by the page, as rows; the lines are measured off
 * the boxes once they are on the screen and drawn behind them. So a long
 * name makes a taller box and the lines still meet it, and with nothing
 * to measure (a test, a screen reader) it is plain lists with each word
 * beside its name, which is what it is.
 *
 * A row that is too wide for the screen wraps, so the whole family is in
 * sight on a phone without scrolling sideways: the first cut scrolled, and
 * with seven children the person and their parents were off the edge. A
 * line to a second row of children cannot run through the first, so it
 * runs down a rail at the side and along a bar over each row.
 *
 * Somebody with an account is a button: pressing it draws the tree again
 * from them, which is how a grandparent or a grandchild is reached.
 * Somebody written in by hand has no family of their own to open.
 */

export interface TreePerson {
  /** Unique in the tree: an account's id, or a written-in entry's. */
  key: string
  /** The account, where there is one. */
  userId: string | null
  first_name: string
  last_name: string
  /**
   * What they are to the person the tree is drawn from, said under the
   * name for whoever cannot see the lines. Empty where the tree is drawn
   * from nobody (the whole church, components/FamilyForest).
   */
  word: string
}

interface Line {
  d: string
}

/** A word written on a line: where its middle is, and how wide it may be before it wraps. */
interface EdgeWord {
  key: string
  text: string
  x: number
  y: number
  max: number
}

/** How far under a parent their line runs before it meets the other parent's: room for the word on it. */
const STUB = 22
/** How far over brothers and sisters with nobody above them their bar is: room for the words under it. */
const LONE_BAR = 24

const initials = (p: { first_name: string; last_name: string }) =>
  `${p.first_name.trim().charAt(0)}${p.last_name.trim().charAt(0)}`.toUpperCase() || '?'

const nameOf = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`.trim() || 'No name'

function tier(part: FamilyPart, linked: FamilyOf['spouse'], written: FamilyOf['written_people']['spouse']): TreePerson[] {
  return [
    ...linked.map((p) => ({ key: p.id, userId: p.id, first_name: p.first_name, last_name: p.last_name, word: wordLabel(part, p.gender) })),
    ...written.map((p) => ({
      key: `w-${p.id}`,
      userId: null,
      first_name: p.first_name,
      last_name: p.last_name,
      word: wordLabel(part, p.gender),
    })),
  ]
}

export function TreeNode({
  person,
  me,
  onOpen,
}: {
  person: TreePerson
  /** The one the tree is drawn from. */
  me: boolean
  onOpen?: (userId: string) => void
}) {
  const { word } = person
  const inner = (
    <>
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-label-md ${
          me ? 'bg-primary text-on-primary' : 'bg-raised-strong text-on-surface-variant'
        }`}
      >
        {initials(person)}
      </span>
      <span className="w-full text-center text-label-md font-medium leading-tight text-on-surface [overflow-wrap:anywhere]">
        {nameOf(person)}
      </span>
      {/* What they are to the person the tree is drawn from is written on the line (see FamilyTree).
          It stays here for a screen reader, which has no line to read it from. */}
      {word && <span className="sr-only">{word}</span>}
      {/* Said in words, not by a colour: who has no account. */}
      {!person.userId && <span className="text-center font-mono text-[0.6875rem] leading-tight text-on-surface-faint">Written in</span>}
    </>
  )
  const box = `flex w-[5.75rem] flex-col items-center gap-1 rounded-[var(--radius-row)] bg-surface-lowest px-1.5 py-2 hairline sm:w-32 ${
    me ? 'ring-2 ring-primary' : ''
  }`
  return (
    <li data-tree-node={person.key} className="relative z-[1] shrink-0">
      {person.userId && !me && onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(person.userId!)}
          aria-label={`${nameOf(person)}${word ? `, ${word}` : ''}. Show their family`}
          className={`tap ${box} transition-shadow duration-200 hover:ring-1 hover:ring-secondary`}
        >
          {inner}
        </button>
      ) : (
        <div aria-current={me ? 'true' : undefined} className={box}>
          {inner}
        </div>
      )}
    </li>
  )
}

export function FamilyTree({
  person,
  family,
  onOpen,
}: {
  person: { id: string; first_name: string; last_name: string }
  family: FamilyOf
  /** Somebody else in the tree was pressed: draw it from them. */
  onOpen?: (userId: string) => void
}) {
  const parents = tier('parent', family.parents, family.written_people.parents)
  const partners = tier('spouse', family.spouse, family.written_people.spouse)
  const children = tier('child', family.children, family.written_people.children)
  const siblings = tier('sibling', family.siblings, family.written_people.siblings)
  const self: TreePerson = {
    key: person.id,
    userId: person.id,
    first_name: person.first_name,
    last_name: person.last_name,
    word: 'This person',
  }
  const first = person.first_name || 'them'
  const alone = parents.length + partners.length + children.length + siblings.length === 0

  const frame = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [words, setWords] = useState<EdgeWord[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  // What the lines depend on, as one string: who is where, and what each is called.
  // The word too: it is written where the lines are worked out, and changes without anybody moving.
  const shape = [parents, siblings, [self], partners, children].map((t) => t.map((p) => `${p.key}:${p.word}`).join(',')).join('|')

  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const measure = () => {
      const base = el.getBoundingClientRect()
      if (base.width === 0) return
      const at = (key: string) => boxOf(el, base, key)
      const out: Line[] = []
      const me = at(self.key)
      if (!me) return
      const boxes = (people: TreePerson[]) => people.map((p) => at(p.key)).filter((b): b is Box => !!b)
      const draw = (paths: string[]) => out.push(...paths.map((d) => ({ d })))
      // What each person is, written on the line that reaches them.
      const said: EdgeWord[] = []
      const write = (p: TreePerson, x: number, y: number, max: number) => {
        if (p.word && p.key !== self.key) said.push({ key: p.key, text: p.word, x, y, max })
      }
      // One generation hung from the one above (lib/treeLines), each word half way down its own drop.
      const hang = (from: { x: number; y: number } | null, floor: number, people: TreePerson[]) => {
        const placed = people.map((p) => ({ p, box: at(p.key) })).filter((x): x is { p: TreePerson; box: Box } => !!x.box)
        const { lines: paths, drops } = hangFrom(from, floor, placed.map((x) => x.box))
        draw(paths)
        for (const drop of drops) {
          const who = placed.find((x) => x.box === drop.box)
          if (who) write(who.p, drop.box.cx, (drop.from + drop.box.y) / 2, drop.box.w)
        }
      }

      // The person and their husband or wife: a line between the two, with the word on it.
      const couple = [self, ...partners]
      draw(joinLines(boxes(couple)))
      for (let i = 1; i < couple.length; i += 1) {
        const left = at(couple[i - 1].key)
        const right = at(couple[i].key)
        if (left && right && Math.abs(left.y - right.y) < 4) {
          write(couple[i], (left.x + left.w + right.x) / 2, left.y + Math.min(left.h, right.h) / 2, right.x - (left.x + left.w) - 6)
        }
      }

      // The person and their brothers and sisters, down from the parents.
      const up = boxes(parents)
      const born = [...siblings, self]
      if (up.length > 0) {
        const bottom = Math.max(...up.map((b) => b.y + b.h))
        // Each parent has a line of their own down to a bar that joins them, with what they are on it.
        const rail = bottom + STUB
        for (const p of parents) {
          const b = at(p.key)
          if (!b) continue
          out.push({ d: `M ${b.cx} ${b.y + b.h} V ${rail}` })
          write(p, b.cx, b.y + b.h + STUB / 2, b.w)
        }
        const xs = up.map((b) => b.cx)
        if (up.length > 1) out.push({ d: `M ${Math.min(...xs)} ${rail} H ${Math.max(...xs)}` })
        hang({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: rail }, bottom, born)
      } else if (siblings.length > 0) {
        // Nobody above them: a bar over the top says they are one family.
        hang(null, Math.min(...boxes(born).map((b) => b.y)) - LONE_BAR * 2, born)
      }

      // The children, down from the couple (or from the person alone).
      if (boxes(children).length > 0) {
        // A partner on the same line as the person: the children come from between the two.
        const first = partners.length > 0 ? at(partners[0].key) : null
        const partner = first && Math.abs(first.y - me.y) < 4 ? first : null
        const from = partner
          ? { x: (me.x + me.w + partner.x) / 2, y: me.y + Math.min(me.h, partner.h) / 2 }
          : { x: me.cx, y: me.y + me.h }
        // Under everybody on the rows above, a tall box of a brother's included.
        const above = Math.max(...[...boxes(born), ...boxes(partners)].map((b) => b.y + b.h))
        hang(from, above, children)
      }
      setWords(said)
      setLines(out)
      setSize({ w: base.width, h: base.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
    // `shape` stands for the four lists: the lines move only when who is in the tree does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape])

  // Rows are far enough apart for a word on the line between them.
  const row = 'm-0 flex max-w-full list-none flex-wrap items-start justify-center gap-x-2 gap-y-14 p-0 sm:gap-x-5'
  // The two of a couple stand apart, for the word on the line between them, and never wrap.
  const pair = 'm-0 flex max-w-full list-none flex-nowrap items-start justify-center gap-x-[4.75rem] p-0'
  const list = (label: string, people: TreePerson[], classes = row) =>
    people.length > 0 && (
      <ul aria-label={label} className={classes}>
        {people.map((p) => (
          <TreeNode key={p.key} person={p} me={p.key === self.key} onOpen={onOpen} />
        ))}
      </ul>
    )

  return (
    <figure aria-label={`Family tree of ${nameOf(person)}`} className="m-0">
      <div className="overflow-x-auto rounded-[var(--radius-card)] bg-raised px-4 py-5 hairline">
        <div
          ref={frame}
          // Brothers and sisters with nobody above them have their bar over the top: it needs the room.
          className={`relative mx-auto flex w-full flex-col items-center gap-14 ${parents.length === 0 && siblings.length > 0 ? 'pt-12' : ''}`}
        >
          <svg
            aria-hidden="true"
            width={size.w}
            height={size.h}
            className="pointer-events-none absolute left-0 top-0 overflow-visible text-on-surface-faint"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {lines.map((line, i) => (
              <path key={i} d={line.d} />
            ))}
          </svg>
          {/* The words, on the lines. Each is on the tree's own colour, so the line stops at it: the tree is
              a faint wash over the page, which a word has to lay over the page's colour itself or the line
              would show through the letters. `w-max`: as wide as its words up to its limit, and not squeezed
              by how near the edge of the tree it is. */}
          {words.map((w) => (
            <span
              key={w.key}
              aria-hidden="true"
              data-edge-word={w.key}
              style={{ left: w.x, top: w.y, maxWidth: Math.max(w.max, 40) }}
              className="pointer-events-none absolute z-[1] w-max -translate-x-1/2 -translate-y-1/2 rounded-full px-1.5 py-px text-center font-mono text-[0.6875rem] leading-[1.1] text-on-surface-variant [background:linear-gradient(var(--color-raised),var(--color-raised)),var(--color-background)]"
            >
              {w.text}
            </span>
          ))}
          {list(`${first}’s parents`, parents)}
          {/* One generation, two lists: the couple stay side by side when the row is too wide and wraps. */}
          <div className="flex max-w-full flex-wrap items-start justify-center gap-x-2 gap-y-14 sm:gap-x-5">
            {list(`${first}’s brothers and sisters`, siblings)}
            {list(`${first} and their husband or wife`, [self, ...partners], pair)}
          </div>
          {list(`${first}’s children`, children)}
        </div>
      </div>
      {alone && (
        <figcaption className="mt-2 text-body-sm text-on-surface-variant">
          Nobody is linked to {first} yet. Add their husband or wife, a child, a parent, or a brother or sister below.
        </figcaption>
      )}
    </figure>
  )
}
