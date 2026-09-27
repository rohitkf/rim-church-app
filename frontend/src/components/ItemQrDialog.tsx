import { useEffect, useState } from 'react'
import { Overlay } from './Surface'
import { qrModules } from '../lib/qrMatrix'
import { QrSvg } from './QrCode'
import { itemScanUrl } from '../lib/qrLink'
import { LabelSheetDialog } from './LabelSheetDialog'
import type { InventoryItem } from '../lib/types'

/**
 * One item's QR code, on screen and on paper.
 *
 * The code carries a link rather than a bare id, so the phone camera
 * everyone already has opens the item without the app being involved
 * first. The printed sticker repeats the brand, the product and the
 * serial, because a label that only works when the code scans is a label
 * that stops working the day it gets scuffed.
 */
export function ItemQrDialog({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const [modules, setModules] = useState<boolean[][] | null>(null)
  const [printing, setPrinting] = useState(false)
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

  return (
    <Overlay label={`QR code for ${item.name}`} align="sheet" onDismiss={onClose}>
      <div className="w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-6 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-md sm:rounded-[var(--radius-card)]">
        <h2 className="text-headline-md">{item.name}</h2>
        <p className="mt-1 font-mono text-label-sm text-on-surface-variant">
          {item.asset_tag ?? 'No asset tag'}
        </p>

        <div className="mt-5 flex justify-center">
          {modules ? (
            <QrSvg modules={modules} className="h-56 w-56 rounded-[var(--radius-chip)]" label="QR code for this item" />
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
            onClick={() => setPrinting(true)}
            className="tap rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90"
          >
            Preview label
          </button>
        </div>
      </div>
      {printing && <LabelSheetDialog items={[item]} onClose={() => setPrinting(false)} />}
    </Overlay>
  )
}
