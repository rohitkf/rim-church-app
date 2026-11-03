import { describe, expect, it } from 'vitest'
import { directionsUrl } from './directions'

describe('directionsUrl', () => {
  it('opens Apple Maps on an iPhone and Google Maps elsewhere', () => {
    const pin = { latitude: 51.5, longitude: -0.12 }
    expect(directionsUrl(pin, 'ios')).toBe('https://maps.apple.com/?daddr=51.5%2C-0.12')
    expect(directionsUrl(pin, 'android')).toBe('https://www.google.com/maps/dir/?api=1&destination=51.5%2C-0.12')
    expect(directionsUrl(pin, 'desktop')).toContain('google.com/maps')
  })

  it('falls back on the address when there is no pin', () => {
    expect(directionsUrl({ name: 'Church Hall', address: '1 High St, Reading' }, 'android')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Church%20Hall%2C%201%20High%20St%2C%20Reading',
    )
  })

  it('has nowhere to go with neither', () => {
    expect(directionsUrl({}, 'ios')).toBeNull()
    expect(directionsUrl({ address: '  ' }, 'ios')).toBeNull()
  })
})
