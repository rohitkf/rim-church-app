/**
 * A QR code as a grid of dark and light modules.
 *
 * Encoding one properly means Reed-Solomon error correction and mask
 * selection, which is the one part of this feature worth taking a
 * dependency on. Everything downstream — drawing it on screen, drawing it
 * into a PDF — works from the grid this returns.
 */
export async function qrModules(text: string): Promise<boolean[][]> {
  const { default: qrcode } = await import('qrcode-generator')

  // Type 0 lets the library pick the smallest version the text fits, and
  // 'M' recovers from about 15% damage — enough for a label that has been
  // on a flight case for a year.
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()

  const count = qr.getModuleCount()
  return Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, col) => qr.isDark(row, col)),
  )
}
