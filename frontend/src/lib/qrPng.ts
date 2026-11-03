import { qrModules } from './qrMatrix'

/**
 * A QR code as a PNG to download (0247): for a poster, a slide, a
 * WhatsApp message — anywhere a link cannot be tapped. Drawn on a canvas
 * with the quiet zone a reader needs, and a caption under it.
 */
export async function qrPngBlob(text: string, caption?: string, scale = 10): Promise<Blob> {
  const modules = await qrModules(text)
  const count = modules.length
  const quiet = 4
  const side = (count + quiet * 2) * scale
  const captionHeight = caption ? scale * 6 : 0
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side + captionHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot draw the picture.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  modules.forEach((row, r) => {
    row.forEach((on, c) => {
      if (on) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale)
    })
  })
  if (caption) {
    ctx.fillStyle = '#14143a'
    ctx.font = `600 ${scale * 2.2}px -apple-system, Segoe UI, Helvetica, Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(caption, side / 2, side + captionHeight / 2 - scale, side - scale * 4)
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the QR code.'))), 'image/png')
  })
}

/** Hand a file to the browser to save. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
