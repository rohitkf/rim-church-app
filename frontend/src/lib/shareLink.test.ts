import { describe, expect, it, vi } from 'vitest'
import { pollLink, shareLink } from './shareLink'
import { notificationHref } from './notificationLink'

/*
 * Handing a link over: the system's sheet on a phone, the clipboard at a
 * desk, and an honest "could not" when neither is there.
 */

const what = { title: 'Poll', text: 'Which Saturday suits you?', url: 'https://app.example/polls?poll=p1' }

describe('the link to a poll', () => {
  it('is the Polls page with the poll named', () => {
    expect(pollLink('p1', 'https://app.example')).toBe('https://app.example/polls?poll=p1')
  })

  it('is the place its notification already opens, so the page goes to it and marks it', () => {
    expect(pollLink('p1', '')).toBe(notificationHref('team_poll', 'p1'))
  })

  it('carries an id safely whatever is in it', () => {
    expect(pollLink('a b&c', 'https://app.example')).toBe('https://app.example/polls?poll=a%20b%26c')
  })
})

describe('sharing a link', () => {
  it('opens the system’s sheet on a phone', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn()
    expect(await shareLink(what, { nav: { share, clipboard: { writeText } }, touch: true })).toBe('shared')
    expect(share).toHaveBeenCalledWith(what)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('copies the link at a desk, even where a sheet could be opened', async () => {
    const share = vi.fn()
    const writeText = vi.fn().mockResolvedValue(undefined)
    expect(await shareLink(what, { nav: { share, clipboard: { writeText } }, touch: false })).toBe('copied')
    expect(share).not.toHaveBeenCalled()
    // The link alone: pasted into a message, the words are theirs to write.
    expect(writeText).toHaveBeenCalledWith(what.url)
  })

  it('copies on a phone that has no sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    expect(await shareLink(what, { nav: { clipboard: { writeText } }, touch: true })).toBe('copied')
  })

  it('treats a closed sheet as an answer, and copies nothing behind their back', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('Share canceled'), { name: 'AbortError' }))
    const writeText = vi.fn()
    expect(await shareLink(what, { nav: { share, clipboard: { writeText } }, touch: true })).toBe('dismissed')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('copies when the sheet will not open for another reason', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }))
    const writeText = vi.fn().mockResolvedValue(undefined)
    expect(await shareLink(what, { nav: { share, clipboard: { writeText } }, touch: true })).toBe('copied')
  })

  it('says it could not when there is nothing to copy with, or the clipboard refuses', async () => {
    expect(await shareLink(what, { nav: {}, touch: false })).toBe('failed')
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    expect(await shareLink(what, { nav: { clipboard: { writeText } }, touch: false })).toBe('failed')
  })
})
