import { serviceSheetPage, type ServiceSheet } from '../lib/serviceSheet'
import { ExportSheetDialog } from './ExportSheetDialog'

/**
 * The running order as a file to keep or send on — the shared export
 * dialog, handed the running-order sheet. The filename comes from the
 * service, not from the database's id.
 */
export function ExportServiceDialog({ sheet, onClose }: { sheet: ServiceSheet; onClose: () => void }) {
  return (
    <ExportSheetDialog
      title="Export the running order"
      blurb={`${sheet.serviceType} · ${sheet.date} · ${sheet.sessions.length} ${sheet.sessions.length === 1 ? 'session' : 'sessions'}`}
      stem={`${sheet.date}-${sheet.serviceType}`}
      build={(theme, fit) => serviceSheetPage(sheet, fit, theme)}
      onClose={onClose}
    />
  )
}
