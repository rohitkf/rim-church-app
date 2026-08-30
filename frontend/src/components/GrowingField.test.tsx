import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GrowingField } from './GrowingField'

const LONG = 'Welcome, Notices & Church Family News'

function show(value = LONG) {
  const onCommit = vi.fn()
  render(<GrowingField value={value} label="Session name" onCommit={onCommit} />)
  return { onCommit, user: userEvent.setup(), field: screen.getByLabelText('Session name') }
}

describe('GrowingField', () => {
  it('holds the whole value, with nothing scrolled out of sight', () => {
    const { field } = show()
    expect((field as HTMLTextAreaElement).value).toBe(LONG)
    // A textarea that sizes itself to its content has no reason to scroll,
    // and an overflow it cannot show is exactly the failure this replaced.
    // (jsdom applies no stylesheet, so the classes are what can be checked.)
    expect(field.className).toContain('overflow-hidden')
    expect(field.className).toContain('resize-none')
    expect(field.tagName).toBe('TEXTAREA')
  })

  it('commits on blur', async () => {
    const { onCommit, user, field } = show()
    await user.clear(field)
    await user.type(field, 'Offering')
    await user.tab()
    expect(onCommit).toHaveBeenCalledWith('Offering')
  })

  it('commits on Enter rather than starting a second line', async () => {
    const { onCommit, user, field } = show()
    await user.clear(field)
    await user.type(field, 'Offering{Enter}')
    expect((field as HTMLTextAreaElement).value).not.toContain('\n')
    expect(onCommit).toHaveBeenCalledWith('Offering')
  })

  it('trims, and says nothing when nothing changed', async () => {
    const { onCommit, user, field } = show()
    await user.click(field)
    await user.tab()
    expect(onCommit).not.toHaveBeenCalled()

    await user.clear(field)
    await user.type(field, '  Offering  ')
    await user.tab()
    expect(onCommit).toHaveBeenCalledWith('Offering')
  })

  it('puts the old value back rather than accepting an empty name', async () => {
    const { onCommit, user, field } = show()
    await user.clear(field)
    await user.tab()
    expect(onCommit).not.toHaveBeenCalled()
    expect((field as HTMLTextAreaElement).value).toBe(LONG)
  })
})
