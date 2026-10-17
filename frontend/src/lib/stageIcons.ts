/**
 * The things on a stage that are not a person's place: a camera, a
 * carpet, a door. Each is a line drawing in a 24-unit box, written as an
 * SVG path with only absolute M, L, H, V, C and Z — the subset both an
 * <svg> and the PDF writer (lib/pdfDoc) can draw, so the sheet shows the
 * same picture the page does.
 *
 * The list is in code, not in the database: a block stores the key, and
 * a key nobody knows any more is drawn as a plain box with its name.
 */

export interface StageIcon {
  key: string
  name: string
  /** Absolute M/L/H/V/C/Z only, in a 0–24 box; stroked, never filled. */
  d: string
}

export const STAGE_ICONS: StageIcon[] = [
  { key: 'camera', name: 'Camera', d: 'M3 5H14V13H3Z M14 8L19 5.5V11.5L14 9 M8.5 13V16 M8.5 16L4.5 22 M8.5 16L12.5 22 M5.5 20H11.5' },
  { key: 'carpet', name: 'Carpet', d: 'M4 5H20V19H4Z M4 8H2 M4 12H2 M4 16H2 M20 8H22 M20 12H22 M20 16H22' },
  { key: 'door', name: 'Door', d: 'M6 20V6 M6 6C13.73 6 20 12.27 20 20 M2 20H6 M20 20H22' },
  { key: 'mic', name: 'Microphone', d: 'M9 5C9 3.34 10.34 2 12 2C13.66 2 15 3.34 15 5V10C15 11.66 13.66 13 12 13C10.34 13 9 11.66 9 10Z M7 10C7 12.76 9.24 15 12 15C14.76 15 17 12.76 17 10 M12 15V22 M8 22H16' },
  { key: 'speaker', name: 'Speaker', d: 'M6 2H18V22H6Z M13.5 7C13.5 7.83 12.83 8.5 12 8.5C11.17 8.5 10.5 7.83 10.5 7C10.5 6.17 11.17 5.5 12 5.5C12.83 5.5 13.5 6.17 13.5 7Z M16 14C16 16.21 14.21 18 12 18C9.79 18 8 16.21 8 14C8 11.79 9.79 10 12 10C14.21 10 16 11.79 16 14Z' },
  { key: 'monitor', name: 'Monitor', d: 'M2 4H22V16H2Z M12 16V20 M8 20H16' },
  { key: 'projector', name: 'Projector', d: 'M2 8H22V16H2Z M17 12C17 13.1 16.1 14 15 14C13.9 14 13 13.1 13 12C13 10.9 13.9 10 15 10C16.1 10 17 10.9 17 12Z M5 11H9 M5 13H9 M6 16L5 19 M18 16L19 19' },
  { key: 'screen', name: 'Screen', d: 'M2 3H22 M4 3V15H20V3 M12 15V21 M9 21H15' },
  { key: 'piano', name: 'Piano', d: 'M2 7H22V17H2Z M6 7V13 M10 7V13 M14 7V13 M18 7V13' },
  { key: 'drums', name: 'Drums', d: 'M19 14C19 17.87 15.87 21 12 21C8.13 21 5 17.87 5 14C5 10.13 8.13 7 12 7C15.87 7 19 10.13 19 14Z M2 6H8 M5 6V9 M16 6H22 M19 6V9' },
  { key: 'guitar', name: 'Guitar', d: 'M12 3V12 M10.5 3H13.5 M12 12C9 12 7 14 7 16.5C7 19 9.24 21 12 21C14.76 21 17 19 17 16.5C17 14 15 12 12 12Z' },
  { key: 'pulpit', name: 'Pulpit', d: 'M4 8H20L18 14H6Z M9 14V21 M15 14V21 M7 21H17 M6 8V5H18V8' },
  { key: 'table', name: 'Table', d: 'M3 8H21 M3 8V12H21V8 M5 12V20 M19 12V20' },
  { key: 'chair', name: 'Chair', d: 'M6 3H18V11H6Z M6 11V21 M18 11V21 M6 15H18' },
  { key: 'plant', name: 'Plant', d: 'M9 14H15L14 22H10Z M12 14V8 M12 8C12 5 9 3 6 3C6 6 8 8 12 8Z M12 10C12 7 15 5 18 5C18 8 16 10 12 10Z' },
  { key: 'light', name: 'Light', d: 'M8 3H16L18 11H6Z M12 11V15 M6 15H18 M9 15L7 21 M15 15L17 21' },
  { key: 'case', name: 'Flight case', d: 'M3 7H21V20H3Z M3 7L6 4H18L21 7 M9 12H15' },
  { key: 'stairs', name: 'Stairs', d: 'M3 21H21V3 M3 21V15H8V9H13V3H21' },
  { key: 'cross', name: 'Cross', d: 'M12 2V22 M6 8H18' },
]

const BY_KEY = new Map(STAGE_ICONS.map((i) => [i.key, i]))

/** The icon for a key, or null for a key the catalogue no longer has. */
export function stageIcon(key: string | null | undefined): StageIcon | null {
  return key ? (BY_KEY.get(key) ?? null) : null
}
