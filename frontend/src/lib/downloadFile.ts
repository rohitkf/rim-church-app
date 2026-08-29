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
