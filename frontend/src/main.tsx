import { StrictMode } from 'react'
import { applyTheme, readThemePreference } from './lib/theme'
import { initPwa, isStandalone } from './lib/pwa'
import { noteAtStart } from './lib/installedIdentity'
import { stopPageZoom } from './lib/noPageZoom'
import { pointPageAtPublishedIcons } from './lib/appIcon'
import { installErrorReporting } from './lib/clientErrors'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

applyTheme(readThemePreference())

// What nothing else catches — an error in a timer or a handler, a promise
// nobody awaited — is told to the church (lib/clientErrors, 0284). First,
// so that a failure in anything below is heard too.
installErrorReporting()

// Registers the service worker and starts watching for install offers,
// updates and the network dropping. Safe to call before React mounts —
// nothing it does touches the DOM.
initPwa()

// Before anybody signs in: is this a copy that has just been installed, or
// one that was in use already? Only the second can be wearing an old icon
// (lib/installedIdentity), and only now can the two be told apart.
noteAtStart(isStandalone())

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
