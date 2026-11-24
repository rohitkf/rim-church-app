import { describe, expect, it } from 'vitest'
// Read through Vite rather than the filesystem: the app's TypeScript
// project has no Node types, and ?raw is how it reads any other asset.
import html from '../../index.html?raw'

describe('the document head', () => {
  it('fetches nothing from anyone else before the app can start', () => {
    // A render-blocking <link rel="stylesheet"> to a third party stops
    // the browser running the module script until that host answers. On
    // a network where it is slow or blocked the whole app — sign-in
    // included — sits blank on "Loading…" with nothing actually wrong
    // with it. The app is set in the device's own face (index.css), so
    // there is no webfont to fetch at all.
    const links = html.match(/<link[^>]*>/g) ?? []
    const offsite = links.filter((tag: string) => /href="https?:\/\//.test(tag))
    expect(offsite).toEqual([])
    expect(html).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
  })

  it('lets the page be pinched bigger (WCAG 1.4.4)', () => {
    // It was blocked once, "so it feels like an app" — and nobody who
    // needs larger text could have it. A viewport that forbids zoom is
    // the whole of that mistake.
    const viewport = html.match(/<meta[^>]*name="viewport"[^>]*>/)?.[0] ?? ''
    expect(viewport).toMatch(/width=device-width/)
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale/)
  })

  it('shows something other than a blank page while the bundle loads', () => {
    expect(html).toMatch(/id="root"[\s\S]*Loading/)
  })
})
