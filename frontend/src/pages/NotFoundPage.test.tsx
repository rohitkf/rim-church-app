import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotFoundPage } from './NotFoundPage'

describe('NotFoundPage', () => {
  it('says the page is not found, shows the address, and has the way back to the Dashboard', () => {
    render(
      <MemoryRouter initialEntries={['/servce-planner']}>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Error 404')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText('/servce-planner')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the Dashboard' })).toHaveAttribute('href', '/')
  })

  it('offers no Go back on a link opened fresh, where there is nothing behind it', () => {
    render(
      <MemoryRouter initialEntries={['/nowhere']}>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull()
  })
})
