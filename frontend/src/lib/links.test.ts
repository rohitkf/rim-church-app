import { describe, expect, it } from 'vitest'
import { splitLinks } from './links'

const links = (text: string) => splitLinks(text).filter((p) => p.href).map((p) => [p.text, p.href])

describe('web addresses in what people write', () => {
  it('finds http, https and www addresses, and leaves the rest as text', () => {
    expect(splitLinks('Sign up at https://forms.gle/abc123 by Friday')).toEqual([
      { text: 'Sign up at ' },
      { text: 'https://forms.gle/abc123', href: 'https://forms.gle/abc123' },
      { text: ' by Friday' },
    ])
    expect(links('live on www.youtube.com/@rehoboth tonight')).toEqual([
      ['www.youtube.com/@rehoboth', 'https://www.youtube.com/@rehoboth'],
    ])
    expect(links('http://old.example.org/a?b=1&c=2#top')).toEqual([
      ['http://old.example.org/a?b=1&c=2#top', 'http://old.example.org/a?b=1&c=2#top'],
    ])
    expect(splitLinks('No links here.')).toEqual([{ text: 'No links here.' }])
  })

  it('leaves the end of the sentence off the address', () => {
    expect(links('See https://example.org/page.')).toEqual([['https://example.org/page', 'https://example.org/page']])
    expect(links('(details: https://example.org/x)')).toEqual([['https://example.org/x', 'https://example.org/x']])
    expect(links('https://en.wikipedia.org/wiki/Psalm_(song), read it!')).toEqual([
      ['https://en.wikipedia.org/wiki/Psalm_(song)', 'https://en.wikipedia.org/wiki/Psalm_(song)'],
    ])
    expect(splitLinks('Go to https://a.org/x!')).toEqual([
      { text: 'Go to ' },
      { text: 'https://a.org/x', href: 'https://a.org/x' },
      { text: '!' },
    ])
  })

  it('finds every address, across lines', () => {
    expect(links('one https://a.org\ntwo https://b.org')).toEqual([
      ['https://a.org', 'https://a.org'],
      ['https://b.org', 'https://b.org'],
    ])
  })

  it('never makes a link of anything but the web', () => {
    expect(links('javascript:alert(1) data:text/html,hi mailto:a@b.org')).toEqual([])
    expect(links('see www. and https:// alone')).toEqual([])
  })
})
