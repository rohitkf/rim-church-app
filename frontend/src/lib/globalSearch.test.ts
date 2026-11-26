import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What each table answers; a table not named answers nothing. */
const tables = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]>, asked: [] as { table: string; ors: string[] }[], refuse: new Set<string>() }))
vi.mock('./supabaseClient', () => {
  const table = (name: string) => {
    const ask = { table: name, ors: [] as string[] }
    tables.asked.push(ask)
    const builder: Record<string, unknown> = {}
    for (const method of ['select', 'order', 'limit', 'is']) builder[method] = () => builder
    builder.or = (filter: string) => {
      ask.ors.push(filter)
      return builder
    }
    builder.then = (resolve: (v: unknown) => void) =>
      resolve(tables.refuse.has(name) ? { data: null, error: { message: 'permission denied' } } : { data: tables.rows[name] ?? [], error: null })
    return builder
  }
  return { supabase: { from: table, rpc: (name: string) => Promise.resolve({ data: tables.rows[`rpc:${name}`] ?? [], error: null }) } }
})

import { NAV_ITEMS } from './navItems'
import { SETTINGS_SECTIONS } from './settingsSections'
import {
  KIND_HEADING,
  PAGE_WORDS,
  PER_KIND,
  arrange,
  fetchSearchIndex,
  matchThings,
  placeThings,
  recentThings,
  rememberThing,
  searchWritten,
  textWords,
  wordFilter,
  type Hit,
  type Thing,
} from './globalSearch'
import { forgetRecent } from './searchRecent'

/*
 * The search over everything. It was a hand-kept list of half the pages
 * and twelve "does this column contain exactly that" questions.
 */
const everything = () => true
const places = (canOpen: (p: string) => boolean = everything, names: Record<string, string> = {}, rooms = true) =>
  placeThings(names, canOpen, () => rooms)
const find = (q: string, things: Thing[]) => arrange(matchThings(q, things)).flatMap((g) => g.hits.map((h) => h.label))

beforeEach(() => {
  tables.rows = {}
  tables.asked = []
  tables.refuse = new Set()
  localStorage.clear()
})

describe('places', () => {
  it('holds every page in the menu and every room of Settings, from the lists those are drawn from', () => {
    const all = places()
    for (const item of NAV_ITEMS) expect(all.some((t) => t.to === item.to), item.to).toBe(true)
    for (const room of SETTINGS_SECTIONS) expect(all.some((t) => t.to === room.to), room.to).toBe(true)
  })

  it('has words for every page, so a new one cannot be added and left unfindable', () => {
    for (const item of NAV_ITEMS) expect(PAGE_WORDS[item.to], `lib/globalSearch.ts PAGE_WORDS has no line for ${item.to}`).toBeDefined()
    for (const path of Object.keys(PAGE_WORDS)) expect(NAV_ITEMS.some((i) => i.to === path), `${path} is not a page`).toBe(true)
  })

  it('finds the pages the hand-kept list had left out', () => {
    const all = places()
    for (const [typed, page] of [
      ['calendar', 'Calendar'],
      ['prayer', 'Prayer Requests'],
      ['giving', 'Giving'],
      ['set list', 'Set Lists'],
      ['songs', 'Songs'],
      ['polls', 'Polls'],
      ['updates', 'Church Updates'],
      ['clock', 'Clock In'],
      ['stage', 'Stage Layout'],
      ['reception', 'Reception'],
      ['debrief', 'Debriefs'],
    ]) {
      expect(find(typed, all)[0], typed).toBe(page)
    }
  })

  it('finds a page by another word for it, by its first letters, and through a slip', () => {
    const all = places()
    expect(find('roster', all)).toContain('Team Rota')
    expect(find('tithes', all)).toContain('Giving')
    expect(find('tr', all)[0]).toBe('Team Rota')
    expect(find('volnteers', all)[0]).toBe('Volunteers')
    expect(find('calender', all)[0]).toBe('Calendar')
    expect(find('dark mode', all)).toContain('Appearance')
  })

  it('shows a renamed page by its new name, and still finds it by the old', () => {
    const all = places(everything, { '/events': 'Church Calendar', '/songs': 'Songs Database' })
    expect(find('church cal', all)[0]).toBe('Church Calendar')
    expect(find('database', all)[0]).toBe('Songs Database')
    expect(find('songs', all)).toContain('Songs Database')
  })

  it('offers nobody a page or a room they cannot open', () => {
    const member = places((p) => !['/volunteers', '/inventory', '/service-planner'].includes(p), {}, false)
    expect(member.some((t) => t.to === '/volunteers')).toBe(false)
    expect(member.some((t) => t.to.startsWith('/settings/'))).toBe(false)
    expect(member.some((t) => t.to === '/service-planner/templates')).toBe(false)
    // Settings itself is everybody's: their own rooms are in it.
    expect(member.some((t) => t.to === '/settings')).toBe(true)
    expect(member.some((t) => t.to === '/rota')).toBe(true)
  })
})

describe('things with a name', () => {
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
  const seed = () => {
    tables.rows = {
      profiles: [
        { id: 'u1', first_name: 'Grace', last_name: 'Mensah' },
        { id: 'u2', first_name: 'José', last_name: 'Núñez' },
        { id: 'u3', first_name: 'Sam', last_name: 'Varghese' },
        { id: 'u4', first_name: '', last_name: '' },
      ],
      department_members: [{ user_id: 'u1', department_id: 'media' }, { user_id: 'u1', department_id: 'worship' }, { user_id: 'u2', department_id: 'media' }],
      departments: [{ id: 'media', name: 'Media' }, { id: 'worship', name: 'Worship' }],
      department_roles: [{ id: 'r1', name: 'Camera', department_id: 'media' }],
      services: [{ id: 's-past', date: day(-7), service_type: 'English Service' }, { id: 's-next', date: day(7), service_type: 'English Service' }],
      service_sessions: [
        { id: 'x1', session_name: 'Worship', role_label: null, service_id: 's-past' },
        { id: 'x2', session_name: 'Worship', role_label: null, service_id: 's-next' },
        { id: 'x3', session_name: 'Sermon', role_label: 'Pastor', service_id: 's-next' },
      ],
      set_list_items: [{ id: 'l1', title: 'Way Maker', led_by: 'Grace', service_id: 's-next' }, { id: 'l2', title: 'Goodness of God', led_by: null, service_id: 's-next' }],
      songs: [{ id: 'g1', title: 'Goodness of God', song_key: 'G major' }],
      church_events: [
        { id: 'e1', title: 'Prayer meeting', event_date: day(-14), location: 'Hall', series_id: 'series-1', category: null },
        { id: 'e2', title: 'Prayer meeting', event_date: day(3), location: 'Hall', series_id: 'series-1', category: null },
        { id: 'e3', title: 'Prayer meeting', event_date: day(10), location: 'Hall', series_id: 'series-1', category: null },
        { id: 'e4', title: 'Church picnic', event_date: day(30), location: 'Park', series_id: null, category: 'social' },
      ],
      inventory_items: [{ id: 'k1', name: 'Wireless mic pack', asset_tag: 'MED-014', model: 'EW 100', brand: 'Sennheiser', category: 'Microphone', serial_number: 'SN99812', location: 'Cupboard A', department_id: 'media' }],
      guests: [{ id: 'gu1', name: 'Thomas', title: 'Pastor', note: 'Visiting from Kochi' }],
      service_templates: [{ id: 't1', name: 'Sunday morning' }],
      registration_events: [{ id: 'reg1', title: 'Youth camp', location_name: 'Lakeside', status: 'open' }],
      'rpc:people_contacts': [{ id: 'u1', email: 'grace@example.com', phone: '+44 7700 900123' }],
    }
  }
  const index = (opts = { contacts: true, volunteersOpen: true }) => fetchSearchIndex(opts)

  it('finds a person by both names in either order, without the accent, and through a slip', async () => {
    seed()
    const things = await index()
    expect(find('grace mensah', things)[0]).toBe('Grace Mensah')
    expect(find('mensah gr', things)[0]).toBe('Grace Mensah')
    expect(find('jose', things)[0]).toBe('José Núñez')
    expect(find('vargese', things)[0]).toBe('Sam Varghese')
    // Somebody with no name yet is nobody to find.
    expect(things.some((t) => t.id === 'person-u4')).toBe(false)
  })

  it('says which teams somebody is on, and opens Volunteers on them', async () => {
    seed()
    const grace = (await index()).find((t) => t.id === 'person-u1')!
    expect(grace.detail).toBe('Media · Worship')
    expect(grace.to).toBe('/volunteers?q=Grace%20Mensah')
    expect(find('grace media', await index())[0]).toBe('Grace Mensah')
  })

  it('finds a person by email or telephone only for somebody who holds those', async () => {
    seed()
    expect(find('grace@example.com', await index())[0]).toBe('Grace Mensah')
    expect(find('07700 900123', await index())[0]).toBe('Grace Mensah')
    tables.asked = []
    const without = await index({ contacts: false, volunteersOpen: true })
    expect(find('07700 900123', without)).toEqual([])
    expect(find('example.com', without)).toEqual([])
  })

  it('sends somebody who cannot open Volunteers to a team the person is on, and leaves guests out', async () => {
    seed()
    const things = await index({ contacts: false, volunteersOpen: false })
    expect(things.find((t) => t.id === 'person-u1')!.to).toBe('/departments/media')
    // On no team, there is nowhere this person could be shown them.
    expect(things.some((t) => t.id === 'person-u3')).toBe(false)
    expect(things.some((t) => t.kind === 'Guest')).toBe(false)
  })

  it('lists a weekly event once, for the next time it happens', async () => {
    seed()
    const things = await index()
    const prayer = things.filter((t) => t.kind === 'Event' && t.label === 'Prayer meeting')
    expect(prayer).toHaveLength(1)
    expect(prayer[0].id).toBe('event-e2')
    // And a session that is in every service, for the next service.
    const worship = things.filter((t) => t.kind === 'Session' && t.label === 'Worship')
    expect(worship).toHaveLength(1)
    expect(worship[0].to).toBe('/service-planner/s-next')
    expect(worship[0].detail).toMatch(/and 1 more/)
  })

  it('finds a service by its day as people type it, the next one first', async () => {
    seed()
    const things = await index()
    const next = new Date(`${day(7)}T12:00:00`)
    const typed = `${next.getDate()} ${next.toLocaleDateString('en-GB', { month: 'long' }).slice(0, 3)}`
    expect(arrange(matchThings(typed, things))[0].hits[0].id).toBe('service-s-next')
    const english = arrange(matchThings('english', things)).find((g) => g.kind === 'Service')!
    expect(english.hits.map((h) => h.id)).toEqual(['service-s-next', 's-past'].map((id) => (id.startsWith('service') ? id : `service-${id}`)))
  })

  it('finds kit by its tag, its serial number and where it is kept, and opens the register on it', async () => {
    seed()
    const things = await index()
    for (const typed of ['MED-014', 'sn99812', 'sennheiser', 'cupboard', 'wireles mic']) expect(find(typed, things), typed).toContain('Wireless mic pack')
    expect(things.find((t) => t.id === 'kit-k1')!.to).toBe('/inventory/media?item=k1')
  })

  it('finds a song in the library, and one that is only on a set list where it is being sung', async () => {
    seed()
    const things = await index()
    const goodness = things.filter((t) => t.label === 'Goodness of God')
    expect(goodness).toHaveLength(1)
    expect(goodness[0].to).toBe('/songs?q=Goodness%20of%20God')
    expect(things.find((t) => t.label === 'Way Maker')!.to).toBe('/set-lists?service=s-next')
  })

  it('finds guests, roles, templates and event registrations too', async () => {
    seed()
    const things = await index()
    expect(find('pastor thomas', things)[0]).toBe('Pastor Thomas')
    expect(find('camera', things)[0]).toBe('Camera')
    expect(find('sunday morn', things)).toContain('Sunday morning')
    expect(things.find((t) => t.label === 'Youth camp')!.to).toBe('/registrations/reg1')
  })

  it('still finds the rest when one kind is refused', async () => {
    seed()
    tables.refuse = new Set(['inventory_items', 'guests'])
    const things = await index()
    expect(things.some((t) => t.kind === 'Equipment')).toBe(false)
    expect(find('grace', things)[0]).toBe('Grace Mensah')
  })
})

describe('things somebody wrote', () => {
  it('asks for every word typed, each made plain before it goes into a filter', async () => {
    tables.rows = { messages: [{ id: 'm1', body: 'The projector bulb needs replacing before Sunday', created_at: new Date().toISOString() }] }
    const hits = await searchWritten('projector bulb')
    const messages = tables.asked.find((a) => a.table === 'messages')!
    expect(messages.ors).toEqual(['body.ilike."%projector%"', 'body.ilike."%bulb%"'])
    expect(hits.find((h) => h.kind === 'Message')!.label).toContain('projector bulb')
    const updates = tables.asked.find((a) => a.table === 'church_updates')!
    expect(updates.ors[0]).toBe('title.ilike."%projector%",body.ilike."%projector%"')
  })

  it('cannot be broken, or widened, by what is typed', () => {
    // A comma or a bracket ended the value early and broke the request for every kind at once.
    expect(wordFilter(['body'], 'a,b')).toBe('body.ilike."%a,b%"')
    expect(wordFilter(['body'], 'x)')).toBe('body.ilike."%x)%"')
    // % and _ are wildcards to LIKE, and a quote ends the value: each is made a plain character.
    expect(wordFilter(['body'], '100%')).toBe('body.ilike."%100\\\\%%"')
    expect(wordFilter(['body'], 'a_b')).toBe('body.ilike."%a\\\\_b%"')
    expect(wordFilter(['body'], 'say "hi"')).toBe('body.ilike."%say \\"hi\\"%"')
    expect(textWords('  the   projector  ')).toEqual(['the', 'projector'])
    expect(textWords('a b c d e f g')).toHaveLength(5)
  })

  it('opens the team’s own room for a line of chat, and the service’s issues for an issue', async () => {
    tables.rows = {
      team_messages: [{ id: 'c1', body: 'cables are in the blue box', department_id: 'media', created_at: new Date().toISOString() }],
      service_issues: [{ id: 'i1', title: 'Cable fault', details: 'Left channel dropped out', service_id: 's1', created_at: new Date().toISOString() }],
      songs: [{ id: 'g1', title: 'Way Maker', lyrics: 'You are here, moving in our midst' }],
    }
    const hits = await searchWritten('cable')
    expect(hits.find((h) => h.kind === 'Team chat')!.to).toBe('/team-chat?team=media')
    expect(hits.find((h) => h.kind === 'Issue')!.to).toBe('/issues?service=s1')
    // A line of a song finds the song, under the same name as its title would.
    expect(hits.find((h) => h.kind === 'Song')!.id).toBe('song-g1')
  })

  it('puts what was written below a thing whose name was typed', async () => {
    tables.rows = { messages: [{ id: 'm1', body: 'Media team, please arrive early', created_at: new Date().toISOString() }] }
    const written = await searchWritten('media')
    const named = matchThings('media', [{ id: 'team-media', kind: 'Team', label: 'Media', detail: 'Team', to: '/departments/media', page: '/departments' }])
    expect(arrange([...written, ...named])[0].kind).toBe('Team')
  })
})

describe('the results as they are listed', () => {
  const hit = (id: string, kind: Hit['kind'], score: number, extra: Partial<Hit> = {}): Hit => ({ id, kind, label: id, detail: '', to: '/', page: '/', score, ...extra })

  it('lists the kind with the best match first, the best of each kind first, and a few of each', () => {
    const many = Array.from({ length: 9 }, (_, i) => hit(`p${i}`, 'Person', 1 + i / 10))
    const groups = arrange([hit('page', 'Page', 2.5), ...many, hit('team', 'Team', 3.5)])
    expect(groups.map((g) => g.heading)).toEqual(['Teams', 'Pages', 'People'])
    expect(groups[2].hits).toHaveLength(PER_KIND)
    expect(groups[2].hits[0].id).toBe('p8')
  })

  it('lists a thing once however many ways it was found, at its best', () => {
    const groups = arrange([hit('song-1', 'Song', 0.4), hit('song-1', 'Song', 3)])
    expect(groups).toHaveLength(1)
    expect(groups[0].hits).toHaveLength(1)
    expect(groups[0].hits[0].score).toBe(3)
  })

  it('breaks a tie by the nearest day to come, then the most recent gone', () => {
    const groups = arrange(
      [hit('last-month', 'Service', 1, { day: '2026-10-25' }), hit('next-month', 'Service', 1, { day: '2026-12-27' }), hit('next-week', 'Service', 1, { day: '2026-12-06' }), hit('last-week', 'Service', 1, { day: '2026-11-22' })],
      '2026-11-26',
    )
    expect(groups[0].hits.map((h) => h.id)).toEqual(['next-week', 'next-month', 'last-week', 'last-month'])
  })

  it('has a heading for every kind', () => {
    for (const heading of Object.values(KIND_HEADING)) expect(heading.length).toBeGreaterThan(0)
  })
})

describe('what was chosen lately', () => {
  const page: Thing = { id: 'page-/rota', kind: 'Page', label: 'Team Rota', detail: 'Who is doing what', to: '/rota', page: '/rota', also: 'secret words' }

  it('keeps the last few, newest first, each once, and nothing that is not shown', () => {
    rememberThing(page)
    rememberThing({ ...page, id: 'team-media', kind: 'Team', label: 'Media' })
    rememberThing(page)
    expect(recentThings().map((t) => t.id)).toEqual(['page-/rota', 'team-media'])
    expect(localStorage.getItem('rim-search-recent')).not.toContain('secret words')
    for (let i = 0; i < 10; i += 1) rememberThing({ ...page, id: `p${i}` })
    expect(recentThings()).toHaveLength(6)
  })

  it('never keeps a line somebody wrote', () => {
    rememberThing({ id: 'message-1', kind: 'Message', label: 'Something private said to a team', detail: '', to: '/messages', page: '/messages' })
    expect(recentThings()).toEqual([])
  })

  it('is forgotten on asking, and reads as nothing when what is stored is not its own', () => {
    rememberThing(page)
    forgetRecent()
    expect(recentThings()).toEqual([])
    localStorage.setItem('rim-search-recent', '{not json')
    expect(recentThings()).toEqual([])
    localStorage.setItem('rim-search-recent', JSON.stringify([{ id: 'x', kind: 'Nonsense', label: 'x', detail: '', to: '/', page: '/' }]))
    expect(recentThings()).toEqual([])
  })
})
