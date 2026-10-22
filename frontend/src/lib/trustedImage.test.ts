import { describe, expect, it } from 'vitest'
import { trustedImageUrl } from './trustedImage'

const base = 'https://example.supabase.co'

describe('trustedImageUrl', () => {
  it('renders a picture from the app\'s own storage', () => {
    expect(trustedImageUrl(`${base}/storage/v1/object/sign/avatars/a/b.png?token=x`, base)).toBe(
      `${base}/storage/v1/object/sign/avatars/a/b.png?token=x`,
    )
    expect(trustedImageUrl(`${base}/storage/v1/object/public/avatars/a.png`, base)).toContain('/storage/v1/')
  })

  it('refuses any other host, a different path, and odd schemes', () => {
    expect(trustedImageUrl('https://evil.example/beacon.png', base)).toBeNull()
    expect(trustedImageUrl('//evil.example/beacon.png', base)).toBeNull()
    expect(trustedImageUrl(`${base}/rest/v1/profiles`, base)).toBeNull()
    expect(trustedImageUrl('javascript:alert(1)', base)).toBeNull()
    expect(trustedImageUrl('data:image/png;base64,AAAA', base)).toBeNull()
    expect(trustedImageUrl('http://example.supabase.co/storage/v1/object/x', base)).toBeNull()
  })

  it('shows nothing for empty, bare paths, or an unconfigured app', () => {
    expect(trustedImageUrl(null, base)).toBeNull()
    expect(trustedImageUrl('', base)).toBeNull()
    expect(trustedImageUrl('avatars/a.png', base)).toBeNull()
    expect(trustedImageUrl(`${base}/storage/v1/object/public/avatars/a.png`, undefined)).toBeNull()
  })
})
