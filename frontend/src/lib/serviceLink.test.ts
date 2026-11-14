import { describe, expect, it } from 'vitest'
import { serviceLink, serviceLinkPatch } from './serviceLink'

describe('a service’s link, as it is drawn', () => {
  it('is nothing when the service has none', () => {
    expect(serviceLink({ link: null, link_label: null })).toBeNull()
    expect(serviceLink({})).toBeNull()
    expect(serviceLink(undefined)).toBeNull()
  })

  it('carries the name the planner gave it', () => {
    expect(serviceLink({ link: 'https://example.org/live', link_label: ' Livestream ' })).toEqual({
      url: 'https://example.org/live',
      label: 'Livestream',
    })
  })

  it('is called "Open link" when nobody named it', () => {
    expect(serviceLink({ link: 'https://example.org/live', link_label: null })?.label).toBe('Open link')
  })

  it('never makes a script tappable, whatever the row says', () => {
    expect(serviceLink({ link: 'javascript:alert(1)', link_label: 'Livestream' })).toBeNull()
  })
})

describe('a service’s link, as it is saved', () => {
  it('gives a bare www. address https', () => {
    expect(serviceLinkPatch(' www.example.org/live ', 'Livestream')).toEqual({
      link: 'https://www.example.org/live',
      link_label: 'Livestream',
    })
  })

  it('saves no name when none was typed', () => {
    expect(serviceLinkPatch('https://example.org', '  ')).toEqual({ link: 'https://example.org', link_label: null })
  })

  it('clears the name with the address', () => {
    expect(serviceLinkPatch('', 'Livestream')).toEqual({ link: null, link_label: null })
  })

  it('refuses what is not a web address', () => {
    expect(serviceLinkPatch('the usual place', '')).toBe(false)
    expect(serviceLinkPatch('javascript:alert(1)', '')).toBe(false)
  })

  it('keeps the name to what the database holds', () => {
    const patch = serviceLinkPatch('https://example.org', 'x'.repeat(60))
    expect(patch && patch.link_label).toHaveLength(40)
  })
})
