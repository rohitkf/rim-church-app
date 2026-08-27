import { createClient } from '@supabase/supabase-js'
import { fetchWithTimeout } from './fetchTimeout'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

// A placeholder client is created either way so every module that imports
// `supabase` can do so unconditionally at module scope. When misconfigured,
// `isSupabaseConfigured` is false and `App` renders a configuration-error
// screen before anything tries to actually use this client — see
// ConfigErrorPage / App.tsx.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.invalid',
  supabaseAnonKey || 'placeholder',
  {
    // Nothing in supabase-js times out by itself, so a project that has
    // gone to sleep — or a phone that lost signal mid-request — leaves
    // every awaiting button spinning for ever. A deadline turns that into
    // an ordinary error the UI already knows how to report.
    global: { fetch: fetchWithTimeout(globalThis.fetch.bind(globalThis)) },
  },
)
