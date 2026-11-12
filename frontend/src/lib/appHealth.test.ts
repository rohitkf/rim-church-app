import { describe, expect, it } from 'vitest'
import {
  HEALTH_KEPT_DAYS,
  agoWords,
  bytesWords,
  clientErrorSchema,
  deviceWords,
  errorReference,
  groupErrors,
  healthOverviewSchema,
  healthVerdict,
  jobsInOrder,
  ledgerWords,
  reporterName,
  sourceWords,
  timesWords,
  whoWords,
  type ClientError,
  type HealthJob,
} from './appHealth'
import { ERROR_SOURCES } from './clientErrors'
import migration from '../../../supabase/migrations/0284_the_app_says_when_something_broke.sql?raw'

/*
 * Settings › App Health (0284): reading back what went wrong. The
 * arithmetic is folding — six phones with one bug is one thing to look
 * at — and the rest is saying each thing in words.
 */

const row = (over: Partial<ClientError>): ClientError => ({
  id: '7f3k2q9a-0000-4000-8000-000000000000',
  created_at: '2026-11-12T09:00:00Z',
  last_at: '2026-11-12T09:00:00Z',
  times: 1,
  user_id: 'u1',
  source: 'page',
  message: 'TypeError: x is undefined',
  stack: null,
  page: '/rota',
  build: 'aaaaaaaaaaaa',
  device: null,
  installed: false,
  reporter: { first_name: 'Ada', last_name: 'Byron' },
  ...over,
})

describe('a report’s reference', () => {
  it('is the first eight of its id, as the database answered the page that broke', () => {
    expect(errorReference('7f3c2d9a-1b2c-4d5e-8f90-123456789abc')).toBe('7F3C2D9A')
    // What report_client_error() returns: upper(left(replace(id::text, '-', ''), 8)).
    expect(migration).toContain("return upper(left(replace(v_id::text, '-', ''), 8));")
  })
})

describe('folding the reports', () => {
  it('makes one thing of the same message on the same build, whoever it came from', () => {
    const groups = groupErrors([
      row({ id: 'a', user_id: 'u1', times: 3, last_at: '2026-11-12T10:00:00Z' }),
      row({ id: 'b', user_id: 'u2', times: 1, page: '/songs', source: 'boundary', created_at: '2026-11-11T08:00:00Z', last_at: '2026-11-11T08:00:00Z' }),
      row({ id: 'c', user_id: 'u1', times: 2, page: '/rota', last_at: '2026-11-12T11:00:00Z' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      message: 'TypeError: x is undefined',
      build: 'aaaaaaaaaaaa',
      times: 6,
      people: 2,
      visitors: false,
      firstAt: '2026-11-11T08:00:00Z',
      lastAt: '2026-11-12T11:00:00Z',
      pages: ['/rota', '/songs'],
      sources: ['page', 'boundary'],
    })
    expect(groups[0].rows.map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('keeps another build apart: a fix shows as the old one going quiet', () => {
    const groups = groupErrors([row({ id: 'a' }), row({ id: 'b', build: 'bbbbbbbbbbbb', last_at: '2026-11-13T09:00:00Z' }), row({ id: 'c', build: null })])
    expect(groups.map((g) => g.build)).toEqual(['bbbbbbbbbbbb', 'aaaaaaaaaaaa', null])
  })

  it('keeps another message apart, and puts the latest first', () => {
    const groups = groupErrors([row({ id: 'a', last_at: '2026-11-10T09:00:00Z' }), row({ id: 'b', message: 'PGRST202: no such function', last_at: '2026-11-12T09:00:00Z' })])
    expect(groups.map((g) => g.message)).toEqual(['PGRST202: no such function', 'TypeError: x is undefined'])
  })

  it('counts visitors apart from people: nobody can tell one from another', () => {
    const [group] = groupErrors([row({ id: 'a', user_id: null, reporter: null }), row({ id: 'b', user_id: null, reporter: null }), row({ id: 'c', user_id: 'u9' })])
    expect(group).toMatchObject({ people: 1, visitors: true })
    expect(whoWords(group)).toBe('1 person and visitors')
  })

  it('makes nothing of nothing', () => {
    expect(groupErrors([])).toEqual([])
  })
})

describe('the words', () => {
  it('for who', () => {
    expect(whoWords({ people: 3, visitors: false })).toBe('3 people')
    expect(whoWords({ people: 1, visitors: false })).toBe('1 person')
    expect(whoWords({ people: 0, visitors: true })).toBe('visitors')
  })

  it('for how often', () => {
    expect([timesWords(1), timesWords(2), timesWords(7), timesWords(1200)]).toEqual(['once', 'twice', '7 times', (1200).toLocaleString() + ' times'])
  })

  it('for who reported it', () => {
    expect(reporterName(row({}))).toBe('Ada Byron')
    expect(reporterName(row({ reporter: null }))).toBe('Somebody signed in')
    expect(reporterName(row({ user_id: null, reporter: null }))).toBe('A visitor, not signed in')
  })

  it('for every net there is, and one nobody has heard of as it came', () => {
    for (const source of ERROR_SOURCES) {
      expect(sourceWords(source), source).not.toBe(source)
    }
    expect(sourceWords('something-new')).toBe('something-new')
  })

  it('for a device, from what its browser called itself', () => {
    expect(deviceWords('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1 · 390×844')).toBe(
      'iPhone · Safari · 390×844',
    )
    expect(deviceWords('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36 · 412×915')).toBe('Android · Chrome · 412×915')
    expect(deviceWords('Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36')).toBe(
      'Android · Samsung Internet',
    )
    expect(deviceWords('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0')).toBe('Windows · Edge')
    expect(deviceWords('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0')).toBe('Mac · Firefox')
    expect(deviceWords('Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 Mobile/15E148 Safari/604.1')).toBe('iPad · Chrome')
    expect(deviceWords(null)).toBe('Unknown device')
    expect(deviceWords('something else entirely')).toBe('Unknown device')
  })

  it('for a size', () => {
    expect([bytesWords(37 * 1024 ** 2), bytesWords(1.5 * 1024 ** 3), bytesWords(2048), bytesWords(10)]).toEqual(['37 MB', '1.5 GB', '2 KB', '1 KB'])
  })

  it('for how long ago', () => {
    const now = new Date('2026-11-12T12:00:00Z').getTime()
    expect(agoWords('2026-11-12T11:59:50Z', now)).toBe('just now')
    expect(agoWords('2026-11-12T11:35:00Z', now)).toBe('25 min ago')
    expect(agoWords('2026-11-12T11:00:00Z', now)).toBe('1 hour ago')
    expect(agoWords('2026-11-12T05:00:00Z', now)).toBe('7 hours ago')
    expect(agoWords('2026-11-09T05:00:00Z', now)).toMatch(/9/)
    expect(agoWords('not a date', now)).toBe('')
  })
})

describe('the timed jobs', () => {
  const job = (over: Partial<HealthJob>): HealthJob => ({ name: 'a', schedule: '* * * * *', active: true, runs: 10, failed: 0, last_at: null, last_ok: true, ...over })

  it('put one that failed first, then one switched off, then one that has not run, then by name', () => {
    const order = jobsInOrder([job({ name: 'zebra' }), job({ name: 'quiet', runs: 0 }), job({ name: 'off', active: false }), job({ name: 'apple' }), job({ name: 'broken', failed: 2 })])
    expect(order.map((j) => j.name)).toEqual(['broken', 'off', 'quiet', 'apple', 'zebra'])
  })
})

describe('whether anything wants doing', () => {
  it('says all is well when nothing has', () => {
    expect(healthVerdict({ groups: 0, events: 0, jobsFailing: 0 })).toEqual({ tone: 'green', words: `Nothing has gone wrong in the last ${HEALTH_KEPT_DAYS} days that the app knows of.` })
  })

  it('counts what was said, in the singular and the plural', () => {
    expect(healthVerdict({ groups: 1, events: 0, jobsFailing: 0 }).words).toBe('1 kind of error from people’s devices.')
    expect(healthVerdict({ groups: 3, events: 2, jobsFailing: 0 })).toEqual({ tone: 'orange', words: '2 failures in the app’s own work, and 3 kinds of error from people’s devices.' })
  })

  it('does not count a failed job twice: the log and the hourly copy are the same failure', () => {
    expect(healthVerdict({ groups: 0, events: 1, jobsFailing: 1 }).words).toBe('1 failure in the app’s own work.')
    // The job failed in the last hour and the copy has not run yet.
    expect(healthVerdict({ groups: 0, events: 0, jobsFailing: 2 }).words).toBe('2 failures in the app’s own work.')
  })
})

describe('what the database sends', () => {
  it('a report as production answers it, a removed reporter and all', () => {
    const answer = {
      id: '0b7f1b1e-6d0f-4f6e-9a57-0a1d3f9a2c11',
      created_at: '2026-11-12T09:00:00.123456+00:00',
      last_at: '2026-11-12T09:05:00.123456+00:00',
      times: 2,
      user_id: null,
      source: 'query',
      message: 'PGRST202: Could not find the function public.new_thing in the schema cache',
      stack: null,
      page: '/ticket/…',
      build: '46269dac8f27',
      device: null,
      installed: null,
      reporter: null,
    }
    expect(clientErrorSchema.parse(answer)).toMatchObject({ times: 2, reporter: null })
    // An embed the API could not make out is nobody, not a failed page.
    expect(clientErrorSchema.parse({ ...answer, reporter: 'nonsense' }).reporter).toBeNull()
    const { reporter: _gone, ...without } = answer
    expect(clientErrorSchema.parse(without).reporter).toBeNull()
  })

  it('the overview, in the shape health_overview() builds', () => {
    const answer = {
      at: '2026-11-12T12:00:00+00:00',
      jobs: [{ name: 'apply-retention', schedule: '0 3 * * *', active: true, runs: 1, failed: 0, last_at: '2026-11-12T03:00:00+00:00', last_ok: true }],
      pushes: { asked: 3, answered: 1, failed: 2, hours: 6 },
      database: { bytes: 38797312, connections: 28, connections_max: 60 },
      errors: { day: 0, kept: 0 },
    }
    expect(healthOverviewSchema.parse(answer).jobs).toHaveLength(1)
    // Every key the app reads is one the function writes.
    for (const key of ["'at'", "'jobs'", "'pushes'", "'database'", "'errors'", "'asked'", "'answered'", "'failed'", "'hours'", "'bytes'", "'connections'", "'connections_max'", "'day'", "'kept'", "'last_ok'", "'last_at'", "'runs'", "'schedule'", "'active'", "'name'"]) {
      expect(migration, key).toContain(key)
    }
  })

  it('a job with nothing known about it still reads', () => {
    expect(healthOverviewSchema.parse({ at: 'x', jobs: [{ name: null, schedule: null, active: null, runs: 0, failed: 0, last_at: null, last_ok: null }], pushes: { asked: 0, answered: 0, failed: 0, hours: 6 }, database: { bytes: 1, connections: 1, connections_max: 1 }, errors: { day: 0, kept: 0 } }).jobs[0].runs).toBe(0)
  })

  it('is kept as long as the page says', () => {
    expect(migration).toContain(`interval '${HEALTH_KEPT_DAYS} days'`)
  })
})

describe('what the ledger says (0285)', () => {
  const at = (version: number, recorded = version) => ({ version, recorded, latest: `0${version}_x`, latest_at: null })

  it('says nothing for a database that keeps no ledger', () => {
    expect(ledgerWords(null, 285)).toBeNull()
    expect(healthOverviewSchema.parse({ at: 'x', jobs: [], pushes: { asked: 0, answered: 0, failed: 0, hours: 6 }, database: { bytes: 1, connections: 1, connections_max: 1 }, errors: { day: 0, kept: 0 } }).schema).toBeNull()
  })

  it('says the database is where the app needs it', () => {
    expect(ledgerWords(at(285), 285)).toEqual({ tone: 'green', words: 'The database is at migration 285, which is what this version of the app needs.' })
  })

  it('says ahead plainly: the database always goes first', () => {
    expect(ledgerWords(at(287), 285)).toEqual({ tone: 'green', words: 'The database is at migration 287, 2 ahead of what this version of the app needs.' })
  })

  it('warns when it is behind', () => {
    expect(ledgerWords(at(284), 285)).toEqual({
      tone: 'orange',
      words: 'The database is at migration 284; this version of the app needs 285. Anything new will not work until the rest are applied.',
    })
  })

  it('warns about migrations recorded after a gap, which do not count', () => {
    expect(ledgerWords(at(285, 287), 285)).toEqual({ tone: 'orange', words: 'The database is at migration 285, which is what this version of the app needs. 2 recorded after a gap do not count.' })
  })

  it('reads the overview with the ledger in it, as health_overview() builds it', () => {
    const answer = { at: 'x', jobs: [], pushes: { asked: 0, answered: 0, failed: 0, hours: 6 }, database: { bytes: 1, connections: 1, connections_max: 1 }, errors: { day: 0, kept: 0 },
      schema: { version: 285, recorded: 285, latest: '0285_the_database_says_which_migrations_it_has', latest_at: '2026-11-12T13:40:00+00:00' } }
    expect(healthOverviewSchema.parse(answer).schema?.version).toBe(285)
  })
})
