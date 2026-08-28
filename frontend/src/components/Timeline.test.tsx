import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssigneePill, TimelineCard, TimelineRow } from './Timeline'
import { initialsOf } from '../lib/initials'

describe('TimelineRow', () => {
  it('puts the time on the rail and the session beside it', () => {
    render(
      <ul>
        <TimelineRow time="10:00" meta="25 min">
          <TimelineCard>Worship Set</TimelineCard>
        </TimelineRow>
      </ul>,
    )
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText('25 min')).toBeInTheDocument()
    expect(screen.getByText('Worship Set')).toBeInTheDocument()
  })

  it('stops the line at the last row rather than trailing it into nothing', () => {
    const { container } = render(
      <ul>
        <TimelineRow time="11:15" last>
          <TimelineCard>Closing Prayer</TimelineCard>
        </TimelineRow>
      </ul>,
    )
    const line = container.querySelector('[data-rail="line"]') as HTMLElement
    expect(line.style.bottom).toBe('calc(100% - 2rem)')
  })

  it('runs the line past a row that has more after it', () => {
    const { container } = render(
      <ul>
        <TimelineRow time="10:00">
          <TimelineCard>Welcome</TimelineCard>
        </TimelineRow>
      </ul>,
    )
    const line = container.querySelector('[data-rail="line"]') as HTMLElement
    expect(line.style.bottom).toBe('-0.375rem')
  })
})

describe('the rail as a clock', () => {
  const rowWith = (props: { fill?: number; running?: boolean }) =>
    render(
      <ul>
        <TimelineRow time="10:00" {...props}>
          <TimelineCard>Worship Set</TimelineCard>
        </TimelineRow>
      </ul>,
    )

  it('draws no elapsed line for a session that has not happened', () => {
    const { container } = rowWith({ fill: 0 })
    expect(container.querySelector('[data-rail="elapsed"]')).toBeNull()
  })

  it('clips the elapsed line to how much of the session has gone', () => {
    const { container } = rowWith({ fill: 0.25 })
    const elapsed = container.querySelector('[data-rail="elapsed"]') as HTMLElement
    expect(elapsed.style.clipPath).toBe('inset(0 0 75% 0)')
  })

  it('fills the whole segment for a session that is over', () => {
    const { container } = rowWith({ fill: 1 })
    const elapsed = container.querySelector('[data-rail="elapsed"]') as HTMLElement
    expect(elapsed.style.clipPath).toBe('inset(0 0 0% 0)')
    // A finished session's dot is green too, not just its line.
    expect((container.querySelector('[data-rail="dot"]') as HTMLElement).className).toContain(
      'bg-accent-green',
    )
  })

  it('refuses a fill outside the segment rather than drawing past it', () => {
    const { container } = rowWith({ fill: 4 })
    expect((container.querySelector('[data-rail="elapsed"]') as HTMLElement).style.clipPath).toBe(
      'inset(0 0 0% 0)',
    )
  })

  it('writes an overrun under the time it broke, and only when there is one', () => {
    const { container, rerender } = render(
      <ul>
        <TimelineRow time="10:00" meta="25 min" over={6}>
          <TimelineCard>Worship Set</TimelineCard>
        </TimelineRow>
      </ul>,
    )
    expect(screen.getByText('+6 over')).toBeInTheDocument()

    rerender(
      <ul>
        <TimelineRow time="10:00" meta="25 min" over={0}>
          <TimelineCard>Worship Set</TimelineCard>
        </TimelineRow>
      </ul>,
    )
    expect(screen.queryByText(/over/)).not.toBeInTheDocument()
    expect(container).toBeTruthy()
  })

  it('pulses the dot of the session that is on', () => {
    const { container } = rowWith({ fill: 0.4, running: true })
    expect((container.querySelector('[data-rail="dot"]') as HTMLElement).className).toContain(
      'pulse-live',
    )
  })
})

describe('initialsOf', () => {
  it('takes one letter from each name', () => {
    expect(initialsOf('Grace', 'Mensah')).toBe('GM')
  })

  it('copes with half a name', () => {
    expect(initialsOf('Grace', null)).toBe('G')
    expect(initialsOf(null, 'Mensah')).toBe('M')
  })

  it('falls back to something rather than an empty circle', () => {
    expect(initialsOf(null, null)).toBe('··')
  })
})

describe('AssigneePill', () => {
  it('shows the name, with the initials as decoration only', () => {
    render(<AssigneePill name="Grace Mensah" initials="GM" />)
    expect(screen.getByText('Grace Mensah')).toBeInTheDocument()
    expect(screen.getByText('GM')).toHaveAttribute('aria-hidden', 'true')
  })
})
