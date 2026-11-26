import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PrivacyPage } from './PrivacyPage'
import app from '../App.tsx?raw'
import signup from './SignupPage.tsx?raw'
import login from './LoginPage.tsx?raw'
import vercel from '../../vercel.json'

vi.mock('../lib/supabaseClient', () => ({ supabase: { storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: null }) }) } } }))

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
    expect(screen.getByText(/Ask for your account to be removed/)).toBeInTheDocument()
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
