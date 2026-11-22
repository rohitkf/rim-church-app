import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ClearingLine, ClearingNotice } from './RegistrationClearing'

/*
 * A finished event counts down to the night people's details come off its
 * registrations (the Owner's ask, November 2026). Nothing deletes the
 * event, and the words must not say it does.
 */

const state = vi.hoisted(() => ({ keep: 90 as number | null }))

vi.mock('../lib/appSettings', () => ({ useAppSettings: () => ({ registration_retention_days: state.keep }) }))

const daysOn = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

beforeEach(() => {
  state.keep = 90
})

describe('the notice on a finished event’s page', () => {
  it('is not there for an event still to come, or one with no dates', () => {
    const { container, rerender } = render(<ClearingNotice lastEndsAt={daysOn(3)} anonymised={false} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ClearingNotice lastEndsAt={null} anonymised={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('counts down, says what goes and what stays, and says to export first', () => {
    render(<ClearingNotice lastEndsAt={daysOn(-10)} anonymised={false} />)
    const notice = screen.getByRole('region', { name: 'When people’s details are removed' })
    expect(screen.getByRole('timer')).toHaveAccessibleName(/^Names and contact details are removed in (79|80) days \d+ hrs \d+ min \d+ sec$/)
    expect(notice).toHaveTextContent(/the names, emails and phone numbers of everybody registered are removed/)
    expect(notice).toHaveTextContent(/The orders, their ticket codes and the sums stay, and so does the event, until somebody deletes it\./)
    expect(notice).toHaveTextContent(/Export to Excel before then if you need the names\./)
    // Never that the event is deleted.
    expect(notice).not.toHaveTextContent(/event (is|will be) (auto-)?deleted/i)
  })

  it('goes by the church’s own number of days', () => {
    state.keep = 30
    render(<ClearingNotice lastEndsAt={daysOn(-10)} anonymised={false} />)
    expect(screen.getByRole('timer')).toHaveAccessibleName(/removed in (19|20) days/)
  })

  it('says tonight once the days have run out and the names are still there', () => {
    render(<ClearingNotice lastEndsAt={daysOn(-100)} anonymised={false} />)
    expect(screen.getByText('Names and contact details are removed tonight.')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).toBeNull()
    expect(screen.getByRole('region')).toHaveTextContent(/Export to Excel now if you need the names\./)
  })

  it('says they have been removed when the registrations say so, and that the rest is still there', () => {
    render(<ClearingNotice lastEndsAt={daysOn(-200)} anonymised />)
    expect(screen.getByText('Names and contact details have been removed')).toBeInTheDocument()
    expect(screen.getByRole('region')).toHaveTextContent(/The orders, their ticket codes and the sums stay/)
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('says nothing removes them where the church keeps them until the event is deleted', () => {
    state.keep = null
    render(<ClearingNotice lastEndsAt={daysOn(-400)} anonymised={false} />)
    expect(screen.getByRole('region')).toHaveTextContent(/kept until the event is deleted: nothing removes them on its own/)
    expect(screen.queryByRole('timer')).toBeNull()
  })
})

describe('the line on an event’s card', () => {
  it('is a timer while it counts, and nothing at all where nothing is counting', () => {
    const now = new Date()
    const { container, rerender } = render(<ClearingLine lastEndsAt={daysOn(-1)} anonymised={false} now={now} />)
    expect(screen.getByRole('timer')).toHaveTextContent(/^Names and contact details removed in (88|89) days \d+ hrs?$/)
    state.keep = null
    rerender(<ClearingLine lastEndsAt={daysOn(-1)} anonymised={false} now={now} />)
    expect(container).toBeEmptyDOMElement()
    state.keep = 90
    rerender(<ClearingLine lastEndsAt={daysOn(5)} anonymised={false} now={now} />)
    expect(container).toBeEmptyDOMElement()
  })
})
