import { useEffect, useState } from 'react'
import { Overlay } from './Surface'
import { qrModules } from '../lib/qrMatrix'
import { itemScanUrl } from '../lib/qrLink'
import { labelSheetPages, labelSheetPdf, PER_PAGE, type ItemLabel } from '../lib/itemLabelPdf'
import { renderPageToJpeg } from '../lib/renderPageToImage'
import { downloadFile } from '../lib/downloadFile'
import type { InventoryItem } from '../lib/types'

/** Everything the sticker shows, taken off the register. */
function toLabel(item: InventoryItem, modules: boolean[][]): ItemLabel {
  return {
    assetTag: item.asset_tag ?? null,
    name: item.name,
    brand: item.brand ?? null,
    model: item.model ?? null,
    serial: item.serial_number ?? null,
    modules,
  }
}

function fileStem(items: InventoryItem[]): string {
  if (items.length === 1) {
    return (items[0].asset_tag ?? items[0].name).replace(/[^\w-]+/g, '-').toLowerCase()
  }
  return `${items.length}-labels`
}

/**
 * Preview the stickers, then print them.
 *
 * The preview is the document, painted onto a canvas from the same page
 * description the PDF is written from — so what is on screen cannot drift
 * from what comes out of the printer. Paper is the reason this matters:
 * a sheet of labels noticed to be wrong after printing is a wasted sheet.
 */
export function LabelSheetDialog({
  items,
  onClose,
}: {
  items: InventoryItem[]
  onClose: () => void
}) {
  const [labels, setLabels] = useState<ItemLabel[] | null>(null)
  const [page, setPage] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const origin = window.location.origin
  const pageCount = Math.max(1, Math.ceil(items.length / PER_PAGE))

  useEffect(() => {
    let live = true
    setFailed(false)
    void Promise.all(items.map((item) => qrModules(itemScanUrl(origin, item.id))))
      .then((grids) => {
        if (live) setLabels(items.map((item, i) => toLabel(item, grids[i])))
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [items, origin])

  // One page painted at a time: a hundred stickers is thirteen pages, and
  // rendering all of them to look at one is work nobody asked for.
  useEffect(() => {
    if (!labels) return
    let live = true
    let url: string | null = null
    const pages = labelSheetPages(labels)
    void renderPageToJpeg(pages[Math.min(page, pages.length - 1)], 2)
      .then((blob) => {
        if (!live) return
        url = URL.createObjectURL(blob)
        setPreview(url)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [labels, page])

  function print() {
    if (!labels) return
    setBusy(true)
    try {
      downloadFile(labelSheetPdf(labels), `${fileStem(items)}.pdf`, 'application/pdf')
    } finally {
      setBusy(false)
    }
  }

  const title = items.length === 1 ? items[0].name : `${items.length} labels`

  return (
    <Overlay label={`Label preview for ${title}`} align="sheet" onDismiss={onClose}>
      <div className="flex max-h-[92dvh] w-full flex-col rounded-t-[var(--radius-card)] bg-surface-lowest shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-2xl sm:rounded-[var(--radius-card)]">
        <div className="px-6 pt-6">
          <h2 className="text-headline-md">{title}</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            {items.length} sticker{items.length === 1 ? '' : 's'} · {pageCount} A4 page
            {pageCount === 1 ? '' : 's'} · {PER_PAGE} to a page
          </p>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-6">
          {failed ? (
            <p className="rounded-xl bg-error-container px-3.5 py-2.5 text-body-sm text-on-error-container">
              The preview could not be drawn. The PDF can still be downloaded.
            </p>
          ) : preview ? (
            <img
              src={preview}
              alt={`Page ${page + 1} of the label sheet`}
              className="mx-auto w-full rounded-[var(--radius-chip)] shadow-[var(--shadow-ambient)] ring-1 ring-black/10"
            />
          ) : (
            <div className="mx-auto aspect-[595/842] w-full animate-pulse rounded-[var(--radius-chip)] bg-raised" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 py-5">
          {pageCount > 1 && (
            <div className="mr-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="tap-square rounded-full hairline px-3 py-2 text-body-sm text-on-surface disabled:opacity-40"
              >
                ‹
              </button>
              <span className="font-mono text-label-sm tabular-nums text-on-surface-variant">
                {page + 1} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="tap-square rounded-full hairline px-3 py-2 text-body-sm text-on-surface disabled:opacity-40"
              >
                ›
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="tap ml-auto rounded-full hairline px-4 py-2.5 text-body-sm font-medium text-on-surface"
          >
            Close
          </button>
          <button
            type="button"
            onClick={print}
            disabled={!labels || busy}
            className="tap rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
