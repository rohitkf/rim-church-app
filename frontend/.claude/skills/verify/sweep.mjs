/*
 * Every page, on a small phone, in one run.
 *
 * Individual page tests pass on their own and still let pages drift apart
 * — a Sunday split across two headings on one page and not another, a
 * service "over" on the planner and "running" on the rota. This opens all
 * of them against the same fixtures (two services every Sunday, one of
 * them already over today) and fails if any page crashes, logs an error,
 * or scrolls sideways at 360px.
 *
 * Needs the preview from SKILL.md running on :4411. Then:
 *   S=<scratch dir> node .claude/skills/verify/sweep.mjs
 * Screenshots land in $S as sweep_<route>.png. Exit code 1 on any problem.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'

const S = process.env.S ?? '.'
const BASE = 'http://localhost:4411'
const WIDTH = Number(process.env.WIDTH ?? 360)
const now = new Date().toISOString()
const day = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
const at = (n, hoursFromNow) => new Date(Date.now() + n * 86400e3 + hoursFromNow * 3600e3).toISOString()

const user = { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'sweep@example.test',
  app_metadata: { provider: 'email' }, user_metadata: {}, created_at: now }
const media = { id: 'd1', name: 'Media', handbook_url: null, color: '#a855f7', is_service_flow: false,
  is_worship: false, created_at: now, updated_at: now }
const worship = { id: 'd2', name: 'Worship', handbook_url: null, color: '#ef4444', is_service_flow: false,
  is_worship: true, created_at: now, updated_at: now }
const svc = (id, n, t) => ({ id, date: day(n), service_type: t, created_at: now, ended_at: null, series_id: null })
const session = (id, service, n, h, mins) => ({ id, service_id: service, start_time: at(n, h), duration_minutes: mins,
  session_name: 'Worship', order_index: 0 })
const me = { id: 'u1', first_name: 'Rohit', last_name: 'Test', email: user.email, phone: null, avatar_url: null }

const T = {
  profiles: [{ ...me, dob: '1990-01-01', anniversary: null, welcomed_at: now, onboarded_at: now, marital_status: 'single' }],
  user_roles: [{ id: 'r1', role_type: 'admin', department_id: null, service_id: null }],
  departments: [media, worship],
  department_members: [{ id: 'm1', department_id: 'd1', user_id: 'u1', member_type: 'core', created_at: now, profiles: me }],
  // Two services every Sunday; today's both already over, English first.
  services: [svc('p1', -7, 'English Service'), svc('p2', -7, 'Malayalam Service'),
    svc('t1', 0, 'English Service'), svc('t2', 0, 'Malayalam Service'),
    svc('n1', 7, 'English Service'), svc('n2', 7, 'Malayalam Service'), svc('f1', 14, 'English Service')],
  service_sessions: [session('x1', 't1', 0, -8, 90), session('x2', 't2', 0, -6, 180),
    session('x3', 'n1', 7, -8, 90), session('x4', 'n2', 7, -6, 180)],
  rota_assignments: [{ id: 'a1', service_id: 'n1', department_id: 'd1', user_id: 'u1', role_label: 'Camera',
    role_id: null, include_pre: true, include_post: true, assignment_tags: [],
    profile: { id: 'u1', first_name: 'Rohit', last_name: 'Test' }, department: { id: 'd1', name: 'Media', color: '#a855f7' } }],
  // One open for another team, one resolved by me — both halves of the page.
  service_issues: [
    { id: 'i1', service_id: 't1', department_id: 'd2', title: 'The foldback wedge on the left of the stage keeps cutting out mid-song',
      details: 'Happened twice during the second song.', raised_by: 'u1', raised_by_department_id: 'd1', created_at: at(0, -3),
      resolved_at: null, resolved_by: null, service: { date: day(0), service_type: 'English Service' },
      team: { id: 'd2', name: 'Worship', color: '#ef4444' }, raiser_team: { id: 'd1', name: 'Media', color: '#a855f7' },
      raiser: { first_name: 'Rohit', last_name: 'Test' }, resolver: null },
    { id: 'i2', service_id: 'p1', department_id: 'd1', title: 'Projector slow to wake', details: null, raised_by: 'u9',
      raised_by_department_id: 'd2', created_at: at(-7, -4), resolved_at: at(-6, 0), resolved_by: 'u1',
      service: { date: day(-7), service_type: 'English Service' }, team: { id: 'd1', name: 'Media', color: '#a855f7' },
      raiser_team: { id: 'd2', name: 'Worship', color: '#ef4444' }, raiser: { first_name: 'Grace', last_name: 'Mensah' },
      resolver: { first_name: 'Rohit', last_name: 'Test' } },
  ],
}

const ROUTES = ['/', '/service-planner', '/availability', '/rota', '/checklists', '/debriefs', '/issues', '/set-lists',
  '/messages', '/team-chat', '/updates', '/polls', '/events', '/giving', '/departments', '/departments/d1',
  '/volunteers', '/inventory', '/settings/profile', '/settings/access', '/settings/church', '/settings/alerts',
  '/settings/data']

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({ viewport: { width: WIDTH, height: 1000 }, deviceScaleFactor: 2 })
await ctx.addInitScript(([u]) => {
  localStorage.setItem('sb-supabase-auth-token', JSON.stringify({ access_token: 'x.eyJzdWIiOiJ1MSIsImV4cCI6OTk5OTk5OTk5OX0.x',
    refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: u }))
}, [user])
await ctx.route('http://supabase.test/**', async (route) => {
  const req = route.request(); const url = req.url()
  if (url.includes('/auth/v1/')) return route.fulfill({ json: user })
  if (url.includes('/realtime/')) return route.abort()
  if (url.includes('/rest/v1/rpc/')) return route.fulfill({ json: url.includes('can_edit_set_list') ? true : null })
  if (req.method() !== 'GET') return route.fulfill({ status: 204, body: '' })
  const t = new URL(url).pathname.replace('/rest/v1/', '')
  const rows = t === 'app_owner' ? [{ user_id: 'u1' }] : (T[t] ?? [])
  if ((req.headers()['accept'] || '').includes('pgrst.object'))
    return rows.length ? route.fulfill({ json: rows[0] }) : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows' } })
  return route.fulfill({ json: rows })
})

const p = await ctx.newPage()
let errors = []
p.on('pageerror', (e) => errors.push(`crash: ${e.message}`))
p.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource|WebSocket|realtime/i.test(m.text())) errors.push(m.text().slice(0, 200))
})

let failed = 0
for (const route of ROUTES) {
  errors = []
  await p.goto(BASE + route)
  await p.waitForTimeout(2200)
  const { scroll, client } = await p.evaluate(() => ({
    scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  const problems = [...errors]
  if (scroll > client) problems.push(`scrolls sideways by ${scroll - client}px`)
  await p.screenshot({ path: `${S}/sweep${route.replace(/\//g, '_')}.png`, fullPage: true })
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${route}${problems.length ? ' — ' + problems.join(' | ') : ''}`)
  if (problems.length) failed += 1
}
await b.close()
console.log(failed ? `\n${failed} page(s) with problems` : `\nAll ${ROUTES.length} pages clean at ${WIDTH}px`)
process.exit(failed ? 1 : 0)
