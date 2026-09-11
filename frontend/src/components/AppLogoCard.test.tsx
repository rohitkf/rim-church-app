import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLogoCard, MAX_BYTES } from './AppLogoCard'

// The canvas work has its own tests (lib/logoImage); JSDOM has no canvas
// to run it in, so here it stands in as "the thing that hands back what
// actually gets stored".
const normalised = new Blob(['png'], { type: 'image/png' })
vi.mock('../lib/logoImage', () => ({ normaliseLogo: () => Promise.resolve(normalised) }))

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
        upload: (path: string, body: Blob, options: { contentType: string }) => {
          uploaded(path, options.contentType, body)
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

/** A file that claims to be `size` bytes without being any. */
const huge = (size: number) => {
  const file = new File(['x'], 'poster-scan.png', { type: 'image/png' })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

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
    // What is stored is the resized picture, not the file that was picked.
    expect(uploaded).toHaveBeenCalledWith('logo/fixed-id.png', 'image/png', normalised)
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

  /*
   * Thirty megabytes, said with a dialog. A line of red under the button
   * is no good here: somebody who has just picked a file is watching the
   * file picker close, not reading the page.
   */
  it('refuses a file over the limit, in a dialog, and uploads nothing', async () => {
    const user = show()
    await user.upload(screen.getByLabelText('Logo image file'), huge(MAX_BYTES + 1))

    const said = await screen.findByRole('alertdialog', { name: /too big/i })
    expect(within(said).getByText(/30/)).toBeInTheDocument()
    expect(within(said).getByText(/poster-scan\.png/)).toBeInTheDocument()
    expect(uploaded).not.toHaveBeenCalled()
    expect(saved).not.toHaveBeenCalled()

    await user.click(within(said).getByRole('button', { name: /Pick another/ }))
    expect(screen.queryByRole('alertdialog', { name: /too big/i })).toBeNull()
  })

  it('takes one that is just inside it', async () => {
    const user = show()
    await user.upload(screen.getByLabelText('Logo image file'), huge(MAX_BYTES))

    await waitFor(() => expect(saved).toHaveBeenCalled())
    expect(screen.queryByRole('alertdialog', { name: /too big/i })).toBeNull()
  })
})
