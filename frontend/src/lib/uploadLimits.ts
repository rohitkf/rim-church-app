/**
 * How big an uploaded file may be, per kind.
 *
 * The storage buckets refuse anything larger (0128); these are the same
 * numbers, so the uploader can say so before the upload rather than after
 * it fails. `uploadLimits.test.ts` reads the migration and checks.
 */
const MB = 1024 * 1024

export const UPLOAD_LIMIT_BYTES = {
  logo: 2 * MB,
  givingQr: 2 * MB,
  handbook: 10 * MB,
  inventoryDoc: 5 * MB,
} as const

/** "2 MB" — whole megabytes, the way the limits are set. */
export function limitText(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`
}

/** For Settings › Data & retention, in the order people think of them. */
export const UPLOAD_LIMITS: [string, string][] = [
  ['App logo', limitText(UPLOAD_LIMIT_BYTES.logo)],
  ['Giving QR picture', limitText(UPLOAD_LIMIT_BYTES.givingQr)],
  ['Team handbook', limitText(UPLOAD_LIMIT_BYTES.handbook)],
  ['Inventory document', limitText(UPLOAD_LIMIT_BYTES.inventoryDoc)],
]
