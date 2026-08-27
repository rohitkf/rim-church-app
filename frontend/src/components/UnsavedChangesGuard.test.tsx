import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { UnsavedChangesDialog, useUnsavedChangesGuard } from './UnsavedChangesGuard'

function FormPage() {
  const [value, setValue] = useState('')
  const { blocker } = useUnsavedChangesGuard(value.trim() !== '')
  return (
    <div>
      <h1>Form</h1>
      <input aria-label="Name" value={value} onChange={(e) => setValue(e.target.value)} />
      <Link to="/elsewhere">Go elsewhere</Link>
      <UnsavedChangesDialog blocker={blocker} />
    </div>
  )
}

function renderAt() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <FormPage /> },
      { path: '/elsewhere', element: <h1>Elsewhere</h1> },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
}

describe('useUnsavedChangesGuard', () => {
  it('lets navigation through when nothing has been typed', async () => {
    const user = userEvent.setup()
    renderAt()
    await user.click(screen.getByRole('link', { name: 'Go elsewhere' }))
    expect(await screen.findByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
  })

  it('warns on leaving with unsaved edits and stays put on Cancel', async () => {
    const user = userEvent.setup()
    renderAt()
    await user.type(screen.getByLabelText('Name'), 'Worship')
    await user.click(screen.getByRole('link', { name: 'Go elsewhere' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Form' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Worship')
  })

  it('continues to the page the user asked for on Discard changes', async () => {
    const user = userEvent.setup()
    renderAt()
    await user.type(screen.getByLabelText('Name'), 'Worship')
    await user.click(screen.getByRole('link', { name: 'Go elsewhere' }))
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }))

    expect(await screen.findByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
  })
})
