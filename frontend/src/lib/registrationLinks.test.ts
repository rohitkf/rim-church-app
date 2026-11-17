import { describe, expect, it } from 'vitest'
import { INVITE_PARAM, REGISTER_PATH, TICKET_PATH, codeFromScan, inviteUrl, registerUrl, ticketUrl } from './registrationLinks'
import { inviteTokenFrom } from './registrationInvites'
import App from '../App?raw'

/*
 * Links people already hold: a poster's /register/<slug>, a ticket's QR
 * code saying /ticket/<code>. Both are pinned here, path and route.
 */
describe('the registration links', () => {
  it('keep their paths, which posters and tickets already say', () => {
    expect(REGISTER_PATH).toBe('/register')
    expect(TICKET_PATH).toBe('/ticket')
  })

  it('still have their routes in the app', () => {
    expect(App).toContain(`path="${REGISTER_PATH}/:slug"`)
    expect(App).toContain(`path="${TICKET_PATH}/:code"`)
  })

  it('are built on the lasting address', () => {
    expect(registerUrl('pastors-2026', 'https://rim-church-app.vercel.app/')).toBe('https://rim-church-app.vercel.app/register/pastors-2026')
    expect(ticketUrl('ABCDEFGHJKMN', 'https://example.org')).toBe('https://example.org/ticket/ABCDEFGHJKMN')
  })

  it('builds an invitation link the page can read back, under the name links already sent use', () => {
    // Sent links say ?invite=: renaming it turns every one into a plain link, silently.
    expect(INVITE_PARAM).toBe('invite')
    const link = inviteUrl('harvest-supper', 'K7QM2XPA9R4T', 'https://rim-church-app.vercel.app')
    expect(link).toBe('https://rim-church-app.vercel.app/register/harvest-supper?invite=K7QM2XPA9R4T')
    expect(inviteTokenFrom(new URL(link).search)).toBe('K7QM2XPA9R4T')
  })

  it('finds the code in whatever was scanned or typed', () => {
    expect(codeFromScan('https://rim-church-app.vercel.app/ticket/ABCDEFGHJKMN')).toBe('ABCDEFGHJKMN')
    expect(codeFromScan('https://preview.example/ticket/ABCDEFGHJKMN?x=1')).toBe('ABCDEFGHJKMN')
    expect(codeFromScan(' abcdefghjkmn ')).toBe('ABCDEFGHJKMN')
    expect(codeFromScan('https://example.org/inventory/scan/123')).toBeNull()
    expect(codeFromScan('')).toBeNull()
  })
})
