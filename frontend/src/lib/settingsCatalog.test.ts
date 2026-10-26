import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AppSettings } from './appSettings'
import { DISPLAY_DEFAULTS, readDisplay } from './display'
import { PAGE_RULES } from './pageAccess'
import { PERMISSIONS } from './permissionMatrix'
import { PAGE_ROOMS, SETTINGS_PAGES, capabilitiesFor, pageForSlug, pageSlug } from './pageSettings'
import {
  ALERTS,
  APP,
  BELL,
  SERVICE_PAGES,
  SERVICE_PAGES_REF,
  SETTINGS_CATALOG,
  columnsOf,
  pageName,
  settingsForPage,
} from './settingsCatalog'

/*
 * The catalog is the one place a setting is written down, and Page by
 * page is drawn from it — so what it leaves out, no page shows, and a
 * page it names wrongly files the setting nowhere.
 */

/** The settings-row columns that are not a setting of their own: the logo, the four objects, the colour, and one nothing reads. */
const NOT_A_ROW: (keyof AppSettings)[] = [
  'logo_url',
  'page_access',
  'display',
  'planner_controls',
  'overwatch_pages',
  'coordinator_color',
  'planner_upcoming_limit',
  // Lists of teams and people, edited in Settings › Clock in itself (0191).
  'clock_in_viewers',
  'clock_in_approver_teams',
]

const KNOWN_PAGES = new Set([...SETTINGS_PAGES.map((p) => p.to), SERVICE_PAGES_REF])

describe('the settings catalog', () => {
  it('names every column of the settings row that is a setting, once', () => {
    const ids = SETTINGS_CATALOG.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    const columns = new Set(columnsOf(SETTINGS_CATALOG))
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
      if (NOT_A_ROW.includes(key)) continue
      expect(columns.has(key), key).toBe(true)
    }
  })

  it('names every preference inside display', () => {
    const ids = new Set(SETTINGS_CATALOG.map((e) => e.id))
    const leaves = (prefix: string, value: unknown): string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value).flatMap(([k, v]) => leaves(`${prefix}.${k}`, v))
        : [prefix]
    for (const path of leaves('display', DISPLAY_DEFAULTS)) expect(ids.has(path), path).toBe(true)
  })

  it('files each setting under pages that exist, and says their names', () => {
    for (const entry of SETTINGS_CATALOG) {
      expect(entry.affects.length, entry.id).toBeGreaterThan(0)
      for (const ref of entry.affects) {
        expect(KNOWN_PAGES.has(ref), `${entry.id} → ${ref}`).toBe(true)
        expect(pageName(ref)).not.toBe(ref)
      }
    }
    expect(pageName('/rota')).toBe('Team Rota')
    expect(pageName(BELL)).toBe('Notifications')
    expect(pageName(SERVICE_PAGES_REF)).toBe('Every service page')
  })

  it('reads back what it writes, at every default', () => {
    for (const entry of SETTINGS_CATALOG) {
      const written = entry.put({}, entry.fallback as never)
      expect(entry.get(written), entry.id).toEqual(entry.fallback)
      // And a stored null is a value, not a gap to fill with the default.
      if (entry.kind === 'forever') expect(entry.get({ [entry.keys[0]]: null })).toBeNull()
    }
    const forever = SETTINGS_CATALOG.find((e) => e.id === 'team_chat_retention_days')!
    expect(forever.get({ team_chat_retention_days: null })).toBeNull()
    const closes = SETTINGS_CATALOG.find((e) => e.id === 'availability_closes_time')!
    expect(closes.get({ availability_closes_time: '22:30:00' })).toBe('22:30')
    expect(closes.put({}, '22:30' as never)).toEqual({ availability_closes_time: '22:30:00' })
    const panel = SETTINGS_CATALOG.find((e) => e.id === 'display.dashboard.show.activity')!
    expect(readDisplay(panel.put({}, false as never).display).dashboard.show.activity).toBe(false)
  })

  it('gives each page the settings that move it', () => {
    const rota = settingsForPage('/rota').map((e) => e.id)
    expect(rota).toEqual(
      expect.arrayContaining(['rota_window_days', 'always_show_my_services', 'lead_in_minutes', 'edit_grace_minutes', 'display.lists.upcomingOpen', 'service_retention_days']),
    )
    expect(rota).not.toContain('issue_open_minutes_before')
    expect(settingsForPage('/team-chat').map((e) => e.id)).toEqual(['team_chat_retention_days', 'overwatch_chat_posts'])
    expect(settingsForPage(BELL).map((e) => e.id)).toEqual(['notification_keep_count', 'notification_retention_days'])
    for (const page of SERVICE_PAGES) expect(settingsForPage(page).map((e) => e.id)).toContain('display.lists.finishedOpen')
  })
})

describe('Page by Page', () => {
  it('lists every page in the menu, Serving as its three tabs, and the three places that are not pages', () => {
    const tos = SETTINGS_PAGES.map((p) => p.to)
    expect(tos).toEqual(
      expect.arrayContaining(['/', '/service-planner', '/availability', '/rota', '/checklists', '/set-lists', '/debriefs', '/inventory', BELL, ALERTS, APP]),
    )
    expect(tos).not.toContain('/serving')
    expect(new Set(tos).size).toBe(tos.length)
  })

  it('gives every page something to set, and every rule a page', () => {
    for (const page of SETTINGS_PAGES) {
      const has =
        settingsForPage(page.to).length > 0 ||
        capabilitiesFor(PERMISSIONS, page.to).length > 0 ||
        !!PAGE_RULES[page.to] ||
        (PAGE_ROOMS[page.to] ?? []).length > 0
      expect(has, page.label).toBe(true)
    }
    // Every row of the grid lands on at least one page, so none is unreachable.
    const filed = new Set(SETTINGS_PAGES.flatMap((p) => capabilitiesFor(PERMISSIONS, p.to).flatMap((a) => a.capabilities.map((c) => c.action))))
    for (const c of PERMISSIONS.flatMap((a) => a.capabilities)) expect(filed.has(c.action), c.action).toBe(true)
    // And every page an area or a row names is one of these pages.
    for (const area of PERMISSIONS) {
      for (const ref of area.pages) expect(KNOWN_PAGES.has(ref), `${area.area} → ${ref}`).toBe(true)
      for (const c of area.capabilities) for (const ref of c.at ?? []) expect(KNOWN_PAGES.has(ref), `${c.action} → ${ref}`).toBe(true)
    }
  })

  it('files a row of a several-page area under its own page', () => {
    const chat = capabilitiesFor(PERMISSIONS, '/team-chat').flatMap((a) => a.capabilities.map((c) => c.key))
    expect(chat).toEqual(expect.arrayContaining(['msg.chat', 'msg.chat_moderate', 'msg.alert_team']))
    expect(chat).not.toContain('msg.board_post')
    const dashboard = capabilitiesFor(PERMISSIONS, '/').flatMap((a) => a.capabilities.map((c) => c.action))
    expect(dashboard).toEqual(['See the activity feed'])
    expect(capabilitiesFor(PERMISSIONS, '/events').flatMap((a) => a.capabilities.map((c) => c.key))).toContain('svc.events')
  })

  it('has an anchor per page', () => {
    expect(pageSlug('/')).toBe('dashboard')
    expect(pageSlug('/service-planner')).toBe('service-planner')
    expect(pageForSlug('rota')?.label).toBe('Team Rota')
    expect(pageForSlug('nowhere')).toBeUndefined()
  })
})
