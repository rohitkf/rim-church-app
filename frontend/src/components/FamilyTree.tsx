import { useLayoutEffect, useRef, useState } from 'react'
import { wordLabel, type FamilyOf, type FamilyPart } from '../lib/familyLinks'

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
 * them is what says they are one family. Each box says what that person
 * is to the one the tree is drawn from, by the word the church has said
 * ("Wife", "Son", "Mother"), or by the pair ("Husband or wife") where
 * nobody has yet.
 *
 * The boxes are laid out by the page, as rows; the lines are measured off
 * the boxes once they are on the screen and drawn behind them. So a long
 * name makes a taller box and the lines still meet it, and with nothing
 * to measure (a test, a screen reader) it is three plain lists, which is
 * what it is.
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

interface TreePerson {
  /** Unique in the tree: an account's id, or a written-in entry's. */
  key: string
  /** The account, where there is one. */
  userId: string | null
  first_name: string
  last_name: string
  /** What they are to the person the tree is drawn from, said under the name for whoever cannot see the lines. */
  word: string
}

interface Line {
  d: string
}

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

function Node({
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
      <span className="text-center font-mono text-[0.6875rem] leading-tight text-on-surface-faint">
        {person.userId ? word : `${word} · written in`}
      </span>
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
          aria-label={`${nameOf(person)}, ${word}. Show their family`}
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
  const [size, setSize] = useState({ w: 0, h: 0 })
  // What the lines depend on, as one string: who is where.
  const shape = [parents, siblings, [self], partners, children].map((t) => t.map((p) => p.key).join(',')).join('|')

  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const measure = () => {
      const base = el.getBoundingClientRect()
      if (base.width === 0) return
      const at = (key: string) => {
        const node = el.querySelector<HTMLElement>(`[data-tree-node="${CSS.escape(key)}"]`)
        if (!node) return null
        const r = node.getBoundingClientRect()
        return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, cx: r.left - base.left + r.width / 2 }
      }
      const out: Line[] = []
      const me = at(self.key)
      if (!me) return
      // A couple: a line between the two boxes, half way up.
      const join = (keys: string[]) => {
        const boxes = keys.map(at).filter((b): b is NonNullable<typeof b> => !!b)
        for (let i = 0; i + 1 < boxes.length; i += 1) {
          const y = boxes[i].y + Math.min(boxes[i].h, boxes[i + 1].h) / 2
          out.push({ d: `M ${boxes[i].x + boxes[i].w} ${y} H ${boxes[i + 1].x}` })
        }
      }
      type Box = NonNullable<ReturnType<typeof at>>
      const boxes = (people: TreePerson[]) => people.map((p) => at(p.key)).filter((b): b is Box => !!b)
      /*
       * One generation hung from the one above: a stem from `from` (where
       * there is somebody above) to a bar, and a drop from the bar to each
       * box. The boxes are taken as the screen laid them out: one row, or
       * several where they wrapped. A second row cannot be reached through
       * the first, so a rail runs down the side and a bar along each row.
       */
      const hang = (from: { x: number; y: number } | null, floor: number, below: Box[]) => {
        const rows: Box[][] = []
        for (const b of [...below].sort((a, c) => a.y - c.y || a.x - c.x)) {
          const last = rows[rows.length - 1]
          if (last && Math.abs(last[0].y - b.y) < 4) last.push(b)
          else rows.push([b])
        }
        // Clear of every box.
        const rail = Math.min(...below.map((b) => b.x)) - 9
        let firstBar = 0
        rows.forEach((row, i) => {
          const bar = floor + (row[0].y - floor) / 2
          const xs = row.map((b) => b.cx)
          if (i === 0) {
            firstBar = bar
            if (from) out.push({ d: `M ${from.x} ${from.y} V ${bar}` })
            const reach = [...(from ? [from.x] : []), ...(rows.length > 1 ? [rail] : []), ...xs]
            if (Math.max(...reach) > Math.min(...reach)) out.push({ d: `M ${Math.min(...reach)} ${bar} H ${Math.max(...reach)}` })
          } else {
            out.push({ d: `M ${rail} ${bar} H ${Math.max(...xs)}` })
            if (i === rows.length - 1) out.push({ d: `M ${rail} ${firstBar} V ${bar}` })
          }
          for (const b of row) out.push({ d: `M ${b.cx} ${bar} V ${b.y}` })
          floor = Math.max(...row.map((b) => b.y + b.h))
        })
      }

      join(parents.map((p) => p.key))
      join([self.key, ...partners.map((p) => p.key)])

      // The person and their brothers and sisters, down from the parents.
      const up = boxes(parents)
      const beside = boxes(siblings)
      const born = [...beside, me]
      if (up.length > 0) {
        const bottom = Math.max(...up.map((b) => b.y + b.h))
        // Two parents: from the line between them. One: from under them.
        const from =
          up.length === 2
            ? { x: (up[0].cx + up[1].cx) / 2, y: up[0].y + Math.min(up[0].h, up[1].h) / 2 }
            : { x: up[0].cx, y: bottom }
        hang(from, bottom, born)
        // More than two written in above (it should not happen): each still reaches the bar.
        if (up.length > 2) {
          const top = Math.min(...born.map((b) => b.y))
          const bar = bottom + (top - bottom) / 2
          for (const b of up) out.push({ d: `M ${b.cx} ${b.y + b.h} V ${bar} H ${from.x}` })
        }
      } else if (beside.length > 0) {
        // Nobody above them: a bar over the top says they are one family.
        hang(null, Math.min(...born.map((b) => b.y)) - 20, born)
      }

      // The children, down from the couple (or from the person alone).
      const down = boxes(children)
      if (down.length > 0) {
        // A partner on the same line as the person: the children come from between the two.
        const first = partners.length > 0 ? at(partners[0].key) : null
        const partner = first && Math.abs(first.y - me.y) < 4 ? first : null
        const from = partner
          ? { x: (me.x + me.w + partner.x) / 2, y: me.y + Math.min(me.h, partner.h) / 2 }
          : { x: me.cx, y: me.y + me.h }
        // Under everybody on the rows above, a tall box of a brother's included.
        const above = Math.max(...[...born, ...boxes(partners)].map((b) => b.y + b.h))
        hang(from, above, down)
      }
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

  const row = 'm-0 flex max-w-full list-none flex-wrap items-start justify-center gap-x-2 gap-y-8 p-0 sm:gap-x-5'
  const list = (label: string, people: TreePerson[], extra = '') =>
    people.length > 0 && (
      <ul aria-label={label} className={`${row} ${extra}`}>
        {people.map((p) => (
          <Node key={p.key} person={p} me={p.key === self.key} onOpen={onOpen} />
        ))}
      </ul>
    )

  return (
    <figure aria-label={`Family tree of ${nameOf(person)}`} className="m-0">
      <div className="overflow-x-auto rounded-[var(--radius-card)] bg-raised px-4 py-5 hairline">
        <div ref={frame} className="relative mx-auto flex w-full flex-col items-center gap-9">
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
          {list(`${first}’s parents`, parents)}
          {/* One generation, two lists: the couple stay side by side when the row is too wide and wraps. */}
          <div className="flex max-w-full flex-wrap items-start justify-center gap-x-2 gap-y-8 sm:gap-x-5">
            {list(`${first}’s brothers and sisters`, siblings)}
            {list(`${first} and their husband or wife`, [self, ...partners], 'flex-nowrap')}
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
