/** Hand a generated file to the browser as a download. */
export function downloadFile(bytes: Uint8Array, fileName: string, mimeType: string): void {
  // Copied into its own buffer: the typed array may be a view onto a
  // larger one, and Blob would take the whole thing.
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Released on the next tick, so the click has taken the URL first.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Open a generated PDF for printing.
 *
 * The browser's own viewer does the printing — it is the only thing on the
 * page that knows about the printers this device has. A new tab is used
 * rather than a hidden iframe because a phone has no hidden-iframe print:
 * Chrome and Safari both put print behind the viewer's own share menu, and
 * the tab is what gets them there.
 *
 * If the tab is blocked, the file is saved instead, so the click always
 * does something.
 */
export function printPdf(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const tab = window.open(url, '_blank')
  if (!tab) {
    URL.revokeObjectURL(url)
    downloadFile(bytes, fileName, 'application/pdf')
    return
  }
  // Long enough for the viewer to have taken the URL. Revoking earlier
  // leaves the tab with nothing to show.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
