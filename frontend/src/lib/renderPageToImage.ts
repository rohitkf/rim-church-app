import type { PdfPage } from './pdfDoc'

/**
 * The same page, painted rather than written.
 *
 * `PdfPage` is a list of rectangles, lines and text at points on a page —
 * nothing about it is specific to PDF, so it can just as well be drawn on
 * a canvas. That is what makes the JPG and the PDF the same document
 * instead of two that look alike until one is edited.
 *
 * Coordinates match: the page measures from the top left, and a canvas
 * does too. Text y is a baseline in both, which is why the default
 * `alphabetic` baseline is left alone.
 */
export async function renderPageToJpeg(page: PdfPage, scale = 2, quality = 0.92): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(page.width * scale)
  canvas.height = Math.round(page.height * scale)

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser would not give us a canvas to draw on.')

  ctx.scale(scale, scale)
  // JPEG has no transparency, so the paper has to be painted.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, page.width, page.height)

  for (const r of page.rects) {
    ctx.fillStyle = r.color ?? '#000000'
    const radius = Math.min(r.radius ?? 0, r.w / 2, r.h / 2)
    if (radius > 0) {
      ctx.beginPath()
      ctx.roundRect(r.x, r.y, r.w, r.h, radius)
      ctx.fill()
    } else {
      ctx.fillRect(r.x, r.y, r.w, r.h)
    }
  }

  for (const c of page.circles ?? []) {
    ctx.fillStyle = c.color ?? '#000000'
    ctx.beginPath()
    ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2)
    ctx.fill()
  }

  for (const l of page.lines ?? []) {
    ctx.save()
    ctx.strokeStyle = l.color ?? '#000000'
    ctx.lineWidth = l.width ?? 1
    if (l.dash) ctx.setLineDash(l.dash)
    ctx.beginPath()
    ctx.moveTo(l.x1, l.y1)
    ctx.lineTo(l.x2, l.y2)
    ctx.stroke()
    ctx.restore()
  }

  for (const t of page.texts) {
    ctx.fillStyle = t.color ?? '#000000'
    // Helvetica first, Arial behind it: the metrics the layout was
    // measured with belong to both, so the widths hold either way.
    ctx.font = t.mono
      ? `${t.bold ? 'bold ' : ''}${t.size}px "Courier New", Courier, monospace`
      : `${t.bold ? 'bold ' : ''}${t.size}px Helvetica, Arial, sans-serif`
    ctx.fillText(t.text, t.x, t.y)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not turn the page into an image.'))),
      'image/jpeg',
      quality,
    )
  })
}
