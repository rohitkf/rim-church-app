/**
 * The fields a purchase request carries, and what they become.
 *
 * A request and an inventory item are the same thing at two points in
 * time: somebody asks for a radio mic, and later a radio mic is on the
 * shelf. The request used to carry six of the item's fields and the rest
 * arrived blank, so approving one meant a second person typing in the
 * brand, the model and the serial number — facts they were not in the room
 * for and had to go and find out.
 *
 * `kind` was worse than blank. It was inferred from the count: more than
 * one meant "consumable". That makes three identical cameras a consumable
 * and a single box of screws an asset. It is a question with two answers
 * and nobody was asked it.
 *
 * So the draft below mirrors the add-item form, and these functions are
 * the two crossings — a row into a form, and a form into a row. They live
 * here rather than inside the component because a field quietly missing
 * from one of them is exactly the bug this set out to fix, and a test can
 * hold every field at once.
 */

export interface RequestDraft {
  itemName: string
  kind: 'asset' | 'consumable'
  quantity: string
  cost: string
  url: string
  reason: string
  brand: string
  model: string
  serial: string
  location: string
  /** The tag word: three letters of it become the middle of the asset tag. */
  category: string
  /** The shelf it will be filed on. '' is Uncategorised. */
  categoryId: string
  reorder: string
}

/** What the row looks like coming back from the database. */
export interface RequestRowFields {
  item_name: string
  kind?: string | null
  quantity: number
  estimated_cost?: number | string | null
  product_url?: string | null
  reason?: string | null
  brand?: string | null
  model?: string | null
  serial_number?: string | null
  location?: string | null
  category?: string | null
  category_id?: string | null
  reorder_level?: number | null
}

export function emptyDraft(): RequestDraft {
  return {
    itemName: '',
    // Most of what a church asks for is a thing rather than a supply, and
    // an asset is the answer that costs least to be wrong about: it keeps
    // its own tag and history either way.
    kind: 'asset',
    quantity: '1',
    cost: '',
    url: '',
    reason: '',
    brand: '',
    model: '',
    serial: '',
    location: '',
    category: '',
    categoryId: '',
    reorder: '',
  }
}

const text = (value: string | null | undefined) => value ?? ''

/** A saved request, opened for editing. */
export function draftFrom(row: RequestRowFields): RequestDraft {
  return {
    itemName: row.item_name,
    kind: row.kind === 'consumable' ? 'consumable' : 'asset',
    quantity: String(row.quantity ?? 1),
    cost: row.estimated_cost == null ? '' : String(row.estimated_cost),
    url: text(row.product_url),
    reason: text(row.reason),
    brand: text(row.brand),
    model: text(row.model),
    serial: text(row.serial_number),
    location: text(row.location),
    category: text(row.category),
    categoryId: text(row.category_id),
    reorder: row.reorder_level == null ? '' : String(row.reorder_level),
  }
}

const trimmed = (value: string) => value.trim() || null
const number = (value: string) => (value.trim() === '' ? null : Number(value))

/** The form, on its way to the database. */
export function draftToRow(draft: RequestDraft): RequestRowFields {
  return {
    item_name: draft.itemName.trim(),
    kind: draft.kind,
    quantity: Math.max(1, Number(draft.quantity) || 1),
    estimated_cost: number(draft.cost),
    product_url: trimmed(draft.url),
    reason: trimmed(draft.reason),
    brand: trimmed(draft.brand),
    model: trimmed(draft.model),
    serial_number: trimmed(draft.serial),
    location: trimmed(draft.location),
    category: trimmed(draft.category),
    category_id: draft.categoryId || null,
    // Only meaningful for something bought by the box.
    reorder_level: draft.kind === 'consumable' ? number(draft.reorder) : null,
  }
}

/**
 * The request, as the inventory item it becomes.
 *
 * Everything the request was asked for crosses over. What it cannot carry
 * is the asset tag, which is minted by the database at the moment the item
 * exists so two people buying at once cannot be handed the same number —
 * the caller passes it in.
 */
export function itemFromRequest(
  row: RequestRowFields & { department_id: string },
  assetTag: string | null,
) {
  return {
    department_id: row.department_id,
    name: row.item_name,
    // Asked at request time now, rather than guessed from the count.
    kind: row.kind === 'consumable' ? 'consumable' : 'asset',
    quantity: row.quantity,
    estimated_cost: row.estimated_cost == null ? null : Number(row.estimated_cost),
    product_url: row.product_url ?? null,
    notes: row.reason ?? null,
    brand: row.brand ?? null,
    model: row.model ?? null,
    serial_number: row.serial_number ?? null,
    location: row.location ?? null,
    category: row.category ?? null,
    category_id: row.category_id ?? null,
    reorder_level: row.kind === 'consumable' ? (row.reorder_level ?? null) : null,
    asset_tag: assetTag,
  }
}
