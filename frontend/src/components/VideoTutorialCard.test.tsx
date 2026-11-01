import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VideoTutorialCard } from './VideoTutorialCard'

const state = vi.hoisted(() => ({ owner: true, saved: null as string | null, writes: [] as unknown[] }))

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isSuperAdmin: state.owner }) }))
vi.mock('../lib/appSettings', () => ({
  SETTINGS_KEY: ['app-settings'],
  useAppSettings: () => ({ video_tutorial_url: state.saved }),
}))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/toast', () => ({ showToast: () => undefined }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: () => ({
      update: (row: unknown) => ({
        eq: () => {
          state.writes.push(row)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VideoTutorialCard />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  state.owner = true
  state.saved = null
  state.writes = []
})

describe('Settings › Video Tutorial', () => {
  it('is the Owner’s alone', () => {
    state.owner = false
    show()
    expect(screen.queryByLabelText('Video tutorial link')).toBeNull()
  })

  it('saves a link, trimmed', async () => {
    show()
    await userEvent.type(screen.getByLabelText('Video tutorial link'), '  https://youtu.be/abc  ')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(state.writes).toEqual([{ video_tutorial_url: 'https://youtu.be/abc' }]))
  })

  it('will not save something that is not a link', async () => {
    show()
    await userEvent.type(screen.getByLabelText('Video tutorial link'), 'javascript:alert(1)')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText(/needs to be a link/)).toBeInTheDocument()
  })

  it('removes the link, which takes the menu item away', async () => {
    state.saved = 'https://youtu.be/abc'
    show()
    await userEvent.click(screen.getByRole('button', { name: 'Remove the link' }))
    await waitFor(() => expect(state.writes).toEqual([{ video_tutorial_url: null }]))
  })
})
