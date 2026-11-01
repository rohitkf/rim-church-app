import { StrictMode } from 'react'
import { applyTheme, readThemePreference } from './lib/theme'
import { initPwa } from './lib/pwa'
import { stopPageZoom } from './lib/noPageZoom'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

applyTheme(readThemePreference())

// Registers the service worker and starts watching for install offers,
// updates and the network dropping. Safe to call before React mounts —
// nothing it does touches the DOM.
initPwa()

// No pinch-zooming the page on an iPhone (lib/noPageZoom).
stopPageZoom()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
