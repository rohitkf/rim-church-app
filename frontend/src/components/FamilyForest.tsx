import { useLayoutEffect, useRef, useState } from 'react'
import { TreeNode, type TreePerson } from './FamilyTree'
import { familyForest, type FamilyGroup, type FamilyMember, type TreeUnit } from '../lib/families'
import { boxOf, hangLines, joinLines, stemFrom, type Box } from '../lib/treeLines'

/**
 * One whole family drawn as a tree, for the page that shows everybody
 * (the Owner, November 2026: "a sort of VIEW ALL button which shows
 * everyone in the church, with related people linked").
 *
 * `FamilyTree` draws one person's family from where they stand: parents,
 * brothers and sisters, husband or wife, children. This draws a family
 * from the top down, for as many generations as it has: each household is
 * its adults side by side with their children under them, and a child
 * with a household of their own is drawn as that household, beside their
 * husband or wife, with their own children under them.
 *
 * It is made from `families()`, which hands over names and nothing else
 * (0326), so a box says who somebody is and not what they are to anybody:
 * the lines say that. The boxes are nested lists, which is what a screen
 * reader is given; the lines are measured off the boxes and drawn behind
 * them (lib/treeLines), as in `FamilyTree`.
 *
 * Children with no household of their own wrap: to the width of the box
 * in a family of parents and children, and three or four to a row beside
 * their married brothers and sisters, whose households stand to the right
 * of them and cannot wrap (a line down the side of a wrapped row would
 * run through the grandchildren). A family still too wide scrolls inside
 * its own box, starting on the top of the tree, and the page does not.
 */

const person = (m: FamilyMember): TreePerson => ({
  // The row, not the account: somebody can be in the tree twice (see `familyForest`).
  key: m.id,
  userId: m.user_id,
  first_name: m.first_name,
  last_name: m.last_name,
  word: '',
})

const first = (m: FamilyMember) => m.first_name || 'somebody'
const and = (members: FamilyMember[]) => members.map(first).join(' and ')

/** The box a line from the parents comes down onto: the child's own, where they are drawn in their own household. */
function anchorKey(child: TreeUnit['children'][number]): string {
  const own = child.unit?.adults.find((a) => a.user_id && a.user_id === child.member.user_id)
  return (own ?? child.member).id
}

/** Every household in a tree, the top one first. */
function unitsOf(unit: TreeUnit): TreeUnit[] {
  return [unit, ...unit.children.flatMap((c) => (c.unit ? unitsOf(c.unit) : []))]
}

/** A row of children with no household of their own, beside ones that have: three across on a phone, four on a wider screen. */
const CAPPED = 'max-w-[19.25rem] shrink-0 flex-wrap pl-3 sm:max-w-[36.75rem]'

function Unit({ unit, deep, onOpen }: { unit: TreeUnit; /** In a family with a household under a household. */ deep: boolean; onOpen?: (userId: string) => void }) {
  const leaves = unit.children.filter((c) => !c.unit)
  const homes = unit.children.filter((c) => c.unit)
  const whose = unit.adults.length > 0 ? `Children of ${and(unit.adults)}` : 'Brothers and sisters'
  const row = 'm-0 flex list-none items-start justify-center gap-x-2 gap-y-8 p-0 sm:gap-x-5'
  return (
    <div className="flex flex-col items-center gap-9">
      {unit.adults.length > 0 && (
        <ul aria-label={and(unit.adults)} className={row}>
          {unit.adults.map((m) => (
            <TreeNode key={m.id} person={person(m)} me={false} onOpen={onOpen} />
          ))}
        </ul>
      )}
      {unit.children.length > 0 && (
        // One generation, two lists: the ones with no household of their own, which wrap, and to
        // their right the ones drawn as their own household, which cannot.
        <div className="flex max-w-full items-start justify-center gap-x-2 sm:gap-x-5">
          {leaves.length > 0 && (
            <ul aria-label={whose} className={`${row} ${deep ? CAPPED : 'max-w-full flex-wrap'}`}>
              {leaves.map((c) => (
                <TreeNode key={c.member.id} person={person(c.member)} me={false} onOpen={onOpen} />
              ))}
            </ul>
          )}
          {homes.length > 0 && (
            <ul aria-label={`${whose}, with their own families`} className={row}>
              {homes.map((c) => (
                <li key={c.member.id} className="shrink-0">
                  <Unit unit={c.unit!} deep={deep} onOpen={onOpen} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function FamilyForest({
  family,
  title,
  onOpen,
}: {
  family: FamilyGroup
  /** What the family is called, for whoever cannot see the picture. */
  title: string
  /** Somebody with an account was pressed: go to their own family. */
  onOpen?: (userId: string) => void
}) {
  const trees = familyForest(family)
  // A household under a household: the tree is as wide as it is, and scrolls in its box.
  const deep = trees.some((t) => t.children.some((c) => c.unit))
  const frame = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<string[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  // Wider than its box: said in words, since a bar to drag is not always shown on a phone.
  const [scrolls, setScrolls] = useState(false)
  const centred = useRef(false)
  // What the lines depend on, as one string: which rows are where.
  const shape = family.households.map((h) => h.members.map((m) => m.id).join(',')).join('|')

  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const measure = () => {
      const base = el.getBoundingClientRect()
      if (base.width === 0) return
      const at = (key: string) => boxOf(el, base, key)
      const out: string[] = []
      for (const unit of familyForest(family).flatMap(unitsOf)) {
        const adults = unit.adults.map((m) => at(m.id)).filter((b): b is Box => !!b)
        const children = unit.children.map((c) => at(anchorKey(c))).filter((b): b is Box => !!b)
        out.push(...joinLines(adults))
        if (children.length === 0) continue
        if (adults.length > 0) {
          out.push(...hangLines(stemFrom(adults), Math.max(...adults.map((b) => b.y + b.h)), children))
        } else if (children.length > 1) {
          // Nobody above them: a bar over the top says they are one family.
          out.push(...hangLines(null, Math.min(...children.map((b) => b.y)) - 20, children))
        }
      }
      setLines(out)
      // As wide as what is in it, which can be wider than the box it scrolls in.
      setSize({ w: el.scrollWidth, h: el.scrollHeight })
      const box = el.parentElement
      if (box) {
        const wide = box.scrollWidth > box.clientWidth + 1
        setScrolls(wide)
        // It opens on the top of the tree, which is in the middle of it, and not on
        // an empty corner. Once: after that it is wherever whoever is reading left it.
        if (wide && !centred.current) {
          box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2
          centred.current = true
        }
      }
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
    // `shape` stands for the family: the lines move only when who is in it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape])

  return (
    <figure aria-label={`Family tree of ${title}`} className="m-0">
      {scrolls && <figcaption className="px-4 pt-1 text-label-sm text-on-surface-faint sm:px-5">Wider than the screen: slide it sideways to see the rest.</figcaption>}
      <div className="overflow-x-auto overscroll-x-contain px-4 pb-5 pt-6">
        {/* Parents and their children alone fit the box, wrapping the children. Deeper than that it is as
            wide as the tree, and never narrower than the box: a small family sits in the middle. */}
        <div
          ref={frame}
          className={`relative mx-auto flex items-start justify-center gap-x-8 gap-y-9 ${deep ? 'w-max min-w-full' : 'w-full flex-wrap'}`}
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
            {lines.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </svg>
          {trees.map((tree) => (
            <Unit key={tree.household.id} unit={tree} deep={deep} onOpen={onOpen} />
          ))}
        </div>
      </div>
    </figure>
  )
}
