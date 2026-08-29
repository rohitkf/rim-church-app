import { useEffect, useState } from 'react'
import { Overlay } from './Surface'
import { qrModules } from '../lib/qrMatrix'
import { itemScanUrl } from '../lib/qrLink'
import { itemLabelPdf, type LabelField } from '../lib/itemLabelPdf'
import { downloadFile } from '../lib/downloadFile'
import { formatMoney, itemValue, kindOf, statusOf, STATUS_LABEL } from '../lib/inventory'
import type { InventoryItem } from '../lib/types'

/** The QR drawn as one path of squares — sharp at any size, no image to load. */
function QrSvg({ modules, className = '' }: { modules: boolean[][]; className?: string }) {
  const count = modules.length
  const squares: string[] = []
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (modules[row][col]) squares.push(`M${col} ${row}h1v1h-1z`)
    }
  }
  return (
    <svg
      viewBox={`-2 -2 ${count + 4} ${count + 4}`}
      className={className}
      role="img"
      aria-label="QR code for this item"
    >
      {/* The quiet zone has to be white too, or a reader loses the edge. */}
      <rect x={-2} y={-2} width={count + 4} height={count + 4} fill="#ffffff" />
      <path d={squares.join('')} fill="#000000" />
    </svg>
  )
}

/** What goes on the printed label, in the order it reads best. */
function labelFields(item: InventoryItem, teamName: string | null): LabelField[] {
  const fields: LabelField[] = [{ label: 'Asset tag', value: item.asset_tag ?? '—' }]
  if (teamName) fields.push({ label: 'Team', value: teamName })
  if (item.model) fields.push({ label: 'Model', value: item.model })
  if (item.serial_number) fields.push({ label: 'Serial', value: item.serial_number })
  fields.push({ label: 'Kind', value: kindOf(item) === 'consumable' ? 'Consumable' : 'Asset' })
  fields.push({ label: 'Status', value: STATUS_LABEL[statusOf(item)] })
  if (kindOf(item) === 'consumable') {
    fields.push({ label: 'Quantity', value: String(item.quantity) })
  }
  if (item.location) fields.push({ label: 'Location', value: item.location })
  const value = itemValue(item)
  if (value > 0) fields.push({ label: 'Value', value: formatMoney(value) })
  fields.push({
    label: 'Last checked',
    value: item.last_audited_at ? new Date(item.last_audited_at).toLocaleDateString() : 'never',
  })
  return fields
}

/**
 * One item's QR code, on screen and on paper.
 *
 * The code carries a link rather than a bare id, so the phone camera
 * everyone already has opens the item without the app being involved
 * first. The printed sheet repeats everything the register knows, because
 * a label that only works when the code scans is a label that stops
 * working the day it gets scuffed.
 */
export function ItemQrDialog({
  item,
  teamName,
  onClose,
}: {
  item: InventoryItem
  teamName: string | null
  onClose: () => void
}) {
  const [modules, setModules] = useState<boolean[][] | null>(null)
  const [busy, setBusy] = useState(false)
  const url = itemScanUrl(window.location.origin, item.id)

  useEffect(() => {
    let live = true
    void qrModules(url).then((m) => {
      if (live) setModules(m)
    })
    return () => {
      live = false
    }
  }, [url])

  async function printLabel() {
    if (!modules) return
    setBusy(true)
    try {
      const pdf = itemLabelPdf({
        title: item.name,
        subtitle: [teamName, 'Equipment register'].filter(Boolean).join(' — '),
        fields: labelFields(item, teamName),
        modules,
        caption: `Scan to open this item in the app${item.asset_tag ? ` · ${item.asset_tag}` : ''}`,
        footer: `Rehoboth International Ministries · printed ${new Date().toLocaleDateString()}`,
      })
      const stem = (item.asset_tag ?? item.name).replace(/[^\w-]+/g, '-').toLowerCase()
      downloadFile(pdf, `${stem}-label.pdf`, 'application/pdf')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay label={`QR code for ${item.name}`} align="sheet" onDismiss={onClose}>
      <div className="w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-6 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-md sm:rounded-[var(--radius-card)]">
        <h2 className="text-headline-md">{item.name}</h2>
        <p className="mt-1 font-mono text-label-sm text-on-surface-variant">
          {item.asset_tag ?? 'No asset tag'}
        </p>

        <div className="mt-5 flex justify-center">
          {modules ? (
            <QrSvg modules={modules} className="h-56 w-56 rounded-[var(--radius-chip)]" />
          ) : (
            <div className="h-56 w-56 animate-pulse rounded-[var(--radius-chip)] bg-raised" />
          )}
        </div>

        <p className="mt-4 break-all text-center text-label-sm text-on-surface-faint">{url}</p>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="tap rounded-full hairline px-4 py-2.5 text-body-sm font-medium text-on-surface"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void printLabel()}
            disabled={!modules || busy}
            className="tap rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Preparing…' : 'Print QR (PDF)'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
