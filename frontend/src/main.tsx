import { StrictMode } from 'react'
import { applyTheme, readThemePreference } from './lib/theme'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

applyTheme(readThemePreference())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
