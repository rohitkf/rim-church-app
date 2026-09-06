import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FinishedServices } from './FinishedServices'

describe('FinishedServices', () => {
  it('starts closed, because a record is not what the page is for', () => {
    render(
      <FinishedServices count={2} id="finished">
        <p>English Service</p>
      </FinishedServices>,
    )
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument()
    // In the tree but not on the page: `hidden` is what folds it away, so
    // visibility is the thing worth asserting.
    expect(screen.getByText('English Service')).not.toBeVisible()
  })

  it('says how many are inside, so nobody opens it to find out', () => {
    render(
      <FinishedServices count={3} id="finished">
        <p>English Service</p>
      </FinishedServices>,
    )
    expect(screen.getByRole('button', { name: /Finished\s*3/ })).toBeInTheDocument()
  })

  it('opens and closes again on a press', async () => {
    const user = userEvent.setup()
    render(
      <FinishedServices count={1} id="finished">
        <p>English Service</p>
      </FinishedServices>,
    )
    await user.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByText('English Service')).toBeVisible())

    await user.click(screen.getByRole('button'))
    await waitFor(() => expect(screen.getByText('English Service')).not.toBeVisible())
  })

  it('carries a note beside the heading when a page has one to give', () => {
    render(
      <FinishedServices count={1} id="finished" aside={<span>Clears every Tuesday</span>}>
        <p>English Service</p>
      </FinishedServices>,
    )
    expect(screen.getByText('Clears every Tuesday')).toBeInTheDocument()
  })
})
