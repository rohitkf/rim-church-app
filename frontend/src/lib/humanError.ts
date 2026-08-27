import { errorMessage } from './errorMessage'

/**
 * Turn a database rejection into something a volunteer can act on.
 *
 * Postgres speaks in constraint names — "duplicate key value violates unique
 * constraint rota_assignments_service_id_user_id_key" — which tells a
 * developer exactly what happened and tells everyone else nothing. Each rule
 * we rely on gets a sentence here saying what the rule is, so the person who
 * hit it knows what to do instead.
 */
const BY_CONSTRAINT: Record<string, string> = {
  rota_assignments_service_id_user_id_key:
    'They already have a role in this service — someone can only hold one role per service. Remove the existing one first, or pick someone else.',
  departments_one_service_flow:
    'Another team already signs checklists off. Choose it again in Team setup to move the sign-off.',
  inventory_items_asset_tag_key: 'That asset tag is already in use by another item.',
  availability_user_id_service_id_department_id_key:
    'There is already an answer recorded for that person on this service.',
  user_roles_user_id_role_type_department_id_service_id_key: 'They already hold that role.',
  department_members_user_id_department_id_key: 'They are already on that team.',
  rota_checklist_progress_assignment_id_item_id_key:
    'That checklist item already has an entry — reload the page and try again.',
  services_date_service_type_key: 'A service of that name already exists on that date.',
}

const BY_CODE: Record<string, string> = {
  '23505': 'That already exists.',
  '23503': 'Something this depends on is missing — it may have been deleted while you were working.',
  '23514': "That isn't allowed by the rules for this record.",
  '23502': 'Something required was left blank.',
  '42501': "You don't have permission to do that.",
  '42703': 'This needs a database update before it can be saved.',
  '42P01': 'This needs a database update before it can be used.',
  '22P02': "That value isn't in the right format.",
}

/**
 * Errors our own functions raise are already written for people — plpgsql
 * RAISE comes back as P0001 — so they pass straight through rather than
 * being replaced by something vaguer.
 */
function isOurOwnMessage(code: unknown): boolean {
  return code === 'P0001'
}

function translate(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null
  const { code, message, details } = err as Record<string, unknown>
  if (isOurOwnMessage(code)) return typeof message === 'string' ? message : null

  const haystack = `${typeof message === 'string' ? message : ''} ${typeof details === 'string' ? details : ''}`
  for (const [constraint, text] of Object.entries(BY_CONSTRAINT)) {
    if (haystack.includes(constraint)) return text
  }

  if (haystack.includes('row-level security')) return BY_CODE['42501']
  if (typeof code === 'string' && BY_CODE[code]) return BY_CODE[code]
  return null
}

/**
 * What to put on screen.
 *
 * Admins get the raw message — they are the ones who fix the database, and
 * a constraint name is the fastest route to the cause. Everyone else gets
 * the explanation, or a plain fallback when we have nothing better; showing
 * them Postgres's own words only teaches them the app is broken.
 */
export function humanError(err: unknown, fallback: string, isAdmin: boolean): string {
  const friendly = translate(err)
  if (isAdmin) {
    const raw = errorMessage(err, fallback)
    return friendly && friendly !== raw ? `${friendly}\n\n${raw}` : raw
  }
  return friendly ?? fallback
}
