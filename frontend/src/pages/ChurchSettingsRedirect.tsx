import { Navigate, useLocation } from 'react-router-dom'

/**
 * App settings was one room holding four — timings, the rota's look,
 * Giving and the menu — reached by anchors. Each is its own room now; the
 * old address, and each old anchor, lands in the room it became.
 */
export function ChurchSettingsRedirect() {
  const { hash } = useLocation()
  const room = ({ '#rota': 'rota', '#giving': 'giving', '#menu': 'menu' } as Record<string, string>)[hash] ?? 'timings'
  return <Navigate to={`/settings/${room}`} replace />
}
