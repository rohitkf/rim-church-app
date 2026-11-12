import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { TableScroll } from '../components/Surface'
import { HEAD_IN_BOX, HEAD_ON_PAGE, ON_CARD, ON_RAISED } from './stickyHead'

/*
 * Column headings that stay in sight. The Owner: "Whenever we are seeing
 * some sort of table like structure with columns and we scroll down, it'll
 * be ideal if those column names float as well."
 *
 * Whether a heading really stays put is a browser's to say, and is checked
 * there (the stub browser, every table, both ways of scrolling). What can
 * be held here is the part that rots quietly: a new table written without
 * it, or a table moved into a box that scrolls sideways — where the
 * headings stick to the box and never to the page, and nothing fails.
 */

const sources = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const tables = Object.entries(sources).filter(([path, source]) => !/\.test\./.test(path) && source.includes('<table'))

/**
 * A table that pins its headings with classes of its own, and why.
 * Anything else goes through lib/stickyHead.ts.
 */
const OWN_WAY: Record<string, string> = {
  '../components/OnboardingCard.tsx': 'its corner cell is pinned both ways (left and top), which the shared classes do not say',
}

describe('every table keeps its column headings in sight', () => {
  it('finds the tables there are', () => {
    // If the scan found nothing, the tests below would pass by checking nothing.
    expect(tables.length).toBeGreaterThanOrEqual(8)
  })

  it.each(tables.map(([path, source]) => [path.replace('../', 'src/'), path, source] as const))('%s', (_name, path, source) => {
    if (OWN_WAY[path]) {
      // Its own classes, then: every heading cell sticks to the top.
      const head = source.slice(source.indexOf('<thead'), source.indexOf('</thead>'))
      const cells = head.match(/<th\b[^>]*>/gs) ?? []
      expect(cells.length).toBeGreaterThan(0)
      for (const cell of cells) expect(cell).toMatch(/sticky[^"]*\btop-0\b/)
      expect(source).toContain('<TableScroll')
      return
    }
    const onPage = source.includes('HEAD_ON_PAGE')
    const inBox = source.includes('HEAD_IN_BOX')
    // One or the other: a table with neither lets its headings scroll away.
    expect(onPage || inBox).toBe(true)

    // Every heading cell of every table in the file carries it, not only the first.
    for (const head of source.match(/<thead[\s\S]*?<\/thead>/g) ?? []) {
      const cells = head.match(/<th\b[\s\S]*?>/g) ?? []
      expect(cells.length).toBeGreaterThan(0)
      for (const cell of cells) expect(cell).toMatch(/HEAD_ON_PAGE|HEAD_IN_BOX/)
      // And a colour of its own, or the rows show through it.
      for (const cell of cells) expect(cell).toMatch(/ON_CARD|ON_RAISED/)
    }

    if (inBox) {
      // Headings pinned to a box need the box.
      expect(source).toContain('<TableScroll')
    }
    if (onPage) {
      // Headings pinned to the page must have nothing that scrolls between them and it.
      for (const at of [...source.matchAll(/<table\b/g)].map((m) => m.index!)) {
        const before = source.slice(Math.max(0, at - 400), at)
        const wrapper = before.slice(before.lastIndexOf('<div'))
        expect(wrapper).not.toMatch(/overflow-(x-)?(auto|scroll|hidden)/)
      }
    }
  })
})

describe('the two ways', () => {
  it('pins to the page under the app’s top strip, and beneath it in the stack', () => {
    expect(HEAD_ON_PAGE).toContain('sticky')
    expect(HEAD_ON_PAGE).toContain('top-[var(--app-header-h,4.5rem)]')
    // The strip is z-20: the headings pass under it, never over.
    expect(HEAD_ON_PAGE).toContain('z-10')
  })

  it('pins to the top of its own box', () => {
    expect(HEAD_IN_BOX).toContain('sticky')
    expect(HEAD_IN_BOX).toContain('top-0')
  })

  it('draws the hairline as a shadow, which travels with a cell that has stuck', () => {
    for (const head of [HEAD_ON_PAGE, HEAD_IN_BOX]) expect(head).toContain('shadow-[inset_0_-1px_0_var(--color-border-subtle)]')
  })

  it('gives a heading the colour of what it stands on', () => {
    expect(ON_CARD).toBe('bg-surface-lowest')
    // `raised` is a veil over the card: the heading wears both layers, so it is opaque and matches.
    expect(ON_RAISED).toContain('var(--color-raised)')
    expect(ON_RAISED).toContain('var(--color-surface-lowest)')
  })
})

describe('the box a wide table scrolls in', () => {
  it('scrolls both ways inside a height of its own, and keeps its headings in its own stack', () => {
    const { container } = render(
      <TableScroll className="mt-2">
        <table />
      </TableScroll>,
    )
    const box = container.firstElementChild!
    expect(box.className).toContain('overflow-auto')
    expect(box.className).toContain('max-h-[70svh]')
    // Without this the pinned headings were drawn over the app's top strip as the page carried the box under it.
    expect(box.className).toContain('isolate')
    // A sideways drag that runs out must not go back a page; up and down carries on into the page.
    expect(box.className).toContain('overscroll-x-contain')
    expect(box.className).not.toMatch(/overscroll-contain|overscroll-y-contain/)
    expect(box.className).toContain('mt-2')
  })
})
