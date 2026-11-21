import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssigneePill, RailCountdown, TimelineCard, TimelineRow } from './Timeline'
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

  it('marks a substitute Sub, and neither a translator nor somebody taking it', () => {
    const { rerender } = render(<AssigneePill name="Rose Sam" initials="RS" translator />)
    // A translator is told by the colour of the pill and the row's own label, not by a mark.
    expect(screen.queryByText('Trans')).not.toBeInTheDocument()
    expect(screen.queryByText('Sub')).not.toBeInTheDocument()
    expect(screen.getByText('Rose Sam').parentElement).toHaveClass('border-accent-indigo')
    rerender(<AssigneePill name="Rose Sam" initials="RS" substitute />)
    expect(screen.getByText('Sub')).toBeInTheDocument()
    expect(screen.queryByText('Trans')).not.toBeInTheDocument()
    rerender(<AssigneePill name="Rose Sam" initials="RS" />)
    expect(screen.queryByText('Sub')).not.toBeInTheDocument()
    expect(screen.queryByText('Trans')).not.toBeInTheDocument()
  })

  it('says a guest’s note under their name, and nothing when there is none', () => {
    const { rerender } = render(<AssigneePill name="Ps Saju Wigan" initials="SW" note="pastor from Harlow" />)
    expect(screen.getByText('Note: pastor from Harlow')).toBeInTheDocument()
    rerender(<AssigneePill name="Ps Saju Wigan" initials="SW" note={null} />)
    expect(screen.queryByText(/^Note:/)).not.toBeInTheDocument()
    rerender(<AssigneePill name="Ps Saju Wigan" initials="SW" note="  " />)
    expect(screen.queryByText(/^Note:/)).not.toBeInTheDocument()
  })
})

describe('RailCountdown', () => {
  // The last session's gap runs to the End of service node.
  it('counts down to the end of the service, then up once it is past', () => {
    const soon = new Date(Date.now() + 5 * 60_000 + 30_000).toISOString()
    const { unmount } = render(<RailCountdown startsAt={soon} to="end" />)
    expect(screen.getByLabelText(/^The service ends in 5m/)).toHaveTextContent(/^5m \d\ds$/)
    unmount()
    const gone = new Date(Date.now() - 3 * 60_000).toISOString()
    render(<RailCountdown startsAt={gone} to="end" holding />)
    expect(screen.getByLabelText(/^Running 3m/)).toHaveTextContent(/^\+3m/)
  })

  // 1:12:55 has to be worked out before it can be said: the minutes are under it.
  it('says the same reading as one number of minutes, under the pill', () => {
    const long = new Date(Date.now() + (72 * 60 + 55) * 1000).toISOString()
    const { unmount } = render(<RailCountdown startsAt={long} />)
    expect(screen.getByLabelText(/^Next session in 1:12:/)).toBeInTheDocument()
    expect(screen.getByLabelText('73 minutes remaining')).toHaveTextContent('73 min')
    unmount()

    const gone = new Date(Date.now() - (2 * 60 + 17) * 1000).toISOString()
    const over = render(<RailCountdown startsAt={gone} holding />)
    expect(screen.getByLabelText('2 minutes over')).toHaveTextContent('2 min over')
    over.unmount()

    // Run out with nobody holding it: "due" has no minutes to count.
    render(<RailCountdown startsAt={gone} />)
    expect(screen.getByLabelText('The next session is due to start')).toHaveTextContent('due')
    expect(screen.queryByText(/min/)).toBeNull()
  })
})
