import { describe, expect, it } from 'vitest'
import { parsePounds, pounds, poundsText, priceWords } from './money'

describe('money', () => {
  it('prints pence as pounds', () => {
    expect(pounds(1250)).toBe('£12.50')
    expect(pounds(5)).toBe('£0.05')
    expect(pounds(0)).toBe('£0.00')
    expect(pounds(-250)).toBe('-£2.50')
    expect(priceWords(0)).toBe('Free')
    expect(priceWords(2000)).toBe('£20.00')
  })

  it('reads what people type', () => {
    expect(parsePounds('12.50')).toBe(1250)
    expect(parsePounds('12')).toBe(1200)
    expect(parsePounds('£12.5')).toBe(1250)
    expect(parsePounds(' 0.99 ')).toBe(99)
    expect(parsePounds('1,000')).toBe(100000)
    expect(parsePounds('')).toBeNull()
    expect(parsePounds('-5')).toBeNull()
    expect(parsePounds('12.345')).toBeNull()
    expect(parsePounds('ten')).toBeNull()
  })

  it('puts a price back into its box', () => {
    expect(poundsText(1250)).toBe('12.50')
    expect(poundsText(500)).toBe('5.00')
    expect(poundsText(0)).toBe('')
    expect(poundsText(null)).toBe('')
  })
})
