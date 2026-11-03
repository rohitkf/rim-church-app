import { useAuth } from '../auth/AuthContext'
import { usePermissions } from './usePermissions'
import type { CapabilityKey } from './permissions'

/*
 * The parts of registrations, each its own right (0251). The database
 * decides (registration_can); this is the same rule, so a page shows only
 * the buttons its person may press. "Run registrations" is all of it, bar
 * deleting an event, which is the Owner's and "Cancel & delete"'s.
 */

/** Any of these opens the Registrations page. */
export const OFFICE_RIGHTS: CapabilityKey[] = ['reg.manage', 'reg.view', 'reg.edit', 'reg.approve', 'reg.refund', 'reg.cancel']
/** Any of these opens Reception. */
export const DOOR_RIGHTS: CapabilityKey[] = ['reg.manage', 'reg.door', 'reg.door_pay', 'reg.walk_in']

export interface RegistrationRights {
  office: boolean
  door: boolean
  edit: boolean
  approve: boolean
  takePayment: boolean
  refund: boolean
  cancel: boolean
  delete: boolean
  checkIn: boolean
  walkIn: boolean
}

export function rightsFrom(can: (cap: CapabilityKey) => boolean, isOwner: boolean): RegistrationRights {
  const all = can('reg.manage')
  return {
    office: OFFICE_RIGHTS.some(can),
    door: DOOR_RIGHTS.some(can),
    edit: all || can('reg.edit'),
    approve: all || can('reg.approve'),
    takePayment: all || can('reg.approve') || can('reg.door_pay'),
    refund: all || can('reg.refund'),
    cancel: all || can('reg.cancel'),
    delete: isOwner || can('reg.cancel'),
    checkIn: all || can('reg.door') || can('reg.door_pay') || can('reg.walk_in'),
    walkIn: all || can('reg.walk_in'),
  }
}

export function useRegistrationRights(): RegistrationRights {
  const { can } = usePermissions()
  const { isSuperAdmin } = useAuth()
  return rightsFrom((cap) => can(cap), isSuperAdmin)
}
