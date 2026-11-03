/*
 * Pounds and pence (0244). Prices are kept in pence, whole numbers, so
 * nothing is ever a penny out from floating-point arithmetic.
 */

/** "£12.50", "£0.00". */
export function pounds(pence: number): string {
  const sign = pence < 0 ? '-' : ''
  const abs = Math.abs(pence)
  return `${sign}£${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** "£12.50", or "Free" for nothing at all. */
export function priceWords(pence: number): string {
  return pence === 0 ? 'Free' : pounds(pence)
}

/**
 * What somebody typed into a price box, in pence: "12.50", "12", "£12.5",
 * " 0.99 ". Null for anything that is not a price (or a negative one).
 */
export function parsePounds(text: string): number | null {
  const cleaned = text.replace(/[£,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole, frac = ''] = cleaned.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

/** Pence as the text a price box holds: 1250 → "12.50"; 0 → "". */
export function poundsText(pence: number | null | undefined): string {
  if (!pence) return ''
  return `${Math.floor(pence / 100)}.${String(pence % 100).padStart(2, '0')}`
}
