import { describe, expect, it } from 'vitest'
import { nextSongOrder, safeSongLink, songLeaders, songsFor } from './setList'
import type { RotaAssignment, SetListItem } from './types'

const assignment = (over: Partial<RotaAssignment>): RotaAssignment =>
  ({
    id: 'a1',
    service_id: 's1',
    department_id: 'worship',
    user_id: 'u1',
    role_label: 'Worship Leader 1',
    role_id: null,
    profile: { id: 'u1', first_name: 'Grace', last_name: 'Mensah' },
    department: null,
    ...over,
  }) as RotaAssignment

const song = (over: Partial<SetListItem>): SetListItem =>
  ({
    id: 'i1',
    service_id: 's1',
    title: 'Goodness of God',
    led_by: null,
    link: null,
    lyrics: null,
    sort_order: 0,
    leader: null,
    ...over,
  }) as SetListItem

describe('songLeaders', () => {
  it('offers the worship team rostered for that service', () => {
    const rows = [
      assignment({ user_id: 'u1' }),
      assignment({
        id: 'a2',
        user_id: 'u2',
        role_label: 'Backing Vocal 1',
        profile: { id: 'u2', first_name: 'Ada', last_name: 'Bell' },
      }),
    ]
    expect(songLeaders(rows, 's1', 'worship').map((l) => l.name)).toEqual([
      'Ada Bell',
      'Grace Mensah',
    ])
  })

  it('offers backing vocals too, not only the roles called Worship Leader', () => {
    // A backing vocal takes the second verse often enough, and a list that
    // refused to admit it would send somebody back to a paper one.
    const rows = [assignment({ role_label: 'Backing Vocal 3' })]
    expect(songLeaders(rows, 's1', 'worship')).toHaveLength(1)
  })

  it('leaves out other teams and other services', () => {
    const rows = [
      assignment({ id: 'a2', department_id: 'media', user_id: 'u9' }),
      assignment({ id: 'a3', service_id: 's2', user_id: 'u8' }),
    ]
    expect(songLeaders(rows, 's1', 'worship')).toEqual([])
  })

  it('lists somebody down for two roles once', () => {
    const rows = [
      assignment({ role_label: 'Worship Leader 1' }),
      assignment({ id: 'a2', role_label: 'Keys 1' }),
    ]
    const leaders = songLeaders(rows, 's1', 'worship')
    expect(leaders).toHaveLength(1)
    expect(leaders[0].role).toBe('Worship Leader 1')
  })

  it('offers nobody when the church has no worship team flagged', () => {
    expect(songLeaders([assignment({})], 's1', null)).toEqual([])
  })
})

describe('safeSongLink', () => {
  it('takes a proper address as it is', () => {
    expect(safeSongLink('https://youtube.com/watch?v=abc')).toBe('https://youtube.com/watch?v=abc')
  })

  it('assumes https for what people actually paste', () => {
    expect(safeSongLink('youtube.com/watch?v=abc')).toBe('https://youtube.com/watch?v=abc')
  })

  it('refuses a script link outright', () => {
    // Typed by one person, read by the whole church.
    expect(safeSongLink('javascript:alert(1)')).toBeNull()
    expect(safeSongLink('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('leaves a note that is not an address alone', () => {
    expect(safeSongLink('ask Sarah for the chart')).toBeNull()
    expect(safeSongLink('   ')).toBeNull()
    expect(safeSongLink(null)).toBeNull()
  })
})

describe('songsFor and nextSongOrder', () => {
  it('reads a service’s songs in the order they are sung', () => {
    const items = [
      song({ id: 'b', sort_order: 2, title: 'Second' }),
      song({ id: 'a', sort_order: 1, title: 'First' }),
      song({ id: 'c', service_id: 's2', sort_order: 0, title: 'Another service' }),
    ]
    expect(songsFor(items, 's1').map((i) => i.title)).toEqual(['First', 'Second'])
  })

  it('puts a new song after the last one', () => {
    expect(nextSongOrder([song({ sort_order: 4 })], 's1')).toBe(5)
    expect(nextSongOrder([], 's1')).toBe(0)
  })
})
