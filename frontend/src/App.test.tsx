import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The app boots against a data router (createBrowserRouter); this smoke
// test is what proves that wiring still mounts and routes, since a
// broken router config type-checks fine but blows up at runtime.
vi.mock('./lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}))

import App from './App'

describe('App', () => {
  it('mounts the router and redirects a signed-out visitor to sign in', async () => {
    window.history.pushState({}, '', '/')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})
