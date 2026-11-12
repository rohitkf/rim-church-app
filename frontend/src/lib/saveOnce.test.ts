import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ALREADY_SAVED,
  NOT_INSERTED_BY_THE_APP,
  REQUEST_KEY,
  SAVE_ONCE_FUNCTIONS,
  SAVE_ONCE_TABLES,
  UNSETTLED_FOR_MS,
  createIn,
  saveOnce,
} from './saveOnce'
import { RequestTimeoutError } from './fetchTimeout'
import clientSource from './supabaseClient.ts?raw'

/*
 * A save sent twice is carried out once (0286): what the layer under
 * every request changes, what it leaves alone, and that it only ever
 * treats a save as a repeat when the one before it never got an answer.
 */

const API = 'https://db.example/rest/v1'
const post = (body: unknown, extra: RequestInit = {}): RequestInit => ({
  method: 'POST',
  headers: { apikey: 'k', Authorization: 'Bearer t', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  ...extra,
})
const created = () => new Response(null, { status: 201 })
/**
 * What the database answers a signed-in person when a row's id is already
 * there. No `details`: with row security on it does not say which id (it
 * says so only to the table's owner), which is why the layer cannot look
 * for its own id in the answer. Taken from Postgres 17, November 2026.
 */
const duplicate = (table: string, details: string | null = null) =>
  new Response(JSON.stringify({ code: '23505', message: `duplicate key value violates unique constraint "${table}_pkey"`, details, hint: null }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  })

type Call = { url: string; init: RequestInit; body: unknown }
/** A server that answers what it is told to, and remembers what it was sent. */
function server(answers: Array<Response | Error | ((call: Call) => Response | Promise<Response>)>) {
  const calls: Call[] = []
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    let body: unknown
    try {
      body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    } catch {
      body = undefined
    }
    const call: Call = { url: String(input), init: init ?? {}, body }
    calls.push(call)
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)]
    if (answer instanceof Error) throw answer
    return typeof answer === 'function' ? answer(call) : answer.clone()
  })
  return { fetcher: fetcher as unknown as typeof fetch, calls }
}

let n = 0
let clock = 1_000_000
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const wrap = (fetcher: typeof fetch, storage: Storage | null = null) => saveOnce(fetcher, { storage, now: () => clock, makeId: ids })

beforeEach(() => {
  n = 0
  clock = 1_000_000
  window.sessionStorage.clear()
})

describe('what it leaves alone', () => {
  it('a read, an update, a delete', async () => {
    const { fetcher, calls } = server([new Response('[]', { status: 200 })])
    const send = wrap(fetcher)
    await send(`${API}/songs?select=*`, { method: 'GET' })
    await send(`${API}/songs?id=eq.1`, { method: 'PATCH', body: JSON.stringify({ title: 'x' }) })
    await send(`${API}/songs?id=eq.1`, { method: 'DELETE' })
    expect(calls.map((c) => c.init.body)).toEqual([undefined, '{"title":"x"}', undefined])
  })

  it('a table it does not look after, and a function that is not a create', async () => {
    const { fetcher, calls } = server([created()])
    const send = wrap(fetcher)
    await send(`${API}/push_subscriptions`, post({ endpoint: 'e' }))
    await send(`${API}/rpc/my_standing`, post({}))
    await send(`${API}/rpc/registration_order_mark`, post({ p_id: 'o', p_action: 'check_in' }))
    expect(calls.map((c) => c.body)).toEqual([{ endpoint: 'e' }, {}, { p_id: 'o', p_action: 'check_in' }])
  })

  it('an upsert: it already says what a repeat means', async () => {
    const { fetcher, calls } = server([created()])
    const send = wrap(fetcher)
    await send(`${API}/availability?on_conflict=user_id,service_id`, post({ user_id: 'u', status: 'yes' }))
    await send(`${API}/availability`, post({ user_id: 'u', status: 'yes' }, { headers: { Prefer: 'resolution=merge-duplicates' } }))
    expect(calls.every((c) => !('id' in (c.body as object)))).toBe(true)
  })

  it('a create that names its own id', async () => {
    const { fetcher, calls } = server([created()])
    await wrap(fetcher)(`${API}/registration_ticket_types`, post({ id: 'mine', name: 'Adult' }))
    expect(calls[0].body).toEqual({ id: 'mine', name: 'Adult' })
  })

  it('a call that already carries a key', async () => {
    const { fetcher, calls } = server([created()])
    await wrap(fetcher)(`${API}/rpc/submit_feedback`, post({ p_kind: 'bug', p_body: 'x', [REQUEST_KEY]: 'theirs' }))
    expect(calls[0].body).toMatchObject({ [REQUEST_KEY]: 'theirs' })
  })

  it('anything that is not an address and its options, or not JSON', async () => {
    const { fetcher, calls } = server([created()])
    const send = wrap(fetcher)
    await send(new Request(`${API}/songs`, { method: 'POST', body: '{"title":"x"}' }))
    await send(`${API}/songs`, { method: 'POST', body: 'not json' })
    await send('https://db.example/storage/v1/object/handbooks/a.pdf', { method: 'POST', body: '{"a":1}' })
    expect(calls).toHaveLength(3)
    expect(calls[1].init.body).toBe('not json')
  })

  it('knows a create when it sees one', () => {
    expect(createIn(`${API}/songs`, post({ title: 'x' }))?.kind).toEqual({ what: 'insert', table: 'songs' })
    expect(createIn(`${API}/rpc/send_announcement`, post({ message: 'x', audience: 'everyone' }))?.kind).toEqual({ what: 'call', fn: 'send_announcement' })
    expect(createIn(`${API}/songs`, { method: 'GET' })).toBeNull()
    expect(createIn(`${API}/songs`, post([]))).toBeNull()
    expect(createIn(`${API}/songs`, post(['not a row']))).toBeNull()
    expect(createIn('not an address', post({ title: 'x' }))).toBeNull()
  })
})

describe('a row the app inserts', () => {
  it('is given an id before it is sent', async () => {
    const { fetcher, calls } = server([created()])
    await wrap(fetcher)(`${API}/songs`, post({ title: 'Amazing Grace' }))
    expect(calls[0].body).toEqual({ title: 'Amazing Grace', id: '00000000-0000-4000-8000-000000000001' })
  })

  it('keeps its shape: several rows stay several, each with its own id, and the columns named gain one', async () => {
    const { fetcher, calls } = server([created()])
    await wrap(fetcher)(`${API}/stage_blocks?columns=${encodeURIComponent('"layout_id","label"')}`, post([{ layout_id: 'l', label: 'A' }, { layout_id: 'l', label: 'B' }]))
    expect(calls[0].body).toEqual([
      { layout_id: 'l', label: 'A', id: '00000000-0000-4000-8000-000000000001' },
      { layout_id: 'l', label: 'B', id: '00000000-0000-4000-8000-000000000002' },
    ])
    expect(new URL(calls[0].url).searchParams.get('columns')).toBe('"layout_id","label","id"')
  })

  it('treats an id of nothing as no id', async () => {
    const { fetcher, calls } = server([created()])
    await wrap(fetcher)(`${API}/songs`, post({ id: null, title: 'x' }))
    expect((calls[0].body as { id: string }).id).toBe('00000000-0000-4000-8000-000000000001')
  })

  it('passes the answer through, and the headers and signal it was given', async () => {
    const { fetcher, calls } = server([new Response('{"id":"x"}', { status: 201 })])
    const signal = new AbortController().signal
    const res = await wrap(fetcher)(`${API}/songs?select=id`, post({ title: 'x' }, { signal, headers: { Prefer: 'return=representation', apikey: 'k' } }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'x' })
    expect(calls[0].init.signal).toBe(signal)
    expect(new Headers(calls[0].init.headers).get('Prefer')).toBe('return=representation')
  })
})

describe('two saves that are the same on purpose', () => {
  it('are two saves, with two ids, when the first was answered', async () => {
    const { fetcher, calls } = server([created()])
    const send = wrap(fetcher)
    await send(`${API}/team_messages`, post({ body: 'ok' }))
    await send(`${API}/team_messages`, post({ body: 'ok' }))
    expect(calls.map((c) => (c.body as { id: string }).id)).toEqual(['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'])
  })

  it('are two saves when the first was refused: a no is an answer', async () => {
    const refused = new Response(JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }), { status: 403 })
    const { fetcher, calls } = server([refused, created()])
    const send = wrap(fetcher)
    expect((await send(`${API}/songs`, post({ title: 'x' }))).status).toBe(403)
    await send(`${API}/songs`, post({ title: 'x' }))
    expect((calls[0].body as { id: string }).id).not.toBe((calls[1].body as { id: string }).id)
  })
})

describe('a save whose answer never came', () => {
  it('fails as it always did', async () => {
    const { fetcher } = server([new RequestTimeoutError()])
    await expect(wrap(fetcher)(`${API}/songs`, post({ title: 'x' }))).rejects.toBeInstanceOf(RequestTimeoutError)
  })

  it('is sent again with the same id', async () => {
    const { fetcher, calls } = server([new TypeError('Failed to fetch'), created()])
    const send = wrap(fetcher)
    await expect(send(`${API}/songs`, post({ title: 'x' }))).rejects.toThrow()
    await send(`${API}/songs`, post({ title: 'x' }))
    expect((calls[1].body as { id: string }).id).toBe((calls[0].body as { id: string }).id)
  })

  it('reads the duplicate that comes back as what it is: already saved', async () => {
    const { fetcher } = server([new RequestTimeoutError(), duplicate('songs')])
    const send = wrap(fetcher)
    await expect(send(`${API}/songs`, post({ title: 'x' }))).rejects.toThrow()
    const res = await send(`${API}/songs`, post({ title: 'x' }))
    expect(res.status).toBe(201)
    expect(res.ok).toBe(true)
  })

  it('hands the row back when the caller asked for it, as if it had just been made', async () => {
    const id = '00000000-0000-4000-8000-000000000001'
    const row = { id, title: 'x' }
    const { fetcher, calls } = server([new RequestTimeoutError(), duplicate('songs'), new Response(JSON.stringify(row), { status: 200, headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } })])
    const send = wrap(fetcher)
    const asking = () => post({ title: 'x' }, { headers: { apikey: 'k', Authorization: 'Bearer t', 'Content-Type': 'application/json', Prefer: 'return=representation', Accept: 'application/vnd.pgrst.object+json' } })
    await expect(send(`${API}/songs?select=id,title`, asking())).rejects.toThrow()
    const res = await send(`${API}/songs?select=id,title`, asking())
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(row)
    // It read exactly that row, as the same person, the way the caller asked for it.
    const read = calls[2]
    expect(read.init.method).toBe('GET')
    const at = new URL(read.url)
    expect(at.pathname).toBe('/rest/v1/songs')
    expect(at.searchParams.get('id')).toBe(`in.(${id})`)
    expect(at.searchParams.get('select')).toBe('id,title')
    const headers = new Headers(read.init.headers)
    expect(headers.get('Authorization')).toBe('Bearer t')
    expect(headers.get('Accept')).toBe('application/vnd.pgrst.object+json')
    expect(headers.get('Prefer')).toBeNull()
  })

  it('says it was already saved, in words, when the row cannot be read back', async () => {
    const { fetcher } = server([new RequestTimeoutError(), duplicate('songs'), new Response('{}', { status: 500 })])
    const send = wrap(fetcher)
    const asking = () => post({ title: 'x' }, { headers: { Prefer: 'return=representation' } })
    await expect(send(`${API}/songs`, asking())).rejects.toThrow()
    const res = await send(`${API}/songs`, asking())
    expect(res.status).toBe(409)
    // P0001 is how a sentence written for people arrives; lib/humanError shows it as it is.
    expect(await res.json()).toMatchObject({ code: 'P0001', message: ALREADY_SAVED })
  })

  it('a gateway that gave up is no answer either', async () => {
    for (const status of [502, 503, 504, 522]) {
      n = 0
      const { fetcher, calls } = server([new Response('upstream timed out', { status }), created()])
      const send = wrap(fetcher)
      expect((await send(`${API}/songs`, post({ title: 'x' }))).status).toBe(status)
      await send(`${API}/songs`, post({ title: 'x' }))
      expect((calls[1].body as { id: string }).id, String(status)).toBe((calls[0].body as { id: string }).id)
    }
  })

  it('is forgotten once an answer comes, so the save after that is a new one', async () => {
    const { fetcher, calls } = server([new TypeError('Failed to fetch'), created(), created()])
    const send = wrap(fetcher)
    await expect(send(`${API}/songs`, post({ title: 'x' }))).rejects.toThrow()
    await send(`${API}/songs`, post({ title: 'x' }))
    await send(`${API}/songs`, post({ title: 'x' }))
    const sent = calls.map((c) => (c.body as { id: string }).id)
    expect(sent[1]).toBe(sent[0])
    expect(sent[2]).not.toBe(sent[0])
  })

  it('is forgotten after ten minutes: by then it is a new save', async () => {
    const { fetcher, calls } = server([new TypeError('Failed to fetch'), created()])
    const send = wrap(fetcher)
    await expect(send(`${API}/songs`, post({ title: 'x' }))).rejects.toThrow()
    clock += UNSETTLED_FOR_MS + 1
    await send(`${API}/songs`, post({ title: 'x' }))
    expect((calls[1].body as { id: string }).id).not.toBe((calls[0].body as { id: string }).id)
  })

  it('is its own save: a different one sent meanwhile gets its own id', async () => {
    const { fetcher, calls } = server([new TypeError('Failed to fetch'), created()])
    const send = wrap(fetcher)
    await expect(send(`${API}/songs`, post({ title: 'x' }))).rejects.toThrow()
    await send(`${API}/songs`, post({ title: 'y' }))
    expect((calls[1].body as { id: string }).id).not.toBe((calls[0].body as { id: string }).id)
  })

  it('several rows are sent again with the same ids, each its own', async () => {
    const { fetcher, calls } = server([new TypeError('Failed to fetch'), created()])
    const send = wrap(fetcher)
    const rows = [{ label: 'A' }, { label: 'B' }, { label: 'C' }]
    await expect(send(`${API}/stage_blocks`, post(rows))).rejects.toThrow()
    await send(`${API}/stage_blocks`, post(rows))
    expect(calls[1].body).toEqual(calls[0].body)
    expect(new Set((calls[0].body as { id: string }[]).map((r) => r.id)).size).toBe(3)
  })

  it('is remembered across a reload of the page', async () => {
    const first = server([new TypeError('Failed to fetch')])
    await expect(wrap(first.fetcher, window.sessionStorage)(`${API}/songs`, post({ title: 'x' }))).rejects.toThrow()
    // The page is loaded afresh: a new wrapper, the same tab.
    const second = server([created()])
    await wrap(second.fetcher, window.sessionStorage)(`${API}/songs`, post({ title: 'x' }))
    expect((second.calls[0].body as { id: string }).id).toBe((first.calls[0].body as { id: string }).id)
  })

  it('works with storage that will not be read or written', async () => {
    const broken = { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') }, removeItem: () => { throw new Error('no') } } as unknown as Storage
    const { fetcher, calls } = server([new TypeError('Failed to fetch'), created()])
    const send = wrap(fetcher, broken)
    await expect(send(`${API}/songs`, post({ title: 'x' }))).rejects.toThrow()
    await send(`${API}/songs`, post({ title: 'x' }))
    expect((calls[1].body as { id: string }).id).toBe((calls[0].body as { id: string }).id)
  })

  it('reads it the same when the database does say which id, as it does to the table’s owner', async () => {
    const { fetcher } = server([new RequestTimeoutError(), duplicate('songs', 'Key (id)=(00000000-0000-4000-8000-000000000001) already exists.')])
    const send = wrap(fetcher)
    await expect(send(`${API}/songs`, post({ title: 'x' }))).rejects.toThrow()
    expect((await send(`${API}/songs`, post({ title: 'x' }))).status).toBe(201)
  })

  it('hands several rows back in the order they were sent, whatever order they are read in', async () => {
    const a = '00000000-0000-4000-8000-000000000001'
    const b = '00000000-0000-4000-8000-000000000002'
    const read = new Response(JSON.stringify([{ id: b, label: 'B' }, { id: a, label: 'A' }]), { status: 200 })
    const { fetcher } = server([new RequestTimeoutError(), duplicate('stage_blocks'), read])
    const send = wrap(fetcher)
    const asking = () => post([{ label: 'A' }, { label: 'B' }], { headers: { Prefer: 'return=representation' } })
    await expect(send(`${API}/stage_blocks?select=*`, asking())).rejects.toThrow()
    const res = await send(`${API}/stage_blocks?select=*`, asking())
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual([{ id: a, label: 'A' }, { id: b, label: 'B' }])
  })

  it('says it in words when fewer rows can be read than were made', async () => {
    const { fetcher } = server([new RequestTimeoutError(), duplicate('stage_blocks'), new Response('[]', { status: 200 })])
    const send = wrap(fetcher)
    const asking = () => post([{ label: 'A' }, { label: 'B' }], { headers: { Prefer: 'return=representation' } })
    await expect(send(`${API}/stage_blocks`, asking())).rejects.toThrow()
    const res = await send(`${API}/stage_blocks`, asking())
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'P0001', message: ALREADY_SAVED })
  })

  it('does not mistake another duplicate for its own: a rule of the table’s is still a refusal', async () => {
    const natural = new Response(JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint "departments_name_key"', details: null }), { status: 409 })
    const { fetcher } = server([new TypeError('Failed to fetch'), natural])
    const send = wrap(fetcher)
    await expect(send(`${API}/departments`, post({ name: 'Media' }))).rejects.toThrow()
    const res = await send(`${API}/departments`, post({ name: 'Media' }))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: '23505' })
  })

  it('nor another table’s key: a row a trigger writes elsewhere is not this save', async () => {
    const { fetcher } = server([new TypeError('Failed to fetch'), duplicate('activity')])
    const send = wrap(fetcher)
    await expect(send(`${API}/songs`, post({ title: 'x' }))).rejects.toThrow()
    expect((await send(`${API}/songs`, post({ title: 'x' }))).status).toBe(409)
  })

  it('a duplicate on a first try is a refusal: only a retry can be its own earlier copy', async () => {
    const { fetcher } = server([duplicate('songs')])
    expect((await wrap(fetcher)(`${API}/songs`, post({ title: 'x' }))).status).toBe(409)
  })
})

describe('two the same at once', () => {
  it('go out as one request, and both get the answer', async () => {
    let answer: (res: Response) => void = () => {}
    const { fetcher, calls } = server([() => new Promise<Response>((resolve) => (answer = resolve))])
    const send = wrap(fetcher)
    const first = send(`${API}/songs`, post({ title: 'x' }, { headers: { Prefer: 'return=representation' } }))
    const second = send(`${API}/songs`, post({ title: 'x' }, { headers: { Prefer: 'return=representation' } }))
    await Promise.resolve()
    expect(calls).toHaveLength(1)
    answer(new Response('{"id":"made"}', { status: 201 }))
    const [a, b] = await Promise.all([first, second])
    expect(await a.json()).toEqual({ id: 'made' })
    expect(await b.json()).toEqual({ id: 'made' })
  })

  it('both fail when the one request fails', async () => {
    let fail: (error: Error) => void = () => {}
    const { fetcher, calls } = server([() => new Promise<Response>((_, reject) => (fail = reject))])
    const send = wrap(fetcher)
    const first = send(`${API}/songs`, post({ title: 'x' }))
    const second = send(`${API}/songs`, post({ title: 'x' }))
    await Promise.resolve()
    fail(new TypeError('Failed to fetch'))
    await expect(first).rejects.toThrow('Failed to fetch')
    await expect(second).rejects.toThrow('Failed to fetch')
    expect(calls).toHaveLength(1)
  })

  it('does not hold up a different save', async () => {
    const { fetcher, calls } = server([() => new Promise<Response>(() => {}), created()])
    const send = wrap(fetcher)
    void send(`${API}/songs`, post({ title: 'x' }))
    const other = await send(`${API}/songs`, post({ title: 'y' }))
    expect(other.status).toBe(201)
    expect(calls).toHaveLength(2)
  })

  it('once the first is answered, the next the same is a new save', async () => {
    const { fetcher, calls } = server([created()])
    const send = wrap(fetcher)
    await send(`${API}/songs`, post({ title: 'x' }))
    await send(`${API}/songs`, post({ title: 'x' }))
    expect(calls).toHaveLength(2)
  })
})

describe('a function that creates', () => {
  it('is sent with a key', async () => {
    const { fetcher, calls } = server([new Response('5', { status: 200 })])
    const res = await wrap(fetcher)(`${API}/rpc/send_announcement`, post({ message: 'Car park closed', audience: 'everyone' }))
    expect(calls[0].body).toEqual({ message: 'Car park closed', audience: 'everyone', [REQUEST_KEY]: '00000000-0000-4000-8000-000000000001' })
    expect(await res.json()).toBe(5)
  })

  it('is sent again with the same key when no answer came, and the database’s answer is passed on', async () => {
    const { fetcher, calls } = server([new RequestTimeoutError(), new Response('{"code":"ABCD"}', { status: 200 })])
    const send = wrap(fetcher)
    await expect(send(`${API}/rpc/registration_register`, post({ p_slug: 'harvest', p_order: { name: 'V' } }))).rejects.toThrow()
    const res = await send(`${API}/rpc/registration_register`, post({ p_slug: 'harvest', p_order: { name: 'V' } }))
    expect((calls[1].body as Record<string, unknown>)[REQUEST_KEY]).toBe((calls[0].body as Record<string, unknown>)[REQUEST_KEY])
    expect(await res.json()).toEqual({ code: 'ABCD' })
  })

  it('gets a new key when the one before was answered', async () => {
    const { fetcher, calls } = server([new Response('"id"', { status: 200 })])
    const send = wrap(fetcher)
    await send(`${API}/rpc/submit_feedback`, post({ p_kind: 'bug', p_body: 'x' }))
    await send(`${API}/rpc/submit_feedback`, post({ p_kind: 'bug', p_body: 'x' }))
    expect((calls[0].body as Record<string, unknown>)[REQUEST_KEY]).not.toBe((calls[1].body as Record<string, unknown>)[REQUEST_KEY])
  })

  it('two at once go out as one', async () => {
    let answer: (res: Response) => void = () => {}
    const { fetcher, calls } = server([() => new Promise<Response>((resolve) => (answer = resolve))])
    const send = wrap(fetcher)
    const both = [send(`${API}/rpc/alert_team`, post({ dept_id: 'd', message: 'm' })), send(`${API}/rpc/alert_team`, post({ dept_id: 'd', message: 'm' }))]
    await Promise.resolve()
    answer(new Response('3', { status: 200 }))
    expect(await Promise.all(both.map(async (p) => (await p).json()))).toEqual([3, 3])
    expect(calls).toHaveLength(1)
  })
})

describe('the lists', () => {
  const migrations = import.meta.glob('../../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const sql = Object.entries(migrations)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => text)
    .join('\n')

  /** Tables the migrations make with `id uuid primary key default gen_random_uuid()`, less the ones a later migration drops. */
  const made = new Set<string>()
  for (const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
    const idLine = m[2].split('\n').find((line) => /^\s*id\s+uuid\b/.test(line)) ?? ''
    if (idLine.includes('primary key') && idLine.includes('gen_random_uuid()')) made.add(m[1])
  }
  for (const m of sql.matchAll(/drop table (?:if exists )?public\.(\w+)/g)) made.delete(m[1])

  it('name only tables that are made with an id the app can choose', () => {
    expect([...SAVE_ONCE_TABLES].filter((t) => !made.has(t))).toEqual([])
  })

  it('leave no table out: one made that way is on one list or the other', () => {
    const neither = [...made].filter((t) => !SAVE_ONCE_TABLES.has(t) && !NOT_INSERTED_BY_THE_APP.has(t))
    expect(neither, 'a new table with that kind of id: add it to SAVE_ONCE_TABLES if the app inserts into it, to NOT_INSERTED_BY_THE_APP if only a function does').toEqual([])
    expect([...NOT_INSERTED_BY_THE_APP].filter((t) => !made.has(t))).toEqual([])
    expect([...SAVE_ONCE_TABLES].filter((t) => NOT_INSERTED_BY_THE_APP.has(t))).toEqual([])
  })

  it('are of tables whose key is still named after them: that name is how a repeat is known', () => {
    // A table made with `id uuid primary key` has a key called <table>_pkey, and keeps that name if it is renamed.
    const renamed = [...sql.matchAll(/alter table (?:if exists )?(?:only )?public\.(\w+)\s+rename to (\w+)/g)].flatMap((m) => [m[1], m[2]])
    expect([...SAVE_ONCE_TABLES].filter((t) => renamed.includes(t))).toEqual([])
    expect(sql).not.toMatch(/rename constraint \w+_pkey/)
  })

  it('name the functions the migration made repeat-safe, and no others', () => {
    const ledger = Object.entries(migrations).find(([path]) => path.includes('0286_'))?.[1] ?? ''
    const listed = /p\.proname = any \(array\[([\s\S]*?)\]\)/.exec(ledger)?.[1].match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1)) ?? []
    // A function made since is made repeat-safe by its own migration, by name.
    const since = [...sql.matchAll(/select public\.make_repeat_safe\('public\.(\w+)\(/g)].map((m) => m[1])
    expect(since).toContain('registration_contact')
    expect([...listed, ...since].sort()).toEqual([...SAVE_ONCE_FUNCTIONS].sort())
    expect(ledger).toContain(`(${REQUEST_KEY} uuid%s)`)
  })

  it('are used by a function the app really calls', () => {
    const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '!../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const all = Object.values(sources).join('\n')
    for (const fn of SAVE_ONCE_FUNCTIONS) expect(all.includes(`'${fn}'`), fn).toBe(true)
  })
})

describe('where it sits', () => {
  it('is outermost: it has to see the deadline pass, and the address before it is rerouted', () => {
    expect(clientSource).toContain('fetch: saveOnce(fetchWithTimeout(routedFetch(globalThis.fetch.bind(globalThis))))')
  })
})
