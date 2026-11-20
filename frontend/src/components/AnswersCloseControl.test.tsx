import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnswersCloseControl } from './AnswersCloseControl'
import { deadlineWords } from '../lib/availabilityDeadline'

const rule = new Date('2099-01-03T23:59:00')
const starts = '2099-01-04T10:30:00'
const NOW = new Date('2099-01-01T12:00:00').getTime()

function show(over: Partial<Parameters<typeof AnswersCloseControl>[0]> = {}) {
  const onSave = vi.fn((_patch: { availability_closes_override: string | null }, done: () => void) => done())
  render(
    <AnswersCloseControl closesAt={rule} byRule={rule} ruleWords="the night before" override={null} startsAt={starts} now={NOW} canEdit busy={false} error={null} onSave={onSave} {...over} />,
  )
  return { user: userEvent.setup(), onSave }
}

describe('when answers close, on a service’s page', () => {
  it('says the moment, and that it is the church’s rule', () => {
    show()
    expect(screen.getByText(/^Availability answers close/)).toHaveTextContent(`Availability answers close ${deadlineWords(rule)} · the night before`)
  })

  it('says a deadline of its own is this service’s, and “closed” once it has gone', () => {
    const own = new Date('2098-12-31T18:00:00')
    show({ closesAt: own, override: own.toISOString() })
    expect(screen.getByText(/^Availability answers closed/)).toHaveTextContent(`Availability answers closed ${deadlineWords(own)} · set for this service`)
  })

  it('offers no way to change it to somebody who does not manage services', () => {
    show({ canEdit: false })
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
  })

  it('opens on the church’s rule, and saving that sends nothing of its own', async () => {
    const { user, onSave } = show()
    await user.click(screen.getByRole('button', { name: 'Change' }))
    const dialog = within(screen.getByRole('dialog', { name: 'When answers close for this service' }))
    expect(dialog.getByRole('radio', { name: /The church’s rule/ })).toBeChecked()
    expect(dialog.getByText(new RegExp(`${deadlineWords(rule).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')} — the night before`))).toBeInTheDocument()
    // The date and time are only there for a time of its own.
    expect(dialog.queryByRole('button', { name: /Answers close, date/ })).toBeNull()
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({ availability_closes_override: null }, expect.any(Function))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('gives the service a time of its own, starting from the rule’s moment', async () => {
    const { user, onSave } = show()
    await user.click(screen.getByRole('button', { name: 'Change' }))
    const dialog = within(screen.getByRole('dialog', { name: 'When answers close for this service' }))
    await user.click(dialog.getByRole('radio', { name: /A time of its own/ }))
    expect(dialog.getByRole('button', { name: /Answers close, date/ })).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: /Answers close, time/ })).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    // Untouched, it is the moment the rule gave: the same deadline, now this service's own.
    expect(onSave).toHaveBeenCalledWith({ availability_closes_override: rule.toISOString() }, expect.any(Function))
  })

  it('opens on a time of its own where the service has one, and can go back to the rule', async () => {
    const own = new Date('2099-01-02T18:00:00')
    const { user, onSave } = show({ closesAt: own, override: own.toISOString() })
    await user.click(screen.getByRole('button', { name: 'Change' }))
    const dialog = within(screen.getByRole('dialog', { name: 'When answers close for this service' }))
    expect(dialog.getByRole('radio', { name: /A time of its own/ })).toBeChecked()
    await user.click(dialog.getByRole('radio', { name: /The church’s rule/ }))
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({ availability_closes_override: null }, expect.any(Function))
  })

  it('says so when a deadline is put after the service begins, and still lets it be saved', async () => {
    const after = new Date('2099-01-04T11:00:00')
    const { user, onSave } = show({ closesAt: after, override: after.toISOString() })
    await user.click(screen.getByRole('button', { name: 'Change' }))
    const dialog = within(screen.getByRole('dialog', { name: 'When answers close for this service' }))
    expect(dialog.getByText(/That is after the service begins/)).toBeInTheDocument()
    await user.click(dialog.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith({ availability_closes_override: after.toISOString() }, expect.any(Function))
  })

  it('keeps the dialog open and says why when the save is refused', async () => {
    const onSave = vi.fn()
    render(<AnswersCloseControl closesAt={rule} byRule={rule} ruleWords="the night before" override={null} startsAt={starts} now={NOW} canEdit busy={false} error="Could not update the service." onSave={onSave} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Change' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('dialog', { name: 'When answers close for this service' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not update the service.')
  })
})
