import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLogoCard } from './AppLogoCard'

const owner = vi.fn(() => true)
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ isSuperAdmin: owner() }) }))

const settings = vi.fn(() => ({ logo_url: null as string | null }))
vi.mock('../lib/appSettings', () => ({
  SETTINGS_KEY: ['app-settings'],
  useAppSettings: () => settings(),
}))
vi.mock('../lib/appLogo', () => ({
  BRANDING_BUCKET: 'branding',
  useAppLogo: () => ({ path: settings().logo_url, url: settings().logo_url ? 'https://signed' : null }),
}))
vi.mock('./AppMark', () => ({ AppMark: () => <span>the mark</span> }))

const uploaded = vi.fn()
const removed = vi.fn()
const saved = vi.fn()

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (path: string, file: File) => {
          uploaded(path, file.type)
          return Promise.resolve({ error: null })
        },
        remove: (paths: string[]) => {
          removed(paths)
          return Promise.resolve({ error: null })
        },
      }),
    },
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          saved(patch)
          return Promise.resolve({ error: null })
        },
      }),
    }),
  },
}))

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AppLogoCard />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const png = (name = 'logo.png') => new File(['x'], name, { type: 'image/png' })

beforeEach(() => {
  owner.mockReturnValue(true)
  settings.mockReturnValue({ logo_url: null })
  uploaded.mockReset()
  removed.mockReset()
  saved.mockReset()
  vi.stubGlobal('crypto', { randomUUID: () => 'fixed-id' })
})

describe('the owner’s logo', () => {
  it('uploads the file and points the app at it', async () => {
    const user = show()
    await user.upload(screen.getByLabelText('Logo image file'), png())

    await waitFor(() => expect(saved).toHaveBeenCalledWith({ logo_url: 'logo/fixed-id.png' }))
    expect(uploaded).toHaveBeenCalledWith('logo/fixed-id.png', 'image/png')
  })

  /*
   * A fixed filename would sit behind a signed URL and a browser cache
   * that both still point at the old picture — "I uploaded it and nothing
   * changed" is the bug that follows.
   */
  it('gives the new file a name of its own, and takes the old one down', async () => {
    settings.mockReturnValue({ logo_url: 'logo/old.png' })
    const user = show()
    await user.upload(screen.getByLabelText('Logo image file'), png())

    await waitFor(() => expect(saved).toHaveBeenCalled())
    expect(uploaded.mock.calls[0][0]).not.toBe('logo/old.png')
    expect(removed).toHaveBeenCalledWith(['logo/old.png'])
  })

  it('asks before taking the logo down', async () => {
    settings.mockReturnValue({ logo_url: 'logo/old.png' })
    const user = show()
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    // Nothing happens on the strength of one press.
    expect(saved).not.toHaveBeenCalled()
    const asked = screen.getByRole('alertdialog')
    await user.click(within(asked).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(saved).toHaveBeenCalledWith({ logo_url: null }))
    expect(removed).toHaveBeenCalledWith(['logo/old.png'])
  })

  /*
   * The database is what actually stops an Admin here (migration 0089).
   * The page says so rather than offering a form that fails on Save.
   */
  it('tells an Admin whose decision this is, rather than offering them the form', () => {
    owner.mockReturnValue(false)
    show()
    expect(screen.getByText(/owner’s to choose/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Upload/ })).toBeNull()
  })
})
