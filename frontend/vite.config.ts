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
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
