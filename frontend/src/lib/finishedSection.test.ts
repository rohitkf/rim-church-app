import { describe, expect, it } from 'vitest'
import { splitFinished } from './finishedSection'

const services = [
  { id: 's1', date: '2026-09-06' },
  { id: 's2', date: '2026-09-06' },
  { id: 's3', date: '2026-09-13' },
]

describe('splitFinished', () => {
  it('takes what is over off the list rather than sorting it last', () => {
    const { live, finished } = splitFinished(services, (s) => s.id === 's1')
    expect(live.map((s) => s.id)).toEqual(['s2', 's3'])
    expect(finished.map((s) => s.id)).toEqual(['s1'])
  })

  it('keeps each half in the order it came in', () => {
    const { live, finished } = splitFinished(services, (s) => s.date === '2026-09-06')
    expect(finished.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(live.map((s) => s.id)).toEqual(['s3'])
  })

  it('gives an empty half rather than nothing when everything is over', () => {
    const { live, finished } = splitFinished(services, () => true)
    expect(live).toEqual([])
    expect(finished).toHaveLength(3)
  })

  it('leaves a page with nothing finished exactly as it was', () => {
    const { live, finished } = splitFinished(services, () => false)
    expect(live).toEqual(services)
    expect(finished).toEqual([])
  })
})
