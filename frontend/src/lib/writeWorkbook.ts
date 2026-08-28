/**
 * Sheets to a file on someone's disk.
 *
 * The spreadsheet library is loaded only when an export is actually asked
 * for. It is a few hundred kilobytes that most people, on most visits,
 * will never need — and this is a button pressed by one admin now and
 * then, not something on the path to seeing a rota. A dynamic import
 * keeps it out of the bundle everyone downloads.
 */
import type { ExportSheet } from './volunteerExport'

export async function writeWorkbook(sheets: ExportSheet[], fileName: string): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')

  await writeXlsxFile(
    sheets.map((sheet) => ({
      sheet: sheet.name,
      // The header row is bold and frozen, so scrolling a long roster
      // doesn't leave you counting columns to remember what you're
      // looking at.
      data: [
        sheet.columns.map((column) => ({
          value: column.label,
          fontWeight: 'bold' as const,
          backgroundColor: '#eeeeee',
          borderColor: '#cccccc',
        })),
        ...sheet.rows.map((row) =>
          row.map((cell) => ({
            value: cell === null ? undefined : cell,
            type: typeof cell === 'number' ? (Number as NumberConstructor) : (String as StringConstructor),
          })),
        ),
      ],
      columns: sheet.columns.map((column) => ({ width: column.width })),
      stickyRowsCount: 1,
    })),
  ).toFile(fileName)
}
