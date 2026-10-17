import { A4, type PdfCircle, type PdfLine, type PdfPage, type PdfRect, type PdfText } from './pdfDoc'
import { fitBlock, textWidth, truncateToWidth } from './helveticaMetrics'
import { inkOn } from './stage'
import type { SheetTheme } from './serviceSheet'

/**
 * A stage layout as a sheet — the drawing the page shows, turned into a
 * file to print or send on.
 *
 * Built as page primitives, like the running order (lib/serviceSheet), so
 * one description becomes both the PDF and the JPG. Landscape, because a
 * stage is wider than it is tall and a portrait page would shrink it to
 * a strip. The blocks keep their colours in both themes: they are the
 * thing somebody reads off the sheet, and a block that changed colour on
 * paper would not be the block they moved on the screen.
 */

export interface StageSheetBlock {
  /** The region it is in, by name. */
  area_id: string
  label: string
  person: string | null
  color: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  kind: 'block' | 'seats'
  seats: number
}

export interface StageSheetRegion {
  name: string
  top: number
  left: number
  width: number
  height: number
  topLabel: string
  bottomLabel: string
}

export interface StageSheet {
  /** "English Service" */
  title: string
  /** "Sunday, 19 October 2026" */
  subtitle: string
  /** The areas, as regions of one workspace (lib/stage regionsOf). */
  regions: StageSheetRegion[]
  blocks: StageSheetBlock[]
  /** "Last changed by Rohit K, 17 Oct 09:24 · exported 18/10/2026" */
  footer: string
}

const PALETTE: Record<SheetTheme, { backdrop: string; stage: string; ink: string; muted: string; rail: string; front: string }> = {
  dark: { backdrop: '#000000', stage: '#141418', ink: '#f5f5f7', muted: '#a5a5ab', rail: '#38383f', front: '#0a84ff' },
  light: { backdrop: '#ffffff', stage: '#f2f2f7', ink: '#1c1c1e', muted: '#57575c', rail: '#c7c7cc', front: '#007aff' },
}

const PAD = 36
const TITLE_SIZE = 22
const SUB_SIZE = 10.5
const EDGE_H = 18

/** Landscape A4: the page on its side. */
export const LANDSCAPE = { width: A4.height, height: A4.width }

/** The workspace's own extent: as wide as its widest region, as tall as all of them. */
function extentOf(regions: StageSheetRegion[]): { width: number; height: number } {
  if (regions.length === 0) return { width: 1200, height: 700 }
  return {
    width: Math.max(...regions.map((r) => r.left + r.width)),
    height: Math.max(...regions.map((r) => r.top + r.height)),
  }
}

export function stageSheetPage(sheet: StageSheet, theme: SheetTheme = 'dark'): PdfPage {
  const P = PALETTE[theme]
  const texts: PdfText[] = []
  const rects: PdfRect[] = []
  const lines: PdfLine[] = []
  const circles: PdfCircle[] = []
  // A wide workspace (one stage) lies on its side; a tall one (stage over
  // hall) stands up, so neither is a strip across the middle of the page.
  const extent = extentOf(sheet.regions)
  const landscape = extent.width >= extent.height
  const W = landscape ? LANDSCAPE.width : A4.width
  const H = landscape ? LANDSCAPE.height : A4.height

  rects.push({ x: 0, y: 0, w: W, h: H, color: P.backdrop })

  // Title and subtitle, as the page has them.
  texts.push({ x: PAD, y: PAD + 18, size: TITLE_SIZE, text: truncateToWidth(sheet.title, TITLE_SIZE, W - PAD * 2, true), bold: true, color: P.ink })
  texts.push({ x: PAD, y: PAD + 36, size: SUB_SIZE, text: truncateToWidth(sheet.subtitle, SUB_SIZE, W - PAD * 2, false, true), mono: true, color: P.muted })

  // The workspace, scaled to what is left of the page, kept in proportion.
  const boxTop = PAD + 52
  const boxH = H - boxTop - PAD - 16
  const boxW = W - PAD * 2
  const scale = Math.min(boxW / extent.width, boxH / extent.height)
  const sw = extent.width * scale
  const sx = PAD + (boxW - sw) / 2
  const sy = boxTop
  const at = (v: number) => v * scale

  const edge = (label: string, x: number, w: number, y: number, color: string) => {
    const text = label.toUpperCase()
    texts.push({ x: x + (w - textWidth(text, 7.5, false, true)) / 2, y, size: 7.5, text, mono: true, color })
  }
  // Each region: a panel with its far edge as a quiet band and its near
  // edge as a dashed line, its name in the corner.
  for (const r of sheet.regions) {
    const rx = sx + at(r.left)
    const ry = sy + at(r.top)
    const rw = at(r.width)
    const rh = at(r.height)
    rects.push({ x: rx, y: ry, w: rw, h: rh, color: P.stage, radius: 10 })
    rects.push({ x: rx, y: ry, w: rw, h: EDGE_H, color: P.rail, radius: 10 })
    rects.push({ x: rx, y: ry + EDGE_H / 2, w: rw, h: EDGE_H / 2, color: P.rail })
    edge(r.topLabel, rx, rw, ry + 12.5, P.muted)
    texts.push({ x: rx + 8, y: ry + 12.5, size: 7, text: r.name.toUpperCase(), mono: true, color: P.ink })
    lines.push({ x1: rx + 8, y1: ry + rh - EDGE_H, x2: rx + rw - 8, y2: ry + rh - EDGE_H, width: 1, color: P.front, dash: [4, 3] })
    edge(r.bottomLabel, rx, rw, ry + rh - 5.5, P.front)
  }

  // The blocks, in their own colours, each at its place in its region. A
  // turned block is drawn upright: the sheet is a map, and a map is read,
  // not rotated.
  for (const b of sheet.blocks) {
    const r = sheet.regions.find((x) => x.name === b.area_id) ?? sheet.regions[0]
    const x = sx + at((r?.left ?? 0) + b.x)
    const y = sy + at((r?.top ?? 0) + b.y)
    const w = at(b.w)
    const h = at(b.h)
    const ink = inkOn(b.color)
    rects.push({ x, y, w, h, color: b.color, radius: Math.min(6, w / 4, h / 4) })

    if (b.kind === 'seats') {
      const n = Math.max(1, b.seats)
      const labelSize = Math.max(5, Math.min(8, h * 0.22))
      texts.push({ x: x + 4, y: y + labelSize + 2, size: labelSize, text: truncateToWidth(`${b.label} · ${b.seats}`, labelSize, w - 8, true), bold: true, color: ink })
      const gap = 1.5
      const r = Math.max(1.2, Math.min((h - labelSize - 8) / 2, (w - 8 - gap * (n - 1)) / n / 2))
      const rowW = n * r * 2 + gap * (n - 1)
      const cy = y + labelSize + 6 + (h - labelSize - 8) / 2
      for (let i = 0; i < n; i += 1) {
        circles.push({ cx: x + (w - rowW) / 2 + r + i * (r * 2 + gap), cy, r, color: ink })
      }
      continue
    }

    const maxSize = Math.max(6, Math.min(13, h * 0.28, w * 0.16))
    const label = fitBlock(b.label, maxSize, 5, w - 8, 2, true)
    const lineH = label.size * 1.15
    const personSize = Math.max(4.5, label.size * 0.72)
    const total = label.lines.length * lineH + (b.person ? personSize * 1.3 : 0)
    let ty = y + (h - total) / 2 + label.size
    for (const line of label.lines) {
      texts.push({ x: x + (w - textWidth(line, label.size, true)) / 2, y: ty, size: label.size, text: line, bold: true, color: ink })
      ty += lineH
    }
    if (b.person) {
      const who = truncateToWidth(b.person, personSize, w - 8)
      texts.push({ x: x + (w - textWidth(who, personSize)) / 2, y: ty + personSize * 0.2, size: personSize, text: who, color: ink })
    }
  }

  texts.push({ x: PAD, y: H - PAD + 10, size: 8, text: truncateToWidth(sheet.footer, 8, W - PAD * 2, false, true), mono: true, color: P.muted })

  return { width: W, height: H, texts, rects, lines, circles, background: P.backdrop }
}
