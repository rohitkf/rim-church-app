import { useState } from 'react'
import { Overlay } from './Surface'
import { buildPdf } from '../lib/pdfDoc'
import { serviceSheetPage, type ServiceSheet, type SheetTheme } from '../lib/serviceSheet'
import { renderPageToJpeg } from '../lib/renderPageToImage'
import { downloadFile } from '../lib/downloadFile'
import { useTheme } from '../lib/useTheme'

/** A filename from the service, not from the database's id. */
function stem(sheet: ServiceSheet, theme: SheetTheme): string {
  const name = `${sheet.date}-${sheet.serviceType}-${theme}`
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
  /*
   * Which way round the sheet is printed.
   *
   * It starts on whatever the app is showing, because somebody exporting
   * a running order has just been looking at one and that is the sheet
   * they are picturing. Both are always offered, though: the dark sheet
   * is what belongs in a group chat, and the light one is what a church
   * printer can actually put on paper without going through a cartridge
   * and coming out grey.
   */
  const { resolved } = useTheme()
  const [theme, setTheme] = useState<SheetTheme>(resolved === 'light' ? 'light' : 'dark')

  async function save(kind: 'pdf' | 'jpg') {
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'pdf') {
        downloadFile(
          buildPdf(serviceSheetPage(sheet, 'page', theme)),
          `${stem(sheet, theme)}.pdf`,
          'application/pdf',
        )
      } else {
        const page = serviceSheetPage(sheet, 'content', theme)
        // Twice the page's own size, so the text is still crisp when
        // someone opens it full screen on a phone.
        const blob = await renderPageToJpeg(page, 2)
        downloadFile(
          new Uint8Array(await blob.arrayBuffer()),
          `${stem(sheet, theme)}.jpg`,
          'image/jpeg',
        )
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

        {/* Chosen before the format, because it is the question with two
            answers — the format is only which file the same sheet goes
            into. A swatch each, so the words are not doing the work. */}
        <div className="mt-5">
          <span className="font-mono text-label-sm uppercase tracking-[0.14em] text-on-surface-faint">
            Sheet
          </span>
          <div
            role="radiogroup"
            aria-label="Sheet colour"
            className="mt-2 flex rounded-full p-0.5 ring-1 ring-black/8 dark:ring-white/10"
          >
            {(
              [
                { key: 'dark', label: 'Dark', swatch: '#141418', ring: '#38383f' },
                { key: 'light', label: 'Light', swatch: '#ffffff', ring: '#c7c7cc' },
              ] as const
            ).map((choice) => (
              <button
                key={choice.key}
                type="button"
                role="radio"
                aria-checked={theme === choice.key}
                onClick={() => setTheme(choice.key)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-1.5 text-body-sm transition-all duration-500 ease-[var(--ease-glide)] ${
                  theme === choice.key ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ background: choice.swatch, boxShadow: `inset 0 0 0 1px ${choice.ring}` }}
                />
                {choice.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-label-sm text-on-surface-faint">
            {theme === 'dark'
              ? 'The sheet as the planner shows it — for a phone, or a group chat.'
              : 'Ink on paper rather than paper made of ink — for printing and pinning up.'}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-2">
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
