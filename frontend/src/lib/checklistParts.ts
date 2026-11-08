/**
 * Which parts of a role's checklist one rota assignment carries (0112, 0260).
 *
 * Somebody covering only the setting-up one Sunday does not owe the
 * packing-up list, and somebody who leaves when the doors open does not owe
 * what is done during the service. Each part is on unless the Head unticks
 * it on the rota, and never all three off — the database refuses that too
 * (`rota_assignments_carries_a_half`).
 */
export type PartKey = 'pre' | 'during' | 'post'
export type Parts = Record<PartKey, boolean>

/** In the order the morning runs. */
export const PART_KEYS: readonly PartKey[] = ['pre', 'during', 'post']

/** As the rota's chips say it: "Before", "Before the service". */
export const PART_LABEL: Record<PartKey, string> = { pre: 'Before', during: 'During', post: 'After' }

export const ALL_PARTS: Parts = { pre: true, during: true, post: true }

/** An assignment's parts; one that has not said carries them all. */
export function partsOf(a: { include_pre?: boolean; include_during?: boolean; include_post?: boolean }): Parts {
  return { pre: a.include_pre !== false, during: a.include_during !== false, post: a.include_post !== false }
}

export function carriesAll(a: { include_pre?: boolean; include_during?: boolean; include_post?: boolean }): boolean {
  const p = partsOf(a)
  return p.pre && p.during && p.post
}
