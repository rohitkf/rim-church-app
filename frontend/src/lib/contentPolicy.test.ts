import { describe, expect, it } from 'vitest'
import vercel from '../../vercel.json'
import indexHtml from '../../index.html?raw'
import boot from '../../public/boot.js?raw'
import { blockedLine, worthALine } from './clientErrors'

/*
 * Scripts run from this site and nowhere else.
 *
 * Until November 2026 the only thing between a piece of typed text and
 * its running as code was that React escapes what it draws. The page now
 * also tells the browser so: a script from another site, or one typed
 * into the page, is refused whatever let it in.
 */

const policy = vercel.headers.find((h) => h.source === '/(.*)')?.headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? ''
const rule = (name: string) => policy.split('; ').find((d) => d.startsWith(name + ' ')) ?? ''

describe('the page’s content policy', () => {
  it('lets scripts come from this site only: none typed in, none made up as the page runs', () => {
    expect(rule('script-src')).toBe("script-src 'self'")
    expect(policy).not.toContain("'unsafe-eval'")
    expect(rule('object-src')).toBe("object-src 'none'")
    expect(rule('base-uri')).toBe("base-uri 'self'")
    expect(rule('form-action')).toBe("form-action 'self'")
    expect(rule('frame-ancestors')).toBe("frame-ancestors 'none'")
  })

  it('so the page itself has no script typed into it, and no press written as an attribute', () => {
    // Every <script> names a file.
    const scripts = indexHtml.match(/<script\b[^>]*>/g) ?? []
    expect(scripts.length).toBeGreaterThan(0)
    for (const tag of scripts) expect(tag, tag).toMatch(/\bsrc=/)
    expect(indexHtml).not.toMatch(/\son[a-z]+=/i)
    // The boot line's script is one of those files, and it writes no HTML.
    expect(boot).not.toContain('innerHTML')
    expect(boot).toContain("addEventListener('click'")
  })

  it('tells the church what it refuses, but not the two refusals that are expected', () => {
    const here = 'https://rim.example'
    // A script from elsewhere, or one typed into the page: said.
    expect(worthALine('script-src-elem', 'https://evil.example/x.js', `${here}/rota`, here)).toBe(true)
    expect(worthALine('script-src', 'eval', `${here}/rota`, here)).toBe(true)
    // The app's own bundle asking once whether it may make a function (zod), and being told no.
    expect(worthALine('script-src', 'eval', `${here}/assets/index-abc.js`, here)).toBe(false)
    // A browser extension writing into the page.
    expect(worthALine('script-src-elem', 'chrome-extension://abc/inject.js', null, here)).toBe(false)
    expect(worthALine('style-src', 'inline', 'moz-extension://abc/content.js', here)).toBe(false)
  })

  it('records what it refuses, by address and not by what followed the question mark', () => {
    expect(blockedLine('script-src', 'https://elsewhere.example/x.js?token=abc')).toBe('Blocked by the content policy: script-src https://elsewhere.example/x.js')
    expect(blockedLine('script-src', '')).toBe('Blocked by the content policy: script-src inline')
  })
})

/*
 * Nothing secret is in the repository. Checked on every run of the tests,
 * so a key pasted into a file fails before it is pushed, not after.
 */
describe('no secret is committed', () => {
  // Every text file the app is built from, read as it stands: this folder
  // and the database's migrations and functions, which is as far as the
  // test runner is allowed to read (vite.config's fs.allow). What is
  // built or downloaded is left out.
  const files = import.meta.glob(
    [
      '../../**/*.{ts,tsx,js,mjs,cjs,json,md,html,css,sh}',
      '../../../supabase/migrations/*.sql',
      '../../../supabase/functions/**/*.{ts,json}',
      '!**/node_modules/**',
      '!**/dist/**',
      '!**/.claude/**',
      '!**/package-lock.json',
    ],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>

  const SECRETS: [string, RegExp][] = [
    ['a private key', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/],
    ['a Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{20,}/],
    ['a Supabase access token', /\bsbp_[a-f0-9]{40}\b/],
    ['a Stripe live key', /\b[sr]k_live_[A-Za-z0-9]{20,}/],
    ['a Resend key', /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/],
    ['an AWS key', /\bAKIA[0-9A-Z]{16}\b/],
    ['a GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
    ['an Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ]
  /** A signed token whose payload says it is the database's own key. The publishable one says "anon" and may be anywhere. */
  const serviceToken = (text: string) =>
    (text.match(/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []).some((t) => {
      try {
        return /"role"\s*:\s*"service_role"/.test(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      } catch {
        return false
      }
    })

  it('would see one if it were there', () => {
    // Made here, in pieces, so that this file is not itself a hit.
    const made: Record<string, string> = {
      'a Stripe live key': 'sk_' + 'live_' + 'a'.repeat(24),
      'a Supabase secret key': 'sb_' + 'secret_' + 'b'.repeat(24),
      'a GitHub token': 'gh' + 'p_' + 'c'.repeat(36),
      'a private key': '-----BEGIN ' + 'PRIVATE KEY-----',
    }
    for (const [what, text] of Object.entries(made)) {
      expect(SECRETS.find(([name]) => name === what)?.[1].test(`key = "${text}"`), what).toBe(true)
    }
    const payload = btoa(JSON.stringify({ role: 'service_role', iss: 'supabase' })).replace(/=+$/, '')
    expect(serviceToken(`eyJhbGciOiJIUzI1NiJ9.${payload}.${'s'.repeat(20)}`)).toBe(true)
    const anon = btoa(JSON.stringify({ role: 'anon', iss: 'supabase' })).replace(/=+$/, '')
    expect(serviceToken(`eyJhbGciOiJIUzI1NiJ9.${anon}.${'s'.repeat(20)}`)).toBe(false)
  })

  it('in any file the app is built from', () => {
    const found: string[] = []
    let read = 0
    for (const [file, text] of Object.entries(files)) {
      // This file names the shapes it looks for.
      if (file.endsWith('contentPolicy.test.ts')) continue
      read += 1
      for (const [what, shape] of SECRETS) if (shape.test(text)) found.push(`${what} in ${file}`)
      if (serviceToken(text)) found.push(`the database’s service key in ${file}`)
    }
    expect(found).toEqual([])
    // It looked: a walk that found no files would pass for the wrong reason.
    expect(read).toBeGreaterThan(500)
  })
})
