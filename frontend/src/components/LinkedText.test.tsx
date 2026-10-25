import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MessageBody } from './MessageBody'

describe('a message with a link in it', () => {
  it('makes the address a link that opens in a new tab, and keeps the mention lit', () => {
    render(
      <MessageBody
        body="@Grace Mensah the rota is at https://example.org/rota."
        people={[{ id: 'g', first_name: 'Grace', last_name: 'Mensah' }]}
      />,
    )
    const link = screen.getByRole('link', { name: 'https://example.org/rota' })
    expect(link).toHaveAttribute('href', 'https://example.org/rota')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow')
    expect(screen.getByText('@Grace Mensah')).toHaveClass('font-medium')
  })

  it('keeps a tap on the link from also opening the message’s own menu', () => {
    const onOpen = vi.fn()
    render(
      <div onClick={onOpen}>
        <MessageBody body="www.example.org" people={[]} />
      </div>,
    )
    fireEvent.click(screen.getByRole('link', { name: 'www.example.org' }))
    expect(onOpen).not.toHaveBeenCalled()
  })
})
