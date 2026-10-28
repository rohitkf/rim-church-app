import { z } from 'zod'
import { supabase } from './supabaseClient'

/*
 * The stage, laid out before Sunday (0155).
 *
 * A layout belongs to a service: one workspace holding every area the
 * church has named (Stage, Audience, …) as regions stacked top to
 * bottom, with named blocks on them, each optionally carrying a person
 * and a colour, every change written to a log by the database rather
 * than by the app. What is read
 * and written here; how it is drawn is components/StageCanvas; who may
 * do what is the church's (Settings › Stage Layout): the grid's
 * `stage.*` rows (0212), asked through useStageAccess.
 */

export const STAGE_KEY = ['stage'] as const

/** What a block can be. Four stage-sized defaults, in canvas units. */
export const DEFAULT_BLOCK = { w: 160, h: 100 }
/** An item is drawn as a picture, so it starts square. */
export const DEFAULT_ITEM = { w: 120, h: 120 }
export const DEFAULT_STAGE = { width: 1200, height: 700 }

/** The colours a block may wear: the team palette's clearest few. */
export const BLOCK_COLORS: { hex: string; name: string }[] = [
  { hex: '#0A84FF', name: 'Blue' },
  { hex: '#5E5CE6', name: 'Indigo' },
  { hex: '#BF5AF2', name: 'Purple' },
  { hex: '#FF375F', name: 'Pink' },
  { hex: '#FF6961', name: 'Coral' },
  { hex: '#FF9F0A', name: 'Orange' },
  { hex: '#FFD60A', name: 'Yellow' },
  { hex: '#30D158', name: 'Green' },
  { hex: '#34D399', name: 'Mint' },
  { hex: '#64D2FF', name: 'Sky' },
  { hex: '#8E8E93', name: 'Grey' },
]

/** A row of seats: how many by default, and how wide each chair is drawn. */
export const DEFAULT_SEATS = 10
export const SEAT_PITCH = 44

/** Blocks people reach for first, offered as one tap. */
export const QUICK_BLOCKS: Record<string, string[]> = {
  Stage: ['Keyboard', 'Drums', 'Bass', 'Electric guitar', 'Acoustic guitar', 'Lead vocal', 'Backing vocals', 'Pulpit', 'Monitor', 'Screen', 'Piano', 'Violin'],
  Audience: ['Welcome desk', 'Sound desk', 'Camera', 'Prayer team', 'Kids corner', 'Reserved', 'Aisle', 'Exit'],
}

/** The quick names for an area: its own list, or the stage's for one the app has not met. */
export function quickBlocksFor(areaName: string): string[] {
  return QUICK_BLOCKS[areaName] ?? [...QUICK_BLOCKS.Stage.slice(0, 6), ...QUICK_BLOCKS.Audience.slice(0, 6)]
}

const personSchema = z.object({ id: z.string(), first_name: z.string(), last_name: z.string() }).nullable()

export const stageAreaSchema = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number(),
  height: z.number(),
  top_label: z.string(),
  bottom_label: z.string(),
  position: z.number(),
})
export type StageArea = z.infer<typeof stageAreaSchema>

export const stageLayoutSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type StageLayout = z.infer<typeof stageLayoutSchema>

export const stageBlockSchema = z.object({
  id: z.string(),
  layout_id: z.string(),
  /** The region it sits in; x and y are measured from that region's corner. */
  area_id: z.string(),
  label: z.string(),
  person_id: z.string().nullable(),
  color: z.string(),
  x: z.coerce.number(),
  y: z.coerce.number(),
  w: z.coerce.number(),
  h: z.coerce.number(),
  rotation: z.number(),
  z: z.number(),
  /** A named box, a row of seats drawn as chairs, or an item drawn as a picture (lib/stageIcons). */
  kind: z.enum(['block', 'seats', 'item']).default('block'),
  seats: z.number().default(0),
  /** Square by default; a block can be rounded on its own. */
  corners: z.enum(['sharp', 'rounded']).default('sharp'),
  /** For an item: which picture. */
  icon: z.string().nullable().default(null),
  /** Set by an Admin: nobody else may move it; they ask instead (0157). */
  locked_by: z.string().nullable(),
  locked_at: z.string().nullable(),
  placed_by: z.string().nullable(),
  placed_at: z.string(),
  updated_by: z.string().nullable(),
  updated_at: z.string(),
  person: personSchema.optional(),
  placer: personSchema.optional(),
  updater: personSchema.optional(),
  locker: personSchema.optional(),
})
export type StageBlock = z.infer<typeof stageBlockSchema>

export const stageCommentSchema = z.object({
  id: z.string(),
  layout_id: z.string(),
  block_id: z.string().nullable(),
  body: z.string(),
  author: z.string().nullable(),
  created_at: z.string(),
  writer: personSchema.optional(),
})
export type StageComment = z.infer<typeof stageCommentSchema>

export const LOG_KINDS = [
  'added', 'moved', 'resized', 'rotated', 'renamed', 'recoloured', 'assigned',
  'deleted', 'commented', 'template_applied', 'cleared',
  'locked', 'unlocked', 'move_requested', 'move_approved', 'move_declined',
] as const
export type LogKind = (typeof LOG_KINDS)[number]

export const stageLogSchema = z.object({
  id: z.string(),
  layout_id: z.string(),
  block_id: z.string().nullable(),
  block_label: z.string().nullable(),
  kind: z.enum(LOG_KINDS),
  detail: z.record(z.string(), z.unknown()).default({}),
  by: z.string().nullable(),
  at: z.string(),
  actor: personSchema.optional(),
})
export type StageLogLine = z.infer<typeof stageLogSchema>

export const stageTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  blocks: z.array(z.record(z.string(), z.unknown())),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type StageTemplate = z.infer<typeof stageTemplateSchema>

export const stageTemplateRequestSchema = z.object({
  id: z.string(),
  name: z.string(),
  blocks: z.array(z.record(z.string(), z.unknown())),
  requested_by: z.string().nullable(),
  requested_at: z.string(),
  status: z.enum(['pending', 'approved', 'declined']),
  decided_by: z.string().nullable(),
  decided_at: z.string().nullable(),
  requester: personSchema.optional(),
})
export type StageTemplateRequest = z.infer<typeof stageTemplateRequestSchema>

export const stageMoveRequestSchema = z.object({
  id: z.string(),
  block_id: z.string(),
  layout_id: z.string(),
  x: z.coerce.number(),
  y: z.coerce.number(),
  w: z.coerce.number(),
  h: z.coerce.number(),
  note: z.string().nullable(),
  requested_by: z.string().nullable(),
  requested_at: z.string(),
  status: z.enum(['pending', 'approved', 'declined']),
  decided_by: z.string().nullable(),
  decided_at: z.string().nullable(),
  requester: personSchema.optional(),
})
export type StageMoveRequest = z.infer<typeof stageMoveRequestSchema>

export const stageTeamAccessSchema = z.object({
  department_id: z.string(),
  can_add: z.boolean(),
  can_edit: z.boolean(),
  can_delete: z.boolean(),
  can_comment: z.boolean(),
  can_templates: z.boolean(),
})
export type StageTeamAccess = z.infer<typeof stageTeamAccessSchema>

export type StagePrivilege = 'add' | 'edit' | 'delete' | 'comment' | 'templates'

export const PRIVILEGES: { key: StagePrivilege; column: keyof StageTeamAccess; label: string; blurb: string }[] = [
  { key: 'add', column: 'can_add', label: 'Add', blurb: 'Put new blocks on the stage.' },
  { key: 'edit', column: 'can_edit', label: 'Edit', blurb: 'Move, resize, rename, recolour, and put a person on a block. Apply a template.' },
  { key: 'delete', column: 'can_delete', label: 'Delete', blurb: 'Take blocks off, and clear the whole stage.' },
  { key: 'comment', column: 'can_comment', label: 'Comment', blurb: 'Write in the thread under the stage, and pin a note to a block.' },
  { key: 'templates', column: 'can_templates', label: 'Templates', blurb: 'Keep a layout as a template without asking, and rename or delete templates.' },
]

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export async function fetchStageAreas(): Promise<StageArea[]> {
  const { data, error } = await supabase.from('stage_areas').select('*').order('position').order('name')
  if (error) throw error
  return z.array(stageAreaSchema).parse(data ?? [])
}

export async function fetchStageLayouts(serviceIds: string[]): Promise<StageLayout[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase.from('stage_layouts').select('*').in('service_id', serviceIds)
  if (error) throw error
  return z.array(stageLayoutSchema).parse(data ?? [])
}

/** How many blocks each layout holds, for the list page's cards. */
export async function fetchStageBlockCounts(layoutIds: string[]): Promise<Record<string, number>> {
  if (layoutIds.length === 0) return {}
  const { data, error } = await supabase.from('stage_blocks').select('layout_id').in('layout_id', layoutIds)
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of z.array(z.object({ layout_id: z.string() })).parse(data ?? [])) {
    counts[row.layout_id] = (counts[row.layout_id] ?? 0) + 1
  }
  return counts
}

export async function fetchStageLayout(serviceId: string): Promise<StageLayout | null> {
  const { data, error } = await supabase.from('stage_layouts').select('*').eq('service_id', serviceId).maybeSingle()
  if (error) throw error
  return data ? stageLayoutSchema.parse(data) : null
}

export async function fetchStageBlocks(layoutId: string): Promise<StageBlock[]> {
  const { data, error } = await supabase
    .from('stage_blocks')
    .select(
      '*, person:profiles!stage_blocks_person_id_fkey(id, first_name, last_name), placer:profiles!stage_blocks_placed_by_fkey(id, first_name, last_name), updater:profiles!stage_blocks_updated_by_fkey(id, first_name, last_name), locker:profiles!stage_blocks_locked_by_fkey(id, first_name, last_name)',
    )
    .eq('layout_id', layoutId)
    .order('z')
    .order('placed_at')
  if (error) throw error
  return z.array(stageBlockSchema).parse(data ?? [])
}

export async function fetchStageComments(layoutId: string): Promise<StageComment[]> {
  const { data, error } = await supabase
    .from('stage_comments')
    .select('*, writer:profiles!stage_comments_author_fkey(id, first_name, last_name)')
    .eq('layout_id', layoutId)
    .order('created_at')
  if (error) throw error
  return z.array(stageCommentSchema).parse(data ?? [])
}

export async function fetchStageLog(layoutId: string): Promise<StageLogLine[]> {
  const { data, error } = await supabase
    .from('stage_layout_log')
    .select('*, actor:profiles!stage_layout_log_by_fkey(id, first_name, last_name)')
    .eq('layout_id', layoutId)
    .order('at', { ascending: false })
    .limit(200)
  if (error) throw error
  return z.array(stageLogSchema).parse(data ?? [])
}

/** The open asks to move locked blocks on this layout. */
export async function fetchStageMoveRequests(layoutId: string): Promise<StageMoveRequest[]> {
  const { data, error } = await supabase
    .from('stage_move_requests')
    .select('*, requester:profiles!stage_move_requests_requested_by_fkey(id, first_name, last_name)')
    .eq('layout_id', layoutId)
    .eq('status', 'pending')
    .order('requested_at')
  if (error) throw error
  return z.array(stageMoveRequestSchema).parse(data ?? [])
}

export async function fetchStageTemplates(): Promise<StageTemplate[]> {
  const { data, error } = await supabase.from('stage_templates').select('*').order('name')
  if (error) throw error
  return z.array(stageTemplateSchema).parse(data ?? [])
}

export async function fetchStageTemplateRequests(): Promise<StageTemplateRequest[]> {
  const { data, error } = await supabase
    .from('stage_template_requests')
    .select('*, requester:profiles!stage_template_requests_requested_by_fkey(id, first_name, last_name)')
    .order('requested_at', { ascending: false })
  if (error) throw error
  return z.array(stageTemplateRequestSchema).parse(data ?? [])
}

/**
 * Which teams may do what to a layout. Since 0212 each switch is a
 * capability, `stage.<key>`, and a team with it on holds a grant of it
 * (0208); the room still draws a row a team and five switches.
 */
export async function fetchStageTeamAccess(): Promise<StageTeamAccess[]> {
  const { data, error } = await supabase
    .from('permission_grants')
    .select('capability, department_id')
    .like('capability', 'stage.%')
    .not('department_id', 'is', null)
  if (error) throw error
  return stageAccessFromGrants(
    z.array(z.object({ capability: z.string(), department_id: z.string() })).parse(data ?? []),
  )
}

/** The teams' rows, from their grants: a switch is on where the team holds `stage.<key>`. */
export function stageAccessFromGrants(grants: readonly { capability: string; department_id: string }[]): StageTeamAccess[] {
  const rows = new Map<string, StageTeamAccess>()
  for (const g of grants) {
    const priv = PRIVILEGES.find((p) => `stage.${p.key}` === g.capability)
    if (!priv) continue
    const row = rows.get(g.department_id) ?? {
      department_id: g.department_id,
      can_add: false,
      can_edit: false,
      can_delete: false,
      can_comment: false,
      can_templates: false,
    }
    ;(row as Record<string, unknown>)[priv.column] = true
    rows.set(g.department_id, row)
  }
  return [...rows.values()]
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

export async function ensureStageLayout(serviceId: string): Promise<StageLayout> {
  const existing = await fetchStageLayout(serviceId)
  if (existing) return existing
  const { data, error } = await supabase
    .from('stage_layouts')
    .insert({ service_id: serviceId })
    .select('*')
    .single()
  if (error) throw error
  return stageLayoutSchema.parse(data)
}

export type BlockPatch = Partial<Pick<StageBlock, 'label' | 'person_id' | 'color' | 'x' | 'y' | 'w' | 'h' | 'rotation' | 'z' | 'seats' | 'area_id' | 'corners' | 'icon'>>

/** What a new block is made of; the rest is the database's defaults. */
export type NewStageBlock = {
  area_id: string
  label: string
  x: number
  y: number
  w?: number
  h?: number
  color?: string
  z?: number
  kind?: StageBlock['kind']
  seats?: number
  rotation?: number
  corners?: StageBlock['corners']
  icon?: string | null
  person_id?: string | null
}

export async function addStageBlock(layoutId: string, block: NewStageBlock): Promise<StageBlock> {
  const { data, error } = await supabase
    .from('stage_blocks')
    .insert({ layout_id: layoutId, w: DEFAULT_BLOCK.w, h: DEFAULT_BLOCK.h, ...block })
    .select('*')
    .single()
  if (error) throw error
  return stageBlockSchema.parse(data)
}

/**
 * Put blocks back, as an undo does: many at once, in the order given, and
 * handed back in that order so the caller can tell which new row stands
 * for which old one.
 */
export async function restoreStageBlocks(layoutId: string, rows: NewStageBlock[]): Promise<StageBlock[]> {
  if (rows.length === 0) return []
  const { data, error } = await supabase
    .from('stage_blocks')
    .insert(rows.map((r) => ({ layout_id: layoutId, ...r })))
    .select('*')
  if (error) throw error
  return z.array(stageBlockSchema).parse(data ?? [])
}

export async function updateStageBlock(id: string, patch: BlockPatch): Promise<void> {
  const { error } = await supabase.from('stage_blocks').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteStageBlock(id: string): Promise<void> {
  const { error } = await supabase.from('stage_blocks').delete().eq('id', id)
  if (error) throw error
}

export async function addStageComment(layoutId: string, body: string, author: string, blockId: string | null): Promise<void> {
  const { error } = await supabase
    .from('stage_comments')
    .insert({ layout_id: layoutId, block_id: blockId, body: body.trim(), author })
  if (error) throw error
}

export async function deleteStageComment(id: string): Promise<void> {
  const { error } = await supabase.from('stage_comments').delete().eq('id', id)
  if (error) throw error
}

export async function clearStageLayout(serviceId: string): Promise<void> {
  const { error } = await supabase.rpc('clear_stage_layout', { p_service: serviceId })
  if (error) throw error
}

/** 'saved' straight into the library, or 'requested' for an Admin to answer. */
export async function saveStageTemplate(serviceId: string, name: string): Promise<'saved' | 'requested'> {
  const { data, error } = await supabase.rpc('save_stage_template', { p_service: serviceId, p_name: name })
  if (error) throw error
  return z.enum(['saved', 'requested']).parse(data)
}

export async function applyStageTemplate(serviceId: string, templateId: string): Promise<void> {
  const { error } = await supabase.rpc('apply_stage_template', { p_service: serviceId, p_template: templateId })
  if (error) throw error
}

export async function lockStageBlock(id: string, lock: boolean): Promise<void> {
  const { error } = await supabase.rpc('lock_stage_block', { p_block: id, p_lock: lock })
  if (error) throw error
}

export async function requestStageMove(
  blockId: string,
  box: { x: number; y: number; w: number; h: number },
  note: string,
): Promise<void> {
  const { error } = await supabase.rpc('request_stage_move', {
    p_block: blockId, p_x: box.x, p_y: box.y, p_w: box.w, p_h: box.h, p_note: note.trim() || null,
  })
  if (error) throw error
}

export async function decideStageMove(id: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('decide_stage_move', { p_request: id, p_approve: approve })
  if (error) throw error
}

export async function withdrawStageMove(id: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_stage_move', { p_request: id })
  if (error) throw error
}

export async function decideStageTemplateRequest(id: string, approve: boolean): Promise<void> {
  const { error } = await supabase.rpc('decide_stage_template_request', { p_request: id, p_approve: approve })
  if (error) throw error
}

export async function renameStageTemplate(id: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('rename_stage_template', { p_template: id, p_name: name })
  if (error) throw error
}

export async function deleteStageTemplate(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_stage_template', { p_template: id })
  if (error) throw error
}

/* The areas themselves: an Admin's, written straight to the table. */

export type AreaDraft = Pick<StageArea, 'name' | 'width' | 'height' | 'top_label' | 'bottom_label'>

export async function addStageArea(area: AreaDraft, position: number): Promise<void> {
  const { error } = await supabase.from('stage_areas').insert({ ...area, position })
  if (error) throw error
}

export async function updateStageArea(id: string, patch: Partial<AreaDraft>): Promise<void> {
  const { error } = await supabase.from('stage_areas').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteStageArea(id: string): Promise<void> {
  const { error } = await supabase.from('stage_areas').delete().eq('id', id)
  if (error) throw error
}

/** The grants that make these rows so, and clear these teams (0212): every switch said, on or off. */
export function stageGrantChanges(rows: StageTeamAccess[], removeIds: string[]) {
  return [
    ...rows.flatMap((r) =>
      PRIVILEGES.map((p) => ({ capability: `stage.${p.key}`, team: r.department_id, reach: r[p.column] ? ('all' as const) : null })),
    ),
    ...removeIds.flatMap((id) => PRIVILEGES.map((p) => ({ capability: `stage.${p.key}`, team: id, reach: null }))),
  ]
}

export async function setStageTeamAccess(rows: StageTeamAccess[], removeIds: string[]): Promise<void> {
  const changes = stageGrantChanges(rows, removeIds)
  if (changes.length === 0) return
  const { error } = await supabase.rpc('set_permission_grants', { p_changes: changes })
  if (error) throw error
}

/* ------------------------------------------------------------------ *
 * Geometry: the workspace is the areas, stacked
 * ------------------------------------------------------------------ */

/**
 * The grid a block snaps to, in canvas units — and the spacing of the dots
 * the canvas draws, so every edge that snaps lands on a dot. It was 10
 * with dots every 40: three edges in four sat between dots, and a stage
 * that was lined up read as one that was not.
 */
export const GRID = 20

/** The space between one region and the next, in canvas units. */
export const REGION_GAP = 60

export interface Region {
  area: StageArea
  /** Where the region's corner sits in the workspace. */
  top: number
  left: number
  width: number
  height: number
}

/** The areas as regions of one canvas, top to bottom in their set order, left-aligned. */
export function regionsOf(areas: StageArea[]): Region[] {
  const sorted = [...areas].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  let top = 0
  return sorted.map((area) => {
    const region = { area, top, left: 0, width: area.width, height: area.height }
    top += area.height + REGION_GAP
    return region
  })
}

/** The whole workspace: as wide as its widest region, as tall as all of them. */
export function workspaceOf(regions: Region[]): { width: number; height: number } {
  if (regions.length === 0) return DEFAULT_STAGE
  return {
    width: Math.max(...regions.map((r) => r.width)),
    height: regions[regions.length - 1].top + regions[regions.length - 1].height,
  }
}

/** The region a workspace point falls in — or the nearest, for a drop in the gap. */
export function regionAt(regions: Region[], x: number, y: number): Region | null {
  if (regions.length === 0) return null
  const inside = regions.find((r) => y >= r.top && y <= r.top + r.height && x >= r.left && x <= r.left + r.width)
  if (inside) return inside
  return [...regions].sort(
    (a, b) => Math.abs(y - (a.top + a.height / 2)) - Math.abs(y - (b.top + b.height / 2)),
  )[0]
}

export const snap = (n: number) => Math.round(n / GRID) * GRID

/** A smart guide: a line across the region where a moving block's edge or centre has met a neighbour's. */
export interface Guide {
  /** 'x' is a vertical line at x = at; 'y' a horizontal one at y = at. */
  axis: 'x' | 'y'
  at: number
  /** The run of the line along the other axis: from the nearer end of the two boxes to the farther. */
  from: number
  to: number
}

type Box = { x: number; y: number; w: number; h: number }

/**
 * Smart guides. Within `reach` units, a moving block's left, centre and
 * right pull onto a neighbour's left, centre or right (and the region's
 * own centre line), and likewise top, middle and bottom; the nearest
 * match on each axis wins. A resize pulls only its far edges, so the
 * block grows to meet a neighbour's edge rather than sliding. Everything
 * is in the region's own units; the caller clamps the result.
 */
export function alignBlock(
  box: Box,
  others: Box[],
  region: { width: number; height: number },
  reach: number,
  mode: 'move' | 'resize' = 'move',
): Box & { guides: Guide[] } {
  type Line = { at: number; from: number; to: number }
  const vertical: Line[] = [{ at: region.width / 2, from: 0, to: region.height }]
  const horizontal: Line[] = [{ at: region.height / 2, from: 0, to: region.width }]
  for (const o of others) {
    for (const at of [o.x, o.x + o.w / 2, o.x + o.w]) vertical.push({ at, from: o.y, to: o.y + o.h })
    for (const at of [o.y, o.y + o.h / 2, o.y + o.h]) horizontal.push({ at, from: o.x, to: o.x + o.w })
  }
  const anchorsX = mode === 'move' ? [box.x, box.x + box.w / 2, box.x + box.w] : [box.x + box.w]
  const anchorsY = mode === 'move' ? [box.y, box.y + box.h / 2, box.y + box.h] : [box.y + box.h]

  const nearest = (anchors: number[], lines: Line[]) => {
    let best: { delta: number; line: Line } | null = null
    for (const a of anchors) {
      for (const line of lines) {
        const delta = line.at - a
        if (Math.abs(delta) <= reach && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, line }
      }
    }
    return best
  }
  const hx = nearest(anchorsX, vertical)
  const hy = nearest(anchorsY, horizontal)

  const out: Box = { ...box }
  if (hx) {
    if (mode === 'move') out.x = box.x + hx.delta
    else out.w = Math.max(40, box.w + hx.delta)
  }
  if (hy) {
    if (mode === 'move') out.y = box.y + hy.delta
    else out.h = Math.max(40, box.h + hy.delta)
  }
  const guides: Guide[] = []
  if (hx) guides.push({ axis: 'x', at: hx.line.at, from: Math.min(out.y, hx.line.from), to: Math.max(out.y + out.h, hx.line.to) })
  if (hy) guides.push({ axis: 'y', at: hy.line.at, from: Math.min(out.x, hy.line.from), to: Math.max(out.x + out.w, hy.line.to) })
  return { ...out, guides }
}

/** Keep a block on the stage, whole. */
export function clampBlock(
  b: { x: number; y: number; w: number; h: number },
  stage: { width: number; height: number },
): { x: number; y: number; w: number; h: number } {
  const w = Math.min(Math.max(40, b.w), stage.width)
  const h = Math.min(Math.max(40, b.h), stage.height)
  const x = Math.min(Math.max(0, b.x), stage.width - w)
  const y = Math.min(Math.max(0, b.y), stage.height - h)
  return { x, y, w, h }
}

/** Where a new block lands in its region: the first free-ish spot reading left to right. */
export function placeNewBlock(
  blocks: { x: number; y: number; w: number; h: number }[],
  stage: { width: number; height: number },
  size = DEFAULT_BLOCK,
): { x: number; y: number } {
  const overlaps = (x: number, y: number) =>
    blocks.some((b) => x < b.x + b.w && b.x < x + size.w && y < b.y + b.h && b.y < y + size.h)
  for (let y = 40; y + size.h <= stage.height; y += 60) {
    for (let x = 40; x + size.w <= stage.width; x += 60) {
      if (!overlaps(x, y)) return { x, y }
    }
  }
  // A full stage: stack it near the middle, slightly off whatever is there.
  return { x: snap(stage.width / 2 - size.w / 2 + (blocks.length % 5) * 12), y: snap(stage.height / 2 - size.h / 2 + (blocks.length % 5) * 12) }
}

/**
 * A copy of a block, a step down and right so both can be seen, kept
 * inside its region. The person does not come along — two blocks with the
 * same person on them would be a lie about where somebody stands — and
 * nor does a lock: the copy is the copier's to place.
 */
export function duplicateOf(
  block: Pick<StageBlock, 'area_id' | 'label' | 'color' | 'x' | 'y' | 'w' | 'h' | 'rotation' | 'kind' | 'seats' | 'corners' | 'icon'>,
  region: { width: number; height: number },
  z: number,
): NewStageBlock & { w: number; h: number; z: number } {
  const box = clampBlock({ x: block.x + 2 * GRID, y: block.y + 2 * GRID, w: block.w, h: block.h }, region)
  return {
    area_id: block.area_id,
    label: block.label,
    color: block.color,
    ...box,
    rotation: block.rotation,
    kind: block.kind,
    seats: block.seats,
    corners: block.corners,
    icon: block.icon,
    z,
  }
}

/** The zoom that fits the whole stage in a box, with a margin. */
export function fitScale(stage: { width: number; height: number }, box: { width: number; height: number }): number {
  const margin = 24
  const s = Math.min((box.width - margin) / stage.width, (box.height - margin) / stage.height)
  return Math.max(0.1, Math.min(2, Number.isFinite(s) ? s : 0.5))
}

export const ZOOM_MIN = 0.2
export const ZOOM_MAX = 3

/* ------------------------------------------------------------------ *
 * Words
 * ------------------------------------------------------------------ */

const name = (p: { first_name: string; last_name: string } | null | undefined) =>
  p ? `${p.first_name} ${p.last_name}`.trim() : 'Somebody'

/** A log line as a sentence: "Rohit moved Keyboard". */
export function logSentence(line: StageLogLine): string {
  const who = name(line.actor)
  const what = line.block_label ?? 'a block'
  const d = line.detail as Record<string, unknown>
  switch (line.kind) {
    case 'added':
      return `${who} added ${what}`
    case 'moved':
      return `${who} moved ${what}`
    case 'resized':
      return `${who} resized ${what}`
    case 'rotated':
      return `${who} turned ${what}`
    case 'renamed':
      return `${who} renamed ${d.was ? `${d.was} to ${what}` : what}`
    case 'recoloured':
      return `${who} recoloured ${what}`
    case 'assigned':
      return d.person ? `${who} put somebody on ${what}` : `${who} took the person off ${what}`
    case 'deleted':
      return `${who} removed ${what}`
    case 'commented':
      return line.block_id ? `${who} pinned a note to ${what}` : `${who} commented`
    case 'template_applied':
      return `${who} applied the template ${String(d.name ?? '')}`.trim()
    case 'cleared':
      return `${who} cleared the stage`
    case 'locked':
      return `${who} locked ${what}`
    case 'unlocked':
      return `${who} unlocked ${what}`
    case 'move_requested':
      return `${who} asked to move ${what}${d.note ? ` — “${String(d.note)}”` : ''}`
    case 'move_approved':
      return `${who} approved a move of ${what}`
    case 'move_declined':
      return `${who} declined a move of ${what}`
  }
}

export const personName = name

/** "Rohit, 3 Oct 14:02" — who did a thing and when, under a block. */
export function stampText(
  p: { first_name: string; last_name: string } | null | undefined,
  iso: string,
): string {
  const at = new Date(iso)
  const when = at.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return `${name(p)}, ${when}`
}

/** Light or dark text on a block of this colour. */
export function inkOn(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return '#ffffff'
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.55 ? '#0b0b0f' : '#ffffff'
}
