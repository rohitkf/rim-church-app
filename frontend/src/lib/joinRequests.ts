import type { Department, JoinRequest } from './types'

/**
 * What a person's relationship to a team currently is, from the point of
 * view of the "can I join this?" question.
 *
 *  - `member`   — already on it, as a core member or a guest
 *  - `pending`  — asked, waiting on the head
 *  - `declined` — asked before and was turned down; they may ask again
 *  - `open`     — never asked, or withdrew
 */
export type JoinState = 'member' | 'pending' | 'declined' | 'open'

export type TeamJoinOption = {
  department: Department
  state: JoinState
  /** The open request, when there is one to withdraw. */
  requestId: string | null
}

/**
 * Pair every team with where the person stands on it.
 *
 * Only one request per person per team can be open at a time (the database
 * enforces that), so "pending" is unambiguous. A withdrawn or declined ask
 * leaves the door open — people change their minds, and so do heads.
 */
export function joinOptions(
  departments: Department[],
  memberDeptIds: Iterable<string>,
  myRequests: JoinRequest[],
): TeamJoinOption[] {
  const mine = new Set(memberDeptIds)
  const pending = new Map<string, JoinRequest>()
  const declined = new Set<string>()

  for (const request of myRequests) {
    if (request.status === 'pending') pending.set(request.department_id, request)
    else if (request.status === 'declined') declined.add(request.department_id)
  }

  return departments.map((department) => {
    const open = pending.get(department.id)
    const state: JoinState = mine.has(department.id)
      ? 'member'
      : open
        ? 'pending'
        : declined.has(department.id)
          ? 'declined'
          : 'open'
    return { department, state, requestId: open?.id ?? null }
  })
}

/** The teams worth showing under "ask to join" — everything you're not on. */
export function joinableTeams(options: TeamJoinOption[]): TeamJoinOption[] {
  return options.filter((o) => o.state !== 'member')
}

/**
 * Whether this person may post on the message board.
 *
 * Being on a team is what earns a voice there: a volunteer posts as their
 * team, a head as the team they lead, an Admin for the church. This mirrors
 * the `messages_insert` policy — the button and the database agree, so a
 * refusal never comes as a surprise after the fact.
 */
export function canPostOnBoard(opts: {
  isAdmin: boolean
  isHead: boolean
  memberDeptIds: Iterable<string>
}): boolean {
  if (opts.isAdmin || opts.isHead) return true
  for (const _ of opts.memberDeptIds) return true
  return false
}
