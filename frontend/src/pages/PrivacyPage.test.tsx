import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrivacyPage } from './PrivacyPage'
import app from '../App.tsx?raw'
import signup from './SignupPage.tsx?raw'
import login from './LoginPage.tsx?raw'
import vercel from '../../vercel.json'

// What the church has said about itself (0334): nothing, unless a test says so.
const said = vi.hoisted(() => ({ details: {} as Record<string, string>, fails: false }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: null }) }) },
    rpc: (name: string) =>
      Promise.resolve(
        name === 'privacy_details' && !said.fails ? { data: said.details, error: null } : { data: null, error: { message: 'no' } },
      ),
  },
}))

/*
 * What the app keeps about you. Until November 2026 nothing in the app
 * said: somebody signing up gave a phone number and a date of birth with
 * no page to tell them who would see them or for how long.
 */
describe('the page that says what is kept', () => {
  const show = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <PrivacyPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

  it('says what is kept, who sees it, how long, where, and how to have it removed', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'What the app keeps about you' })).toBeInTheDocument()
    for (const part of ['What you give it', 'What it keeps as you use it', 'If you register for an event', 'Who can see it', 'How long it is kept', 'Where it is held', 'Your choices', 'If something is not right']) {
      expect(screen.getByRole('heading', { level: 2, name: part })).toBeInTheDocument()
    }
    // The three things somebody most wants to know.
    expect(screen.getByText(/never sees or stores a card number/)).toBeInTheDocument()
    expect(screen.getByText(/read once, when you press Clock in, and never in the background/)).toBeInTheDocument()
    // Both done by the person themselves now (0334), from one room of Settings.
    expect(screen.getByText(/Download a copy of everything held about you/)).toBeInTheDocument()
    expect(screen.getByText(/Remove your account yourself/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings, Your account' })).toHaveAttribute('href', '/settings/account')
  })

  it('shows who to ask and what the church says in its own words, once the church has said them', async () => {
    said.details = { contact_name: 'The church office', contact_email: 'office@church.test', postal_address: '1 High Street\nTown', note: 'We keep this to run our teams.\n\nCharity number 123.' }
    show()
    const heading = await screen.findByRole('heading', { level: 2, name: 'Who to ask' })
    const part = heading.closest('section')!
    expect(part).toHaveTextContent('For anything about your information, ask The church office at office@church.test. By post: 1 High Street, Town.')
    expect(screen.getByRole('link', { name: 'office@church.test' })).toHaveAttribute('href', 'mailto:office@church.test')
    expect(screen.getByText(/We keep this to run our teams/)).toHaveTextContent('Charity number 123.')
    said.details = {}
  })

  it('reads as it always did when the church has said nothing, or could not be asked', async () => {
    show()
    await screen.findByRole('heading', { level: 2, name: 'If something is not right' })
    expect(screen.queryByRole('heading', { name: 'Who to ask' })).toBeNull()
    said.fails = true
    show()
    expect(screen.queryByRole('heading', { name: 'Who to ask' })).toBeNull()
    said.fails = false
  })

  it('treats what the church typed as words and nothing else', async () => {
    said.details = { note: '<img src=x onerror=alert(1)><b>bold</b>' }
    const { container } = show()
    expect(await screen.findByText('<img src=x onerror=alert(1)><b>bold</b>')).toBeInTheDocument()
    expect(container.querySelector('article img, article b')).toBeNull()
    said.details = {}
  })

  it('is open without signing in, and linked from where an account is made and used', () => {
    // Outside the signed-in routes: it has to be readable before anything is given.
    expect(app.indexOf('path="/privacy"')).toBeGreaterThan(-1)
    expect(app.indexOf('path="/privacy"')).toBeLessThan(app.indexOf('<Route element={<ProtectedRoute />}>'))
    expect(signup).toContain('to="/privacy"')
    expect(login).toContain('to="/privacy"')
  })
})

describe('what the browser is told the site may do', () => {
  it('leaves the camera, microphone and location to this site and switches the rest off', () => {
    const all = vercel.headers.find((h) => h.source === '/(.*)')
    const policy = all?.headers.find((h) => h.key === 'Permissions-Policy')?.value ?? ''
    // What the app uses: the door's scanner, speaking to the assistant, Clock in.
    for (const kept of ['camera=(self)', 'microphone=(self)', 'geolocation=(self)']) expect(policy).toContain(kept)
    for (const off of ['payment=()', 'usb=()', 'bluetooth=()']) expect(policy).toContain(off)
  })
})
