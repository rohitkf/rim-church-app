/** What a handbook may be, and how big it may get. */
export const HANDBOOK_MAX_BYTES = 30 * 1024 * 1024

export const HANDBOOK_TYPES = [
  { ext: 'pdf', mime: 'application/pdf', label: 'PDF' },
  {
    ext: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word (.docx)',
  },
] as const

export type HandbookExt = (typeof HANDBOOK_TYPES)[number]['ext']

export const HANDBOOK_ACCEPT = HANDBOOK_TYPES.map((t) => `.${t.ext},${t.mime}`).join(',')

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export type FileCheck =
  | { ok: true; ext: HandbookExt; mime: string }
  | { ok: false; reason: string }

/**
 * Whether a dropped or chosen file can be the team handbook.
 *
 * The extension decides, not the browser's guess at the type: Windows and
 * some browsers report a .docx as octet-stream or as the old Word type, and
 * refusing a genuine document on that basis is worse than trusting the name
 * — the file is stored, never executed, and only a head can put one there.
 */
export function checkHandbookFile(file: { name: string; size: number }): FileCheck {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const known = HANDBOOK_TYPES.find((t) => t.ext === ext)

  if (!known) {
    return { ok: false, reason: 'That file type isn’t allowed — upload a PDF or a Word .docx.' }
  }
  if (file.size === 0) {
    return { ok: false, reason: 'That file is empty.' }
  }
  if (file.size > HANDBOOK_MAX_BYTES) {
    return {
      ok: false,
      reason: `That file is ${formatBytes(file.size)} — the limit is ${formatBytes(HANDBOOK_MAX_BYTES)}.`,
    }
  }

  return { ok: true, ext: known.ext, mime: known.mime }
}
