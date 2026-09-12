import { describe, expect, it } from 'vitest'
import { alreadyOnTheRoll, guestLabel, pickable, type Guest } from './guests'

const guest = (over: Partial<Guest> = {}): Guest => ({
  id: 'g1',
  name: 'Godlee Cherian',
  title: null,
  note: null,
  became_member: null,
  ...over,
})

describe('how a guest is written', () => {
  /*
   * "Pastor Godlee" is not "Godlee" with a label stuck on it — the
   * designation is part of how a church says the name, so it is printed
   * in front of it.
   */
  it('puts the designation in front of the name', () => {
    expect(guestLabel(guest({ title: 'Pastor' }))).toBe('Pastor Godlee Cherian')
    expect(guestLabel(guest({ title: 'Ps' }))).toBe('Ps Godlee Cherian')
  })

  it('is just the name when there is no designation', () => {
    expect(guestLabel(guest())).toBe('Godlee Cherian')
    expect(guestLabel(guest({ title: '   ' }))).toBe('Godlee Cherian')
  })
})

describe('who the pickers offer', () => {
  it('leaves out anybody who has since joined', () => {
    // Otherwise the same person is in the list twice — once as a member,
    // once as the guest they used to be — and a rota gets half assigned
    // to the half that no longer means anything.
    const roll = [guest(), guest({ id: 'g2', name: 'Sam', became_member: 'profile-1' })]
    expect(pickable(roll).map((g) => g.name)).toEqual(['Godlee Cherian'])
  })
})

describe('recognising a name already on the roll', () => {
  /*
   * The duplicates this whole change exists for: "Sam" typed again next
   * month made a second Sam, because nothing was looking.
   */
  it('matches whatever the hurry of the moment capitalised', () => {
    const roll = [guest({ name: 'Sam' })]
    expect(alreadyOnTheRoll(roll, 'sam')?.name).toBe('Sam')
    expect(alreadyOnTheRoll(roll, '  SAM  ')?.name).toBe('Sam')
  })

  it('does not pretend two different people are one', () => {
    // "Ps Sam" and "Sam" stay two rows: nothing here knows they are the
    // same man, and guessing that they are loses one of them.
    const roll = [guest({ name: 'Sam' })]
    expect(alreadyOnTheRoll(roll, 'Ps Sam')).toBeNull()
  })
})
