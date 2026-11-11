import { StrictMode } from 'react'
import { applyTheme, readThemePreference } from './lib/theme'
import { initPwa } from './lib/pwa'
import { stopPageZoom } from './lib/noPageZoom'
import { pointPageAtPublishedIcons } from './lib/appIcon'
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

// The tab's icon and the one an iPhone takes for its Home Screen are the
// church's logo when it has one (lib/appIcon). For everybody, signed in or
// not, since the sign-in page is where an app gets installed from.
void pointPageAtPublishedIcons()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
