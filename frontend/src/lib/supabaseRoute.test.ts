import { beforeEach, describe, expect, it } from 'vitest'
import { currentRoute, proxyUrl, setRoute, viaProxy } from './supabaseRoute'

const SUPABASE = 'https://project.supabase.co'

beforeEach(() => localStorage.clear())

describe('the route the app is using', () => {
  it('is the direct one until something says otherwise', () => {
    expect(currentRoute()).toBe('direct')
  })

  it('remembers a fallback, and forgets it when told to', () => {
    setRoute('proxy')
    expect(currentRoute()).toBe('proxy')
    setRoute('direct')
    expect(currentRoute()).toBe('direct')
    expect(localStorage.getItem('rim-supabase-route')).toBeNull()
  })
})

describe('viaProxy', () => {
  it('rewrites a Supabase URL onto this origin, path and query intact', () => {
    expect(viaProxy(`${SUPABASE}/auth/v1/token?grant_type=password`, SUPABASE)).toBe(
      '/sb/auth/v1/token?grant_type=password',
    )
    expect(viaProxy(`${SUPABASE}/rest/v1/services?select=*`, SUPABASE)).toBe(
      '/sb/rest/v1/services?select=*',
    )
  })

  it('leaves anything else alone', () => {
    expect(viaProxy('https://fonts.googleapis.com/css2', SUPABASE)).toBe(
      'https://fonts.googleapis.com/css2',
    )
    // No configured URL means nothing to rewrite against.
    expect(viaProxy(`${SUPABASE}/rest/v1/x`, '')).toBe(`${SUPABASE}/rest/v1/x`)
  })
})

describe('proxyUrl', () => {
  it('builds a same-origin path either way it is given one', () => {
    expect(proxyUrl('/auth/v1/token')).toBe('/sb/auth/v1/token')
    expect(proxyUrl('auth/v1/token')).toBe('/sb/auth/v1/token')
  })
})
