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
  // the app's (src/lib/notificationLink.test.ts). The dev server serves
  // what this allows, so it names the one folder rather than the parent.
  server: { fs: { allow: ['.', '../supabase/functions/push-notify'] } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
