import { Component, type ErrorInfo, type ReactNode } from 'react'
import { errorSummary, isChunkLoadError, mayReloadOnce } from '../lib/pageErrors'
import { reloadApp } from '../lib/reloadApp'
import { BrokenPageScreen, StalePageScreen } from './ErrorScreen'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * The last net: whatever throws above the router, or in something the
 * router does not own (the providers, the update dialog).
 *
 * A page that fails is caught lower down, by the router's own error page
 * (pages/RouteErrorPage); this draws the same screens for the same
 * reasons, from the same judgement (lib/pageErrors), so somebody cannot
 * tell which net caught them — only that the app said what happened and
 * offered the way back.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack)
    // A release behind: reload for them, once.
    if (isChunkLoadError(error) && mayReloadOnce()) reloadApp()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const path = typeof window === 'undefined' ? '/' : window.location.pathname
    if (isChunkLoadError(error)) return <StalePageScreen onDashboard={path === '/'} />
    return <BrokenPageScreen path={path} summary={errorSummary(error)} />
  }
}
