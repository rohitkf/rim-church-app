import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShowMore } from './ShowMore'

/*
 * The foot of a list drawn a screen at a time: Show more while there is
 * more, Show fewer once it has been opened up, and a line saying where it
 * has got to.
 */

describe('the foot of a long list', () => {
  it('is not there when the whole list is already showing', () => {
    const { container } = render(
      <ShowMore left={0} expanded={false} onMore={() => {}} onFewer={() => {}} label="events">
        nothing
      </ShowMore>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('offers Show more while there is more, and no way back before anything was opened', async () => {
    const onMore = vi.fn()
    render(
      <ShowMore left={178} expanded={false} onMore={onMore} onFewer={() => {}} label="of what is coming up">
        178 more after Sunday 20 September
      </ShowMore>,
    )
    // Named for its list, so two on one page can be told apart; the words on it stay "Show more".
    const more = screen.getByRole('button', { name: 'Show more of what is coming up' })
    expect(more).toHaveTextContent('Show more')
    expect(screen.queryByRole('button', { name: /Show fewer/ })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('178 more after Sunday 20 September')
    await userEvent.click(more)
    expect(onMore).toHaveBeenCalledTimes(1)
  })

  it('offers both once it has been opened up', async () => {
    const onFewer = vi.fn()
    render(
      <ShowMore left={40} expanded onMore={() => {}} onFewer={onFewer} label="past events">
        40 more
      </ShowMore>,
    )
    expect(screen.getByRole('button', { name: 'Show more past events' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show fewer past events' }))
    expect(onFewer).toHaveBeenCalledTimes(1)
  })

  it('keeps the way back when everything is showing, and says that is everything', () => {
    render(
      <ShowMore left={0} expanded onMore={() => {}} onFewer={() => {}} label="past events">
        That is every past event kept.
      </ShowMore>,
    )
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Show fewer past events' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('That is every past event kept.')
  })
})
