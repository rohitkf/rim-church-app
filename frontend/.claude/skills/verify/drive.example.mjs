import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const S = process.env.S
const BASE = 'http://localhost:4411'
const now = new Date().toISOString()
const user = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'verifier@example.test',
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: now }
const dept = { id: 'd1', name: 'Media', handbook_url: null, color: '#3b82f6', is_service_flow: false,
  is_worship: false, created_at: now, updated_at: now }
const svc = (id, date, t) => ({ id, date, service_type: t, created_at: now, ended_at: null })
const ev = (o) => ({ details: null, ends_on: null, start_time: null, location: null, department_id: null,
  created_by: 'u1', creator: { first_name: 'Grace', last_name: 'Mensah' }, department: null, ...o })
const T = {
  profiles: [{ id: 'u1', first_name: 'Rohit', last_name: 'Test', dob: '1990-01-01', anniversary: null,
    email: user.email, phone: '0700', avatar_url: null, welcomed_at: now, onboarded_at: now, marital_status: 'single' }],
  user_roles: [{ id: 'r1', role_type: 'admin', department_id: null, service_id: null }],
  departments: [dept],
  services: [svc('s-eng', '2026-09-27', 'English Service'), svc('s-mal', '2026-09-27', 'Malayalam Service'),
    svc('s-oct4', '2026-10-04', 'English Service'), svc('s-oct11', '2026-10-11', 'English Service'),
    svc('s-oct18', '2026-10-18', 'Combined Service'), svc('s-past', '2026-09-20', 'English Service')],
  // Malayalam starts first: if the page orders by name, English wrongly goes on top.
  service_sessions: [
    { id: 'x1', service_id: 's-mal', start_time: '2026-09-27T08:00:00+01:00', duration_minutes: 90 },
    { id: 'x2', service_id: 's-eng', start_time: '2026-09-27T10:30:00+01:00', duration_minutes: 90 },
  ],
  church_events: [
    ev({ id: 'e-future', title: 'Members meeting', event_date: '2026-10-02', start_time: '19:30:00', location: 'Main hall' }),
    ev({ id: 'e-past', title: 'Church workday', event_date: '2026-08-22', start_time: '09:00:00', location: 'Car park' }),
    ev({ id: 'e-run', title: 'Week of Prayer', event_date: '2026-09-07', ends_on: '2026-09-13', start_time: '19:00:00',
      department_id: 'd1', department: { name: 'Media', color: '#3b82f6' } }),
    ev({ id: 'e-ongoing', title: 'Harvest week', event_date: '2026-09-24', ends_on: '2026-09-28' }),
  ],
}
const table = (url) => new URL(url).pathname.replace('/rest/v1/', '')
const seen = []
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
async function page(width) {
  const ctx = await b.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 })
  await ctx.addInitScript(([u]) => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    localStorage.setItem('sb-supabase-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiJ1MSIsImV4cCI6OTk5OTk5OTk5OX0.x',
      refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: u }))
  }, [user])
  await ctx.route('http://supabase.test/**', async (route) => {
    const req = route.request(); const url = req.url()
    if (url.includes('/auth/v1/')) return route.fulfill({ json: user })
    if (url.includes('/realtime/')) return route.abort()
    if (url.includes('/rest/v1/rpc/')) return route.fulfill({ json: null })
    const t = table(url); seen.push(t)
    let rows = T[t] ?? []
    const single = (req.headers()['accept'] || '').includes('pgrst.object')
    if (req.method() !== 'GET') return route.fulfill({ json: [] })
    if (single) return rows.length ? route.fulfill({ json: rows[0] }) : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
    return route.fulfill({ json: rows })
  })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message))
  return p
}
for (const [w, name] of [[1100, 'desktop'], [412, 'phone']]) {
  const p = await page(w)
  await p.goto(BASE + '/events'); await p.waitForTimeout(2500)
  await p.screenshot({ path: `${S}/v-events-${name}.png`, fullPage: true })
  if (name === 'desktop') console.log('EVENTS TEXT:\n' + (await p.locator('main, #root').first().innerText()).slice(0, 2500))
  await p.goto(BASE + '/availability'); await p.waitForTimeout(2500)
  await p.screenshot({ path: `${S}/v-avail-${name}.png`, fullPage: true })
  if (name === 'desktop') {
    console.log('AVAIL TEXT:\n' + (await p.locator('#root').innerText()).slice(0, 3000))
    const states = await p.$$eval('button[aria-controls^="availability-teams-"]', (bs) =>
      bs.map((x) => `${x.getAttribute('aria-controls')} expanded=${x.getAttribute('aria-expanded')}`))
    console.log('CARDS:', states.join(' | '))
    // probe: collapse the top one, open a folded one
    const top = p.locator('button[aria-controls^="availability-teams-"][aria-expanded="true"]').first()
    if (await top.count()) { await top.click(); await p.waitForTimeout(300) }
    const folded = p.locator('button[aria-controls="availability-teams-s-oct4"]')
    if (await folded.count()) { await folded.click(); await p.waitForTimeout(300) }
    const after = await p.$$eval('button[aria-controls^="availability-teams-"]', (bs) =>
      bs.map((x) => `${x.getAttribute('aria-controls')} expanded=${x.getAttribute('aria-expanded')}`))
    console.log('AFTER TOGGLES:', after.join(' | '))
  }
  await p.context().close()
}
console.log('TABLES:', [...new Set(seen)].join(','))
await b.close()
