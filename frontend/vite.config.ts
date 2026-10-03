import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolveBuildId, serviceWorkerBuildId } from './build/swBuildId.ts'

// One id, spent in two places: stamped into the service worker so the file
// differs between deploys, and handed to the app so a page can tell whether
// the worker that just installed is the build it is already running.
const buildId = resolveBuildId()

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerBuildId(buildId)],
  define: { __RIM_BUILD_ID__: JSON.stringify(buildId) },
  // The project root and the push sender, and nothing more of the repo:
  // a test reads push-notify's copy of the notification map to hold it to
  // the app's (src/lib/notificationLink.test.ts), and another reads the
  // page-access rules out of migration 0123 to hold them to
  // lib/pageAccess. The dev server serves what this allows, so it names
  // those two folders rather than the parent (a single file is not
  // accepted, or the migrations would be one file).
  server: {
    fs: {
      allow: [
        '.',
        '../supabase/functions/push-notify',
        '../supabase/migrations',
      ],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
