import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateField, DateTimeField, TimeField } from './DateTimeFields'
import { formatTimeValue } from '../lib/dateTimeFormat'
import { pickDate, pickTime } from '../test/pickers'

describe('the app’s own date field', () => {
  it('is not the browser’s date input', () => {
    const { container } = render(<DateField value="" onChange={() => {}} label="Date of birth" />)
    expect(container.querySelector('input[type="date"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Date of birth' })).toHaveTextContent('Choose a date')
  })

  // A birthday forty years back is a year and a month away, not 480 taps.
  it('reaches a date years away through the month and year', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<DateField value="" onChange={onChange} label="Date of birth" />)
    await pickDate(user, screen.getByRole('button', { name: 'Date of birth' }), '1985-03-14')
    expect(onChange).toHaveBeenCalledWith('1985-03-14')
  })

  it('will not offer a day outside what is allowed', async () => {
    const user = userEvent.setup()
    render(<DateField value="2026-09-10" onChange={() => {}} label="Pick" min="2026-09-05" />)
    await user.click(screen.getByRole('button', { name: 'Pick' }))
    expect(within(screen.getByRole('dialog')).getByRole('gridcell', { name: '2026-09-04' })).toBeDisabled()
    expect(within(screen.getByRole('dialog')).getByRole('gridcell', { name: '2026-09-05' })).toBeEnabled()
  })

  it('can be emptied when the field allows it', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<DateField value="2026-09-10" onChange={onChange} label="Anniversary" clearable />)
    await user.click(screen.getByRole('button', { name: 'Anniversary' }))
    await user.click(screen.getByRole('button', { name: 'No date' }))
    expect(onChange).toHaveBeenCalledWith('')
  })
})

describe('the app’s own time field', () => {
  it('shows the time, and picks another from its columns', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<TimeField value="09:30" onChange={onChange} label="Start" />)
    expect(container.querySelector('input[type="time"]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Start' })).toHaveTextContent(formatTimeValue('09:30'))
    await pickTime(user, screen.getByRole('button', { name: 'Start' }), '18:45')
    expect(onChange).toHaveBeenCalledWith('18:45')
  })

  // An old value that is not on the five-minute grid is still offered.
  it('keeps an exact minute that is off the grid', async () => {
    const user = userEvent.setup()
    render(<TimeField value="10:28" onChange={() => {}} label="Start" />)
    await user.click(screen.getByRole('button', { name: 'Start' }))
    const minutes = screen.getByRole('listbox', { name: 'Minute' })
    expect(within(minutes).getByRole('option', { name: '28' })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('a date and a time together', () => {
  it('writes the shape the old datetime field did', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<DateTimeField value="" onChange={onChange} label="Deadline" />)
    await pickDate(user, screen.getByRole('button', { name: 'Deadline, date' }), '2026-10-01')
    expect(onChange).toHaveBeenLastCalledWith('2026-10-01T23:59')
  })
})
