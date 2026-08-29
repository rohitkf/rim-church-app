import { useState } from 'react'
import { Overlay } from './Surface'
import { buildPdf } from '../lib/pdfDoc'
import { serviceSheetPage, type ServiceSheet } from '../lib/serviceSheet'
import { renderPageToJpeg } from '../lib/renderPageToImage'
import { downloadFile } from '../lib/downloadFile'

/** A filename from the service, not from the database's id. */
function stem(sheet: ServiceSheet): string {
  const name = `${sheet.date}-${sheet.serviceType}`
  return name.replace(/[^\w-]+/g, '-').replace(/-+/g, '-').toLowerCase()
}

/**
 * The running order as a file to keep or send on.
 *
 * A PDF to print or attach, a JPG to drop into a message — the same sheet
 * either way, because both are rendered from one description of the page
 * rather than laid out twice.
 */
export function ExportServiceDialog({
  sheet,
  onClose,
}: {
  sheet: ServiceSheet
  onClose: () => void
}) {
  const [busy, setBusy] = useState<'pdf' | 'jpg' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save(kind: 'pdf' | 'jpg') {
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'pdf') {
        downloadFile(buildPdf(serviceSheetPage(sheet, 'page')), `${stem(sheet)}.pdf`, 'application/pdf')
      } else {
        const page = serviceSheetPage(sheet, 'content')
        // Twice the page's own size, so the text is still crisp when
        // someone opens it full screen on a phone.
        const blob = await renderPageToJpeg(page, 2)
        downloadFile(new Uint8Array(await blob.arrayBuffer()), `${stem(sheet)}.jpg`, 'image/jpeg')
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build that file.')
    } finally {
      setBusy(null)
    }
  }

  const button =
    'tap w-full rounded-[var(--radius-chip)] hairline px-4 py-3 text-left transition-colors duration-300 hover:bg-raised disabled:opacity-50'

  return (
    <Overlay label="Export this service" align="sheet" onDismiss={onClose}>
      <div className="w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-6 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-md sm:rounded-[var(--radius-card)]">
        <h2 className="text-headline-md">Export the running order</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          {sheet.serviceType} · {sheet.date} · {sheet.sessions.length}{' '}
          {sheet.sessions.length === 1 ? 'session' : 'sessions'}
        </p>

        {error && (
          <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button type="button" className={button} disabled={!!busy} onClick={() => void save('pdf')}>
            <span className="block text-body-md font-medium text-on-surface">
              {busy === 'pdf' ? 'Preparing…' : 'PDF'}
            </span>
            <span className="block text-label-sm text-on-surface-variant">
              To print, or to attach to an email.
            </span>
          </button>

          <button type="button" className={button} disabled={!!busy} onClick={() => void save('jpg')}>
            <span className="block text-body-md font-medium text-on-surface">
              {busy === 'jpg' ? 'Preparing…' : 'JPG image'}
            </span>
            <span className="block text-label-sm text-on-surface-variant">
              To drop straight into a chat or a group.
            </span>
          </button>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="tap rounded-full hairline px-4 py-2.5 text-body-sm font-medium text-on-surface"
          >
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
