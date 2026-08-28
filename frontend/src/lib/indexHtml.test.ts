import { describe, expect, it } from 'vitest'
// Read through Vite rather than the filesystem: the app's TypeScript
// project has no Node types, and ?raw is how it reads any other asset.
import html from '../../index.html?raw'

describe('the document head', () => {
  it('does not let a third-party stylesheet block the app from starting', () => {
    // A render-blocking <link rel="stylesheet"> to fonts.googleapis.com
    // stops the browser running the module script until Google answers.
    // On a network where that host is slow or blocked the whole app —
    // sign-in included — sits blank on "Loading…" with nothing actually
    // wrong with it. The webfonts are decoration; index.css names the
    // platform's own faces first.
    const fontLinks = html.match(/<link[^>]*fonts\.googleapis\.com[^>]*>/g) ?? []
    const stylesheets = fontLinks.filter((tag: string) => /rel="stylesheet"/.test(tag))
    expect(stylesheets.length).toBeGreaterThan(0)

    // Every one of them either loads at print media (swapped to all on
    // load) or sits inside <noscript>, where it blocks nothing.
    const blocking = stylesheets.filter((tag: string) => !/media="print"/.test(tag))
    for (const tag of blocking) {
      const index = html.indexOf(tag)
      const before = html.slice(0, index)
      expect(before.lastIndexOf('<noscript>')).toBeGreaterThan(before.lastIndexOf('</noscript>'))
    }
  })

  it('shows something other than a blank page while the bundle loads', () => {
    expect(html).toMatch(/id="root"[\s\S]*Loading/)
  })
})
