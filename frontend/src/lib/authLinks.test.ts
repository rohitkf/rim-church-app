import { describe, expect, it } from 'vitest'
import { confirmationLanding, linkProblem } from './authLinks'

describe('where a confirmation link lands', () => {
  it('is the sign-in page of the site it was asked from, and never a pattern', () => {
    expect(confirmationLanding('https://rim-church-app.vercel.app')).toBe('https://rim-church-app.vercel.app/login')
    expect(confirmationLanding()).toBe(`${window.location.origin}/login`)
    expect(confirmationLanding('https://rim-church-app.vercel.app')).not.toContain('*')
  })
})

describe('a link that did not work', () => {
  it('is nothing for an ordinary address, or one that carries a session', () => {
    expect(linkProblem('')).toBeNull()
    expect(linkProblem('#')).toBeNull()
    expect(linkProblem('#access_token=abc&refresh_token=def&type=signup')).toBeNull()
    expect(linkProblem('', '?removed=1')).toBeNull()
  })

  it('says a link has expired or been used, and what to do, in the app’s own words', () => {
    const said = linkProblem('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
    expect(said).toMatch(/^That link has expired, or has already been used\./)
    expect(said).toContain('sign in below')
    expect(said).toContain('sign up again with the same address')
    // Not the service's sentence.
    expect(said).not.toContain('Email link is invalid')
  })

  it('reads it from the query too, where some links put it', () => {
    expect(linkProblem('', '?error=access_denied&error_code=otp_expired')).toMatch(/expired/)
  })

  it('says something useful of any other failure', () => {
    expect(linkProblem('#error=server_error&error_description=Something+else')).toBe(
      'That link did not work. Sign in below, or sign up again with the same address for a new one.',
    )
  })
})
