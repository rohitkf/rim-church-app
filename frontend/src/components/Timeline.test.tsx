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
    const line = container.querySelector('[aria-hidden="true"] span:last-child') as HTMLElement
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
    const line = container.querySelector('[aria-hidden="true"] span:last-child') as HTMLElement
    expect(line.style.bottom).toBe('-0.375rem')
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
