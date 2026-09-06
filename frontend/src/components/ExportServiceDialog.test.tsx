import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportServiceDialog } from './ExportServiceDialog'
import type { ServiceSheet } from '../lib/serviceSheet'

/*
 * The choice is between two sheets of the same document: the dark one for
 * a phone and a group chat, the light one for a printer. What is asserted
 * here is that the choice reaches the file — and its name.
 */
const saved: { name: string; bytes: number }[] = []
vi.mock('../lib/downloadFile', () => ({
  downloadFile: (data: Uint8Array, name: string) => saved.push({ name, bytes: data.length }),
}))

vi.mock('../lib/renderPageToImage', () => ({
  renderPageToJpeg: () => Promise.resolve(new Blob([new Uint8Array([1, 2, 3])])),
}))

const themeState = { resolved: 'dark' as 'dark' | 'light' }
vi.mock('../lib/useTheme', () => ({ useTheme: () => themeState }))

const sheet: ServiceSheet = {
  serviceType: 'Malayalam Service',
  date: '2026-09-06',
  sessions: [{ time: '11:30 AM', minutes: 15, name: 'Worship 1', lead: 'Joel Skaria' }],
  totalLabel: '3h 41m',
  windowLabel: 'Doors at 11:30, closing around 15:11.',
  printedOn: 'exported 06/09/2026',
}

function show() {
  render(<ExportServiceDialog sheet={sheet} onClose={() => {}} />)
  return userEvent.setup()
}

describe('exporting a running order', () => {
  beforeEach(() => {
    saved.length = 0
    themeState.resolved = 'dark'
  })

  it('offers both sheets, and starts on the one the app is showing', () => {
    show()
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked()
  })

  it('starts on light for somebody reading in light mode', () => {
    themeState.resolved = 'light'
    show()
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked()
  })

  it('names the file after the sheet that was chosen', async () => {
    const user = show()
    await user.click(screen.getByRole('radio', { name: 'Light' }))
    await user.click(screen.getByRole('button', { name: /PDF/ }))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].name).toBe('2026-09-06-malayalam-service-light.pdf')
  })

  it('carries the choice into the image as well as the PDF', async () => {
    const user = show()
    await user.click(screen.getByRole('radio', { name: 'Light' }))
    await user.click(screen.getByRole('button', { name: /JPG/ }))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].name).toBe('2026-09-06-malayalam-service-light.jpg')
  })

  it('still exports the dark sheet without anybody choosing anything', async () => {
    const user = show()
    await user.click(screen.getByRole('button', { name: /PDF/ }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].name).toBe('2026-09-06-malayalam-service-dark.pdf')
    // And it is a real PDF, not an empty file.
    expect(saved[0].bytes).toBeGreaterThan(500)
  })
})
