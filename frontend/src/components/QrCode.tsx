import { useEffect, useState } from 'react'
import { qrModules } from '../lib/qrMatrix'

/** The QR drawn as one path of squares — sharp at any size, no image to load. */
export function QrSvg({
  modules,
  className = '',
  label,
}: {
  modules: boolean[][]
  className?: string
  label: string
}) {
  const count = modules.length
  const squares: string[] = []
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (modules[row][col]) squares.push(`M${col} ${row}h1v1h-1z`)
    }
  }
  return (
    <svg viewBox={`-2 -2 ${count + 4} ${count + 4}`} className={className} role="img" aria-label={label}>
      {/* The quiet zone has to be white too, or a reader loses the edge. */}
      <rect x={-2} y={-2} width={count + 4} height={count + 4} fill="#ffffff" />
      <path d={squares.join('')} fill="#000000" />
    </svg>
  )
}

/** A QR code for some text, encoded when it changes. */
export function QrCode({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  const [modules, setModules] = useState<boolean[][] | null>(null)
  useEffect(() => {
    let live = true
    void qrModules(text).then((m) => {
      if (live) setModules(m)
    })
    return () => {
      live = false
    }
  }, [text])
  if (!modules) return <div className={`animate-pulse rounded bg-surface-container ${className}`} aria-hidden="true" />
  return <QrSvg modules={modules} className={className} label={label} />
}
