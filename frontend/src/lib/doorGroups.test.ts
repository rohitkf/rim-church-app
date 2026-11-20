import { describe, expect, it } from 'vitest'
import { doorGroups } from './doorGroups'

const now = new Date('2026-11-21T10:30:00')
const o = (name: string, over: Partial<{ status: 'confirmed' | 'cancelled'; checked_in_at: string | null }> = {}) => ({
  id: name,
  name,
  status: 'confirmed' as const,
  checked_in_at: null as string | null,
  ...over,
})
const names = (list: { name: string }[]) => list.map((x) => x.name)

describe('Reception’s list, in the order the door needs it', () => {
  const orders = [
    o('Zed Waiting'),
    o('Ama In Early', { checked_in_at: '2026-11-21T09:05:00' }),
    o('Hana Cancelled', { status: 'cancelled' }),
    o('Ben Waiting'),
    o('Kofi In Late', { checked_in_at: '2026-11-21T10:20:00' }),
    o('Efua Here Yesterday', { checked_in_at: '2026-11-20T18:40:00' }),
    o('Ife Cancelled After Coming', { status: 'cancelled', checked_in_at: '2026-11-21T09:00:00' }),
  ]
  const groups = doorGroups(orders, now)

  it('puts whoever is still to check in first, by name', () => {
    expect(names(groups.waiting)).toEqual(['Ben Waiting', 'Efua Here Yesterday', 'Zed Waiting'])
  })

  it('counts somebody checked in on another day as still to check in today', () => {
    expect(names(groups.waiting)).toContain('Efua Here Yesterday')
    expect(names(groups.checkedIn)).not.toContain('Efua Here Yesterday')
  })

  it('keeps today’s check-ins apart, the latest first — the one just pressed is at the top', () => {
    expect(names(groups.checkedIn)).toEqual(['Kofi In Late', 'Ama In Early'])
  })

  it('keeps cancelled registrations apart from both, whatever else they were', () => {
    expect(names(groups.cancelled)).toEqual(['Hana Cancelled', 'Ife Cancelled After Coming'])
  })

  it('loses nobody and repeats nobody', () => {
    const all = [...groups.waiting, ...groups.checkedIn, ...groups.cancelled]
    expect(all).toHaveLength(orders.length)
    expect(new Set(names(all)).size).toBe(orders.length)
  })

  it('has empty groups for an empty list', () => {
    expect(doorGroups([], now)).toEqual({ waiting: [], checkedIn: [], cancelled: [] })
  })
})
