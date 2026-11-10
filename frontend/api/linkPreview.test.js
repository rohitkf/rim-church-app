import { afterEach, describe, expect, it, vi } from 'vitest'
import { escapeHtml, imageUrl, previewFor, previewPage, summary } from './_linkPreview.js'
import { GET } from './register-preview.js'
import config from '../vercel.json'

/*
 * The preview a registration link gets when it is pasted into WhatsApp,
 * iMessage and the like: the event's title, a line about it, its picture.
 */

const where = { supabaseUrl: 'https://db.example.co', origin: 'https://church.example', slug: 'leaders-2026' }
const event = {
  title: 'Pastors & Leaders Conference 2026',
  description: '  Three days of teaching,\n worship and fellowship for everyone who leads.  ',
  image_path: 'events/abc 1.jpg',
  cancelled_at: null,
}

describe('the preview of a registration link', () => {
  it('carries the event’s own picture, title and a line about it', () => {
    const p = previewFor(event, where)
    expect(p).toMatchObject({
      title: 'Pastors & Leaders Conference 2026',
      description: 'Three days of teaching, worship and fellowship for everyone who leads.',
      image: 'https://db.example.co/storage/v1/object/public/registration-images/events/abc%201.jpg',
      url: 'https://church.example/register/leaders-2026',
      large: true,
    })
    const page = previewPage(p)
    expect(page).toContain('<meta property="og:image" content="https://db.example.co/storage/v1/object/public/registration-images/events/abc%201.jpg">')
    expect(page).toContain('<meta property="og:title" content="Pastors &amp; Leaders Conference 2026">')
    expect(page).toContain('<meta name="twitter:card" content="summary_large_image">')
  })

  it('falls back to the app’s icon, small, when the event has no picture', () => {
    const p = previewFor({ ...event, image_path: null }, where)
    expect(p.image).toBe('https://church.example/icon-512.png')
    expect(previewPage(p)).toContain('content="summary"')
  })

  it('says a cancelled event is cancelled', () => {
    expect(previewFor({ ...event, cancelled_at: '2026-11-01T10:00:00Z' }, where).title).toBe('Cancelled: Pastors & Leaders Conference 2026')
  })

  it('gives the church’s name for a link to no event', () => {
    expect(previewFor(null, where)).toMatchObject({ title: 'Rehoboth International Ministries', large: false })
  })

  it('cannot be made to write its own HTML', () => {
    const page = previewPage(previewFor({ ...event, title: '"><script>alert(1)</script>' }, where))
    expect(page).not.toContain('<script>')
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })

  it('cuts a long description at a word', () => {
    const long = 'word '.repeat(80)
    const s = summary(long)
    expect(s.length).toBeLessThanOrEqual(180)
    expect(s.endsWith('word…')).toBe(true)
    expect(imageUrl('https://db.example.co/', 'a/b.png')).toBe('https://db.example.co/storage/v1/object/public/registration-images/a/b.png')
  })
})

describe('the server function', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('reads the event as anybody signed out does, and answers with its preview', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://db.example.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-key')
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(event), { status: 200 })))
    vi.stubGlobal('fetch', fetchMock)

    const res = await GET(new Request('https://church.example/api/register-preview?slug=leaders-2026'))
    const html = await res.text()
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(html).toContain('registration-images/events/abc%201.jpg')
    const [called, init] = fetchMock.mock.calls[0]
    expect(called).toBe('https://db.example.co/rest/v1/rpc/registration_public_event')
    expect(JSON.parse(init.body)).toEqual({ p_slug: 'leaders-2026' })
    expect(init.headers.apikey).toBe('public-key')
  })

  it('still answers, with the church’s name, when the database cannot be reached', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://db.example.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-key')
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
    const res = await GET(new Request('https://church.example/api/register-preview?slug=leaders-2026'))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<title>Rehoboth International Ministries</title>')
  })
})

describe('who is sent the preview', () => {
  const rule = config.rewrites.find((r) => r.source === '/register/:slug')
  const matches = (ua) => new RegExp(rule.has[0].value).test(ua)

  it('comes before the app’s own catch-all, for link-preview robots only', () => {
    const order = config.rewrites.map((r) => r.source)
    expect(order.indexOf('/register/:slug')).toBeLessThan(order.indexOf('/(.*)'))
    expect(rule.destination).toBe('/api/register-preview?slug=:slug')
  })

  it('is the robots that build previews', () => {
    for (const ua of [
      'WhatsApp/2.23.20.0',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Mozilla/5.0 (Macintosh) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
      'TelegramBot (like TwitterBot)',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
      'LinkedInBot/1.0 (compatible; Mozilla/5.0)',
    ]) {
      expect(matches(ua), ua).toBe(true)
    }
  })

  it('is never a person, even in an app’s own browser', () => {
    for (const ua of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0',
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 Instagram 330.0',
    ]) {
      expect(matches(ua), ua).toBe(false)
    }
  })
})
