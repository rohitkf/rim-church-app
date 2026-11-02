import { describe, expect, it } from 'vitest'
import { suggestSongs, type LibrarySong } from './songLibrary'

const song = (title: string, times_sung = 1): LibrarySong => ({
  id: title,
  title,
  song_key: null,
  link: null,
  lyrics: null,
  last_sung_on: null,
  times_sung,
})

const library = [song('Goodness of God', 5), song('What a God', 2), song('God is good, all the time!', 9), song('Raise a Hallelujah')]

describe('suggestSongs', () => {
  it('offers nothing for an empty box', () => {
    expect(suggestSongs(library, '  ')).toEqual([])
  })

  it('puts titles that start with what was typed first, then the most sung', () => {
    expect(suggestSongs(library, 'go').map((s) => s.title)).toEqual([
      'God is good, all the time!',
      'Goodness of God',
      'What a God',
    ])
  })

  it('ignores case and extra spaces', () => {
    expect(suggestSongs(library, 'RAISE   a').map((s) => s.title)).toEqual(['Raise a Hallelujah'])
  })

  it('does not offer the song that is already typed in full', () => {
    expect(suggestSongs(library, 'what a god')).toEqual([])
  })
})
