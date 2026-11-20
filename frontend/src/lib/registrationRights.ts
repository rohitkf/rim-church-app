import { useAuth } from '../auth/AuthContext'
import { usePermissions } from './usePermissions'
import type { CapabilityKey } from './permissions'
import { useReceptionLock } from './receptionLock'

/*
 * The parts of registrations, each its own right (0251). The database
 * decides (registration_can); this is the same rule, so a page shows only
 * the buttons its person may press. "Run registrations" is all of it, bar
 * deleting an event, which is the Owner's and "Cancel & delete"'s, and
 * verifying a payment (0267), which is the Pastor's and the Owner's.
 * An Admin has every one of them out of the box since 0312; before it, only
 * correcting an email address (0283).
 *
 * While Reception is locked (0288) the door's own rights give nothing;
 * "Run registrations" and the office rights are not held by it.
 *
 * "Sort out problems" (0312) is the door's fifth right: what a door meets
 * that is not a check-in, a payment or a walk-in. It answers to five of
 * the office's questions and no others — an email address, a note, a
 * promo code put on, a payment waived or put back to not paid, one
 * registration cancelled or put back — which is why each of those is its
 * own word below (`email`, `note`, `promo`, `waive`, `cancelOrder`) and
 * not the office right it used to be read from.
 */

/** Any of these opens the Registrations page. */
export const OFFICE_RIGHTS: CapabilityKey[] = ['reg.manage', 'reg.view', 'reg.edit', 'reg.approve', 'reg.refund', 'reg.cancel', 'reg.verify', 'reg.email']
/** Any of these opens Reception — the last one to look only (0267). */
export const DOOR_RIGHTS: CapabilityKey[] = ['reg.manage', 'reg.door', 'reg.door_pay', 'reg.walk_in', 'reg.door_fix', 'reg.door_view']
/** The door's own rights: the ones a locked Reception switches off (0288). */
export const LOCKABLE_RIGHTS: CapabilityKey[] = ['reg.door', 'reg.door_pay', 'reg.walk_in', 'reg.door_fix', 'reg.door_view']

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
  /** Say a payment arrived (0267). Its own right: "Run registrations" does not give it. */
  verify: boolean
  /** Put an attendee's email address right, which sends their email again (0283). The office's right, or the door's (0312). */
  email: boolean
  /** "Sort out problems" at Reception (0312), or running registrations. */
  fix: boolean
  /** Waive a payment, or put one back to not paid: approving, or the door's right. */
  waive: boolean
  /** Put a promo code on a registration already made (0298): approving, or the door's right. */
  promo: boolean
  /** Cancel one registration, or put one back: cancelling, or the door's right. Not the event — that is `cancel`. */
  cancelOrder: boolean
  /** Write the note on a registration: anybody in the office, or the door's right. */
  note: boolean
}

export function rightsFrom(can: (cap: CapabilityKey) => boolean, isOwner: boolean, locked = false): RegistrationRights {
  const all = can('reg.manage')
  // A door right, which a locked Reception does not honour.
  const door = (cap: CapabilityKey) => !locked && can(cap)
  const office = OFFICE_RIGHTS.some(can)
  const fix = all || door('reg.door_fix')
  return {
    office,
    door: all || LOCKABLE_RIGHTS.some(door),
    edit: all || can('reg.edit'),
    approve: all || can('reg.approve'),
    takePayment: all || can('reg.approve') || door('reg.door_pay'),
    refund: all || can('reg.refund'),
    cancel: all || can('reg.cancel'),
    delete: isOwner || can('reg.cancel'),
    checkIn: all || door('reg.door') || door('reg.door_pay') || door('reg.walk_in'),
    walkIn: all || door('reg.walk_in'),
    verify: can('reg.verify'),
    email: all || can('reg.email') || fix,
    fix,
    waive: all || can('reg.approve') || fix,
    promo: all || can('reg.approve') || fix,
    cancelOrder: all || can('reg.cancel') || fix,
    note: office || fix,
  }
}

export function useRegistrationRights(): RegistrationRights {
  const { can } = usePermissions()
  const { isSuperAdmin } = useAuth()
  const { locked } = useReceptionLock()
  return rightsFrom((cap) => can(cap), isSuperAdmin, locked)
}
