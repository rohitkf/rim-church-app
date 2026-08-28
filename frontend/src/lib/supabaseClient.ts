import { createClient } from '@supabase/supabase-js'
import { fetchWithTimeout } from './fetchTimeout'
import { currentRoute, viaProxy } from './supabaseRoute'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

/**
 * Send each request down whichever road is currently in use. Read per
 * request rather than once at startup, so a session that has just had to
 * fall back doesn't need a reload to take effect.
 */
function routedFetch(baseFetch: typeof fetch): typeof fetch {
  return (input, init) => {
    if (currentRoute() === 'proxy') {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const rerouted = viaProxy(url, supabaseUrl ?? '')
      if (rerouted !== url) {
        // A Request carries its body as a stream that can only be read
        // once, so it is rebuilt around the new URL rather than copied.
        input = input instanceof Request ? new Request(rerouted, input) : rerouted
      }
    }
    return baseFetch(input, init)
  }
}

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
    global: { fetch: fetchWithTimeout(routedFetch(globalThis.fetch.bind(globalThis))) },
  },
)
