import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GivingPage } from './GivingPage'
import { GivingSettingsCard } from '../components/GivingSettingsCard'

let admin = false
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ isAdmin: admin, isSuperAdmin: false, session: { user: { id: 'me' } } }),
}))

let rows: Record<string, unknown[]> = {}
const writes: { table: string; op: string; row?: unknown }[] = []

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      const list = {
        order: () => list,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(ok),
        maybeSingle: () => Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null }),
      }
      return {
        select: () => list,
        insert: (row: unknown) => {
          writes.push({ table, op: 'insert', row })
          return Promise.resolve({ error: null })
        },
        update: (row: unknown) => ({
          eq: () => {
            writes.push({ table, op: 'update', row })
            return Promise.resolve({ error: null })
          },
        }),
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }
    },
    storage: {
      from: () => ({
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'https://signed/qr.png' }, error: null }),
      }),
    },
  },
}))

beforeEach(() => {
  admin = false
  writes.length = 0
  rows = {
    giving_page: [{ intro: null, qr_image_path: null, qr_image_caption: null }],
    giving_links: [],
    giving_bank_accounts: [],
  }
})

function show(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('the Giving page', () => {
  it('says plainly when nothing is set up, and tells an Admin where to do it', async () => {
    admin = true
    show(<GivingPage />)
    expect(await screen.findByText('Nothing has been set up here yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings › Giving' })).toHaveAttribute('href', '/settings/giving')
  })

  it('shows a link as a button that opens the provider, and a QR code of it', async () => {
    rows.giving_links = [
      { id: 'l1', label: 'Give by card', url: 'https://buy.stripe.com/abc', note: 'Card, Apple Pay or Google Pay', show_qr: true, sort_order: 0 },
    ]
    show(<GivingPage />)
    const button = await screen.findByRole('link', { name: /Give by card/ })
    expect(button).toHaveAttribute('href', 'https://buy.stripe.com/abc')
    expect(button).toHaveAttribute('target', '_blank')
    expect(button).toHaveAttribute('rel', 'noopener noreferrer')
    expect(await screen.findByRole('img', { name: 'QR code for Give by card' })).toBeInTheDocument()
  })

  it('never makes a button of a link that is not https', async () => {
    rows.giving_links = [
      { id: 'l1', label: 'Sneaky', url: 'javascript:alert(1)', note: null, show_qr: true, sort_order: 0 },
      { id: 'l2', label: 'Real', url: 'https://paypal.me/church', note: null, show_qr: false, sort_order: 1 },
    ]
    show(<GivingPage />)
    await screen.findByRole('link', { name: /Real/ })
    expect(screen.queryByText('Sneaky')).toBeNull()
  })

  it('lists every bank account with each number ready to copy', async () => {
    rows.giving_bank_accounts = [
      { id: 'a1', label: 'Tithes and offerings', account_name: 'RIM', bank_name: 'Barclays', sort_code: '40-11-62', account_number: '12345678', iban: null, bic: null, reference: 'Your name + TITHE', notes: null, sort_order: 0 },
      { id: 'a2', label: 'Building fund', account_name: 'RIM Building', bank_name: null, sort_code: null, account_number: null, iban: 'GB29NWBK60161331926819', bic: null, reference: null, notes: null, sort_order: 1 },
    ]
    show(<GivingPage />)
    expect(await screen.findByText('Tithes and offerings')).toBeInTheDocument()
    expect(screen.getByText('Building fund')).toBeInTheDocument()
    expect(screen.getByText('GB29 NWBK 6016 1331 9268 19')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Copy Sort code' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Copy Reference' })).toBeInTheDocument()
  })

  it('shows the uploaded QR picture with its caption', async () => {
    rows.giving_page = [{ intro: 'Thank you!', qr_image_path: 'qr-1.png', qr_image_caption: 'Scan with your banking app' }]
    show(<GivingPage />)
    expect(await screen.findByText('Thank you!')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'QR code: Scan with your banking app' })).toHaveAttribute('src', 'https://signed/qr.png')
  })
})

describe('Giving in App settings', () => {
  beforeEach(() => {
    admin = true
  })

  it('previews a link before saving it, and will not take one that is not https', async () => {
    const user = show(<GivingSettingsCard />)
    await user.click(await screen.findByRole('button', { name: /Add a giving link/ }))
    const form = screen.getByRole('form', { name: 'New giving link' })
    await user.type(within(form).getByPlaceholderText('Give by card'), 'Give by card')
    const url = within(form).getByPlaceholderText('https://buy.stripe.com/…')
    await user.clear(url)
    await user.type(url, 'http://insecure.example')
    expect(within(form).getByRole('button', { name: 'Add link' })).toBeDisabled()
    expect(within(form).getByText(/has to start with https/)).toBeInTheDocument()

    await user.clear(url)
    await user.type(url, 'https://buy.stripe.com/abc')
    expect(within(form).getByRole('link', { name: /Give by card/ })).toHaveAttribute('href', 'https://buy.stripe.com/abc')
    expect(writes).toEqual([])

    await user.click(within(form).getByRole('button', { name: 'Add link' }))
    await waitFor(() =>
      expect(writes).toContainEqual({
        table: 'giving_links',
        op: 'insert',
        row: { label: 'Give by card', url: 'https://buy.stripe.com/abc', note: null, show_qr: true, sort_order: 0 },
      }),
    )
  })

  it('checks a bank account as it is typed and previews it before saving', async () => {
    const user = show(<GivingSettingsCard />)
    await user.click(await screen.findByRole('button', { name: /Add a bank account/ }))
    const form = screen.getByRole('form', { name: 'New bank account' })
    await user.type(within(form).getByPlaceholderText('Tithes and offerings'), 'Tithes and offerings')
    await user.type(within(form).getByPlaceholderText('Rehoboth International Ministries'), 'RIM')
    await user.type(within(form).getByPlaceholderText('40-11-62'), '4011')
    expect(within(form).getByText('A sort code is six digits.')).toBeInTheDocument()

    await user.type(within(form).getByPlaceholderText('40-11-62'), '62')
    await user.type(within(form).getByPlaceholderText('12345678'), '12345678')
    // The card as members will see it, before anything is saved.
    expect(within(form).getByText('40-11-62')).toBeInTheDocument()
    expect(writes).toEqual([])

    await user.click(within(form).getByRole('button', { name: 'Add account' }))
    await waitFor(() =>
      expect(writes).toContainEqual(
        expect.objectContaining({
          table: 'giving_bank_accounts',
          op: 'insert',
          row: expect.objectContaining({ label: 'Tithes and offerings', sort_code: '40-11-62', account_number: '12345678' }),
        }),
      ),
    )
  })
})
