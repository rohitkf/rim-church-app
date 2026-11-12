/*
 * Column headings that stay in sight.
 *
 * The Owner asked (November 2026): "Whenever we are seeing some sort of
 * table like structure with columns and we scroll down, it'll be ideal if
 * those column names float as well so that we can see the column names as
 * we scroll down."
 *
 * A heading can only stay put inside the box that scrolls, which gives
 * two cases, and a table is one or the other:
 *
 *   on the page   a table never wider than its place on the page (the
 *                 inventory, a team's members). The page scrolls and the
 *                 headings stop under the app's top strip
 *                 (`--app-header-h`, AppShell). Nothing between the table
 *                 and the page may scroll or clip — `overflow-x-auto`
 *                 counts: it makes a box of its own, and the headings
 *                 would stick to that box, which never moves.
 *   in a box      a table that scrolls sideways (a grid of roles on a
 *                 phone). It scrolls inside itself both ways, with a
 *                 height of its own: `<TableScroll>` in Surface.tsx.
 *
 * Either way the classes go on each `<th>` of the heading row (a `<thead>`
 * or `<tr>` does not stick in every browser), with the colour of whatever
 * the table stands on — a heading with no colour of its own lets the rows
 * show through it. The hairline under it is a shadow, because a collapsed
 * border does not travel with a cell that has stuck.
 */

const HAIRLINE = 'shadow-[inset_0_-1px_0_var(--color-border-subtle)]'

/** For a table the page scrolls: under the app's top strip, and under it in the stack. */
export const HEAD_ON_PAGE = `sticky top-[var(--app-header-h,4.5rem)] z-10 ${HAIRLINE}`

/** For a table inside `<TableScroll>`: at the top of its own box. */
export const HEAD_IN_BOX = `sticky top-0 z-20 ${HAIRLINE}`

/** The colour of a card (`bg-surface-lowest`). */
export const ON_CARD = 'bg-surface-lowest'

/**
 * The colour of a `bg-raised` row standing on a card. `raised` is a veil,
 * not a colour, so the heading wears the veil over the card's own white:
 * the same two layers the row behind it is made of.
 */
export const ON_RAISED =
  'bg-[linear-gradient(var(--color-raised),var(--color-raised)),linear-gradient(var(--color-surface-lowest),var(--color-surface-lowest))]'
