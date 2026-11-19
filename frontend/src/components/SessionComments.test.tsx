import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionComments } from './SessionComments'
import { COMMENT_MAX, type SessionComment } from '../lib/sessionComments'

const comment = (id: string, author: string | null, body: string, name: [string, string] | null = ['Paul', 'Mensah']): SessionComment => ({
  id,
  session_id: 's1',
  author,
  body,
  created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  writer: name ? { first_name: name[0], last_name: name[1] } : null,
})

function Block({
  comments = [],
  mayWrite = false,
  open = false,
  onAdd = vi.fn().mockResolvedValue(undefined),
  onDelete = vi.fn(),
  busy = false,
}: {
  comments?: SessionComment[]
  mayWrite?: boolean
  open?: boolean
  onAdd?: (body: string) => Promise<unknown>
  onDelete?: (c: SessionComment) => void
  busy?: boolean
}) {
  const [writing, setWriting] = useState(open)
  return <SessionComments sessionName="Sermon" comments={comments} myId="me" mayWrite={mayWrite} writing={writing} onWriting={setWriting} onAdd={onAdd} onDelete={onDelete} busy={busy} />
}

describe('the comments on a session', () => {
  it('draws nothing when there is nothing to read and nothing being written', () => {
    const { container } = render(<Block mayWrite />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows each comment with who said it and when, and says it is private', () => {
    render(<Block comments={[comment('a', 'p1', 'Keep this to ten minutes'), comment('b', 'me', 'Reading before the song', ['Rohit', 'K'])]} />)
    const block = within(screen.getByRole('group', { name: 'Comments on Sermon' }))
    expect(block.getByText('Private — not shown to the team')).toBeInTheDocument()
    const [first, second] = block.getAllByRole('listitem')
    expect(first).toHaveTextContent('Keep this to ten minutes')
    expect(first).toHaveTextContent('Paul Mensah · 5 mins ago')
    // Your own says You, and only your own can be deleted.
    expect(second).toHaveTextContent('You · 5 mins ago')
    expect(within(first).queryByRole('button')).toBeNull()
    expect(within(second).getByRole('button', { name: 'Delete your comment on Sermon' })).toBeInTheDocument()
  })

  it('keeps the lines of a comment as they were typed', () => {
    render(<Block comments={[comment('a', 'p1', 'First.\nThen this.')]} />)
    expect(screen.getByText(/First\./)).toHaveClass('whitespace-pre-wrap', 'break-words')
  })

  it('gives a reader who may not write nothing to press', () => {
    render(<Block comments={[comment('a', 'p1', 'Keep this to ten minutes')]} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('opens a box from Add a comment, sends what was typed, and closes', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<Block mayWrite comments={[comment('a', 'me', 'Earlier')]} onAdd={onAdd} />)
    await user.click(screen.getByRole('button', { name: 'Add a comment' }))
    const box = screen.getByRole('textbox', { name: 'Comment on Sermon' })
    expect(box).toHaveFocus()
    await user.type(box, 'Keep this to ten minutes')
    await user.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(onAdd).toHaveBeenCalledWith('Keep this to ten minutes')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add a comment' })).toBeInTheDocument()
  })

  it('opens with the box when the menu asked for it, on a session with no comments yet', () => {
    render(<Block mayWrite open />)
    expect(screen.getByRole('group', { name: 'Comments on Sermon' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Comment on Sermon' })).toBeInTheDocument()
  })

  it('will not send nothing, and says so', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<Block mayWrite open onAdd={onAdd} />)
    await user.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Write the comment first.')
    expect(onAdd).not.toHaveBeenCalled()
    // Typing clears it.
    await user.type(screen.getByRole('textbox'), 'x')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('counts down only near the end, and refuses one too long', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<Block mayWrite open onAdd={onAdd} />)
    const box = screen.getByRole('textbox')
    await user.type(box, 'short')
    expect(screen.queryByText(/left$/)).toBeNull()
    await user.clear(box)
    await user.click(box)
    await user.paste('x'.repeat(COMMENT_MAX - 20))
    expect(screen.getByText('20 left')).toBeInTheDocument()
    await user.paste('y'.repeat(25))
    expect(screen.getByText('5 too many')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(screen.getByRole('alert')).toHaveTextContent('1000 characters at most')
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('keeps what was typed, and says why, when the save is refused', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn().mockRejectedValue(new Error('You may not comment on sessions.'))
    render(<Block mayWrite open onAdd={onAdd} />)
    await user.type(screen.getByRole('textbox'), 'Keep this to ten minutes')
    await user.click(screen.getByRole('button', { name: 'Add comment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You may not comment on sessions.')
    expect(screen.getByRole('textbox')).toHaveValue('Keep this to ten minutes')
  })

  it('throws the draft away on Cancel', async () => {
    const user = userEvent.setup()
    render(<Block mayWrite open comments={[comment('a', 'me', 'Earlier')]} />)
    await user.type(screen.getByRole('textbox'), 'never mind')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Add a comment' }))
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('hands a comment to be deleted to the page, which asks first', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    const mine = comment('b', 'me', 'Reading before the song')
    render(<Block comments={[mine]} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete your comment on Sermon' }))
    expect(onDelete).toHaveBeenCalledWith(mine)
  })

  it('holds its buttons while a save is on its way', () => {
    render(<Block mayWrite open busy comments={[comment('b', 'me', 'Mine')]} />)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete your comment on Sermon' })).toBeDisabled()
  })
})
