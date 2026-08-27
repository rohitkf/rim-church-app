import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReadinessDonut } from './ReadinessDonut'
import { readinessOf } from '../lib/readiness'

describe('ReadinessDonut', () => {
  it('puts the weighted percentage in the middle and one arc per stage present', () => {
    const { container } = render(
      <ReadinessDonut
        readiness={readinessOf({ total: 3, memberComplete: 1, headVerified: 1, coordinatorVerified: 1 })}
        label="Media"
      />,
    )
    expect(screen.getByText('67%')).toBeInTheDocument()
    // one track + three stage arcs
    expect(container.querySelectorAll('circle')).toHaveLength(4)
    expect(screen.getByRole('img')).toHaveAccessibleName(/Media: 67% ready, 1 of 3 signed off/)
  })

  it('draws no arcs and a dash when there is nothing to check', () => {
    const { container } = render(
      <ReadinessDonut
        readiness={readinessOf({ total: 0, memberComplete: 0, headVerified: 0, coordinatorVerified: 0 })}
      />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(container.querySelectorAll('circle')).toHaveLength(1)
  })

  it('keeps the arcs inside one turn of the ring', () => {
    const { container } = render(
      <ReadinessDonut
        readiness={readinessOf({ total: 4, memberComplete: 1, headVerified: 1, coordinatorVerified: 2 })}
        size={100}
      />,
    )
    const arcs = [...container.querySelectorAll('circle')].slice(1)
    const radius = Number(arcs[0].getAttribute('r'))
    const circumference = 2 * Math.PI * radius
    const drawn = arcs.reduce((sum, c) => sum + Number(c.getAttribute('stroke-dasharray')!.split(' ')[0]), 0)
    expect(drawn).toBeLessThanOrEqual(circumference)
    expect(drawn).toBeGreaterThan(circumference * 0.9)
  })
})
