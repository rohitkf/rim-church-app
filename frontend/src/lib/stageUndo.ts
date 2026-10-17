import type { BlockPatch, NewStageBlock, StageBlock } from './stage'

/**
 * Undo on the stage, worked out without the screen.
 *
 * Every change on the stage is written as it is made, so undo is not a
 * draft thrown away: it is the opposite change, written the same way and
 * logged the same way. These are the pieces of it that need no network —
 * what the opposite of a change is, what a removed block was, and what to
 * call each step on the Undo button.
 */

const PATCH_KEYS = ['label', 'person_id', 'color', 'x', 'y', 'w', 'h', 'rotation', 'z', 'seats', 'area_id', 'corners', 'icon'] as const

/** The patch that puts back what `changes` is about to overwrite on `block`. */
export function inverseOf(block: StageBlock, changes: BlockPatch): BlockPatch {
  const out: Record<string, unknown> = {}
  for (const key of PATCH_KEYS) {
    if (key in changes && changes[key] !== block[key]) out[key] = block[key]
  }
  return out as BlockPatch
}

/** Whether a patch would change anything at all. */
export function isEmptyPatch(patch: BlockPatch): boolean {
  return Object.keys(patch).length === 0
}

/** A block as it stood, in the shape it can be put back in: everything but its id, its lock and its stamps. */
export function snapshotOf(block: StageBlock): NewStageBlock {
  return {
    area_id: block.area_id,
    label: block.label,
    person_id: block.person_id,
    color: block.color,
    x: block.x,
    y: block.y,
    w: block.w,
    h: block.h,
    rotation: block.rotation,
    z: block.z,
    kind: block.kind,
    seats: block.seats,
    corners: block.corners,
    icon: block.icon,
  }
}

/** What the Undo button says it will undo: "move Keyboard", "recolour Drums". */
export function describeChange(label: string, changes: BlockPatch): string {
  const has = (...keys: (keyof BlockPatch)[]) => keys.some((k) => k in changes)
  const verb = has('x', 'y', 'area_id')
    ? 'move'
    : has('w', 'h')
      ? 'resize'
      : has('rotation')
        ? 'turn'
        : has('label')
          ? 'rename'
          : has('color')
            ? 'recolour'
            : has('person_id')
              ? 'who is on'
              : has('z')
                ? 'bring to front'
                : has('corners')
                  ? 'corners on'
                  : has('icon')
                    ? 'picture on'
                    : has('seats')
                      ? 'seats on'
                      : 'change to'
  return `${verb} ${label}`
}

/** How many steps back the page keeps. */
export const UNDO_DEPTH = 25

/** An id followed through every block an undo has put back in its place. */
export function resolveId(aliases: ReadonlyMap<string, string>, id: string): string {
  let at = id
  for (let i = 0; i < 50 && aliases.has(at); i += 1) at = aliases.get(at)!
  return at
}
