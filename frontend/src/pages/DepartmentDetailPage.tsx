import { type FormEvent, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import {
  DESIGNATION_BADGE,
  DESIGNATION_LABEL,
  orderByDesignation,
  orderByName,
  designationOn,
  type Designation,
} from '../lib/designation'
import { Select, selectPillClasses } from '../components/Select'
import { userRoleSchema } from '../auth/types'
import { InviteDialog } from '../components/InviteDialog'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { usePermissions } from '../lib/usePermissions'
import { QueryState } from '../components/QueryState'
import { HANDBOOK_BUCKET, useHandbookUrl } from '../lib/useHandbookUrl'
import { HandbookUploadModal } from '../components/HandbookUploadModal'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { searchProfiles, type ProfileSearchResult } from '../lib/queries'
import { DepartmentRolesCard } from '../components/DepartmentRolesCard'
import { useErrorText } from '../lib/useErrorText'
import { useConfirmAction } from '../components/ConfirmAction'
import {
  GUESTS_KEY,
  addGuestToTeam,
  departmentGuestsKey,
  fetchDepartmentGuests,
  guestLabel,
  removeDepartmentGuest,
  setDepartmentGuestType,
  type DepartmentGuest,
} from '../lib/guests'
import { ageFrom } from '../lib/celebrations'
import {
  departmentSchema,
  departmentMemberRowSchema,
  sensitiveByUserSchema,
  type Department,
  type DepartmentMemberRow,
  type MemberType,
  type SensitiveByUser,
} from '../lib/types'

async function fetchDepartment(id: string): Promise<Department | null> {
  const { data, error } = await supabase.from('departments').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? departmentSchema.parse(data) : null
}

/*
 * Members' email addresses are the Owner's alone to see on this page.
 * `profiles.email` is closed to everybody (0127), so the roster never
 * asks for it; for the Owner it is filled in from people_contacts()
 * (0126), which refuses anybody else.
 */
async function fetchMembers(id: string, withEmail: boolean): Promise<DepartmentMemberRow[]> {
  const { data, error } = await supabase
    .from('department_members')
    .select('*, profiles(id, first_name, last_name, avatar_url, dob)')
    .eq('department_id', id)
  if (error) throw error
  const rows = z.array(departmentMemberRowSchema).parse(data)
  if (!withEmail || rows.length === 0) return rows
  const contacts = await fetchContacts(rows.map((r) => r.user_id))
  return rows.map((r) =>
    r.profiles && contacts[r.user_id] ? { ...r, profiles: { ...r.profiles, email: contacts[r.user_id] } } : r,
  )
}

const contactRowSchema = z.object({ id: z.string(), email: z.string().nullable() })

async function fetchContacts(userIds: string[]): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('people_contacts', { p_ids: userIds })
  if (error) throw error
  const out: Record<string, string> = {}
  for (const row of z.array(contactRowSchema).parse(data ?? [])) if (row.email) out[row.id] = row.email
  return out
}

const sensitiveRowSchema = sensitiveByUserSchema.extend({ user_id: z.string() })

async function fetchSensitive(userIds: string[]): Promise<Record<string, SensitiveByUser>> {
  if (userIds.length === 0) return {}
  const { data, error } = await supabase
    .from('profile_sensitive')
    .select('user_id, visa_type, has_dbs, visa_expiry')
    .in('user_id', userIds)
  if (error) throw error
  const rows = z.array(sensitiveRowSchema).parse(data)
  return Object.fromEntries(rows.map((row) => [row.user_id, row]))
}

const departmentGrantSchema = userRoleSchema.extend({ user_id: z.string() })
type DepartmentGrant = z.infer<typeof departmentGrantSchema>

async function fetchDepartmentGrants(departmentId: string): Promise<DepartmentGrant[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('id, user_id, role_type, department_id, service_id')
    .eq('department_id', departmentId)
  if (error) throw error
  return z.array(departmentGrantSchema).parse(data)
}

function ComplianceCell({ sensitive }: { sensitive: SensitiveByUser | undefined }) {
  // RLS on profile_sensitive is the source of truth: if the row wasn't
  // returned, this viewer isn't allowed to see it (the Owner and the
  // individual only, 0126), so we show a neutral placeholder instead of
  // guessing why. The column itself is drawn only for the Owner.
  if (!sensitive) {
    return <span className="text-body-sm text-on-surface-variant">—</span>
  }
  return (
    /* One line, always. "DBS MISSING" wrapping to two lines inside a pill
       was most of what made this roster look broken on a phone. */
    <span
      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide ${
        sensitive.has_dbs
          ? 'bg-status-coordinator/15 text-status-coordinator'
          : 'bg-error-container text-on-error-container'
      }`}
    >
      {sensitive.has_dbs ? 'DBS ✓' : 'No DBS'}
    </span>
  )
}

/**
 * How old somebody is, for everyone on the team to see.
 *
 * A roster where you know a name and an email and not whether you are
 * talking to a sixteen-year-old is a roster that makes people careful in
 * the wrong ways. The date itself is nobody's business here — the year is
 * the thing that changes how you speak to somebody — so the page shows
 * the number and not the birthday.
 *
 * It comes off `profiles`, which any signed-in person can already read;
 * nothing was widened to put this on the page. Blank when the person has
 * not filled their date in, because "—" invites a question and an empty
 * cell does not.
 */
function Age({ dob }: { dob: string | null | undefined }) {
  const age = ageFrom(dob)
  if (age === null) return null
  return <span className="tabular-nums">{age}</span>
}

export function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { isSuperAdmin: isOwner } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  // Each of this team's controls is its own permission (Settings › Access
  // & privileges): who is on it, its name and handbook, its roles, their
  // groups and checklists, and inviting somebody new.
  const { can } = usePermissions()
  const here = { departmentId: id ?? null }
  const canManage = can('team.members', here)
  const canEditTeam = can('team.edit', here)
  const canInvite = can('people.invite', here)

  const [addEmail, setAddEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [addType, setAddType] = useState<MemberType>('core')
  const [addError, setAddError] = useState<string | null>(null)
  /** A typed name nobody registered has: offered the guest roll instead. */
  const [rollOffer, setRollOffer] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const deptQuery = useQuery({
    queryKey: ['department', id],
    queryFn: () => fetchDepartment(id!),
    enabled: !!id,
  })

  const membersQuery = useQuery({
    queryKey: ['department-members', id, isOwner],
    queryFn: () => fetchMembers(id!, isOwner),
    enabled: !!id,
  })

  /*
   * The roll's people on this team (0161): somebody who helps but has no
   * account, listed core or guest like anybody else. On the rota and on
   * this page; not asked for availability, there being nobody to ask. The
   * day they sign up and are linked on the guest roll, the database moves
   * them into the members above.
   */
  const rollQuery = useQuery({
    queryKey: departmentGuestsKey(id ?? ''),
    queryFn: () => fetchDepartmentGuests(id!),
    enabled: !!id,
  })
  const rollCore = (rollQuery.data ?? []).filter((g) => g.member_type === 'core')
  const rollGuests = (rollQuery.data ?? []).filter((g) => g.member_type === 'guest')

  /*
   * Who runs this team.
   *
   * The roster listed everybody the same way, so the person to ask about a
   * rota clash looked exactly like the person to ask about a camera. The
   * grants live in user_roles rather than on the membership row, so they are
   * fetched alongside and matched by user.
   */
  const grantsQuery = useQuery({
    queryKey: ['department-grants', id],
    queryFn: () => fetchDepartmentGrants(id!),
    enabled: !!id,
  })
  const designationOf = (userId: string): Designation =>
    designationOn((grantsQuery.data ?? []).filter((g) => g.user_id === userId), id!)

  // Split once: the roster renders twice — as cards on a phone and as a
  // table from `sm` up — and both need the same list.
  const coreMembers = orderByDesignation(
    (membersQuery.data ?? []).filter((m) => m.member_type === 'core'),
    designationOf,
  )
  const guestMembers = orderByName(
    (membersQuery.data ?? []).filter((m) => m.member_type === 'guest'),
  )

  const memberIds = membersQuery.data?.map((m) => m.user_id) ?? []
  const sensitiveQuery = useQuery({
    queryKey: ['department-members-sensitive', id, memberIds],
    queryFn: () => fetchSensitive(memberIds),
    // Visa and DBS are the Owner's to see (0126); nobody else is asked.
    enabled: isOwner && memberIds.length > 0,
  })

  const handbookQuery = useHandbookUrl(deptQuery.data?.handbook_url)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [confirmRemoveHandbook, setConfirmRemoveHandbook] = useState(false)
  const handbookLabel = deptQuery.data?.handbook_url?.endsWith('.docx')
    ? 'Open handbook (Word)'
    : 'Open handbook (PDF)'

  // Type-ahead over registered profiles: people rarely remember the exact
  // address they signed up with, so match on name too and let them pick.
  const [picked, setPicked] = useState<ProfileSearchResult | null>(null)
  const searchTerm = useDebouncedValue(addEmail.trim(), 250)
  const suggestionsQuery = useQuery({
    queryKey: ['profile-search', searchTerm],
    queryFn: () => searchProfiles(searchTerm),
    enabled: canManage && searchTerm.length >= 2 && !picked,
  })
  const memberIdSet = useMemo(
    () => new Set((membersQuery.data ?? []).map((m) => m.user_id)),
    [membersQuery.data],
  )
  const suggestions = (suggestionsQuery.data ?? []).filter((p) => !memberIdSet.has(p.id))

  const addMember = useMutation({
    mutationFn: async ({ email, type }: { email: string; type: MemberType }): Promise<'added' | 'offered'> => {
      let userId = picked?.id ?? null

      if (!userId) {
        // A typed address is matched by the database, which says only who
        // it belongs to (0126) — addresses are not readable here (0127).
        const { data: found, error: lookupError } = await supabase.rpc('person_by_email', { p_email: email })
        if (lookupError) throw lookupError
        if (typeof found !== 'string') {
          // A name nobody registered has is not a mistake: it may be somebody
          // who helps without an account. Offer the roll rather than refuse.
          if (!email.includes('@')) {
            setRollOffer(email)
            setAddError(null)
            return 'offered'
          }
          throw new Error('No registered user matches that — pick someone from the suggestions.')
        }
        userId = found
      }

      const { error } = await supabase
        .from('department_members')
        .insert({ department_id: id, user_id: userId, member_type: type })
      if (error) throw error
      return 'added'
    },
    onSuccess: (result) => {
      // The name stays in the box while the roll is offered: "Not now" should not mean retyping it.
      if (result === 'offered') return
      setAddEmail('')
      setPicked(null)
      setAddError(null)
      queryClient.invalidateQueries({ queryKey: ['department-members', id] })
    },
    onError: (err: unknown) => setAddError(errorText(err, 'Could not add member.')),
  })

  const addRollGuest = useMutation({
    mutationFn: ({ name, type }: { name: string; type: MemberType }) => addGuestToTeam(id!, name, type),
    onSuccess: () => {
      setRollOffer(null)
      setAddEmail('')
      setPicked(null)
      setAddError(null)
      queryClient.invalidateQueries({ queryKey: departmentGuestsKey(id ?? '') })
      queryClient.invalidateQueries({ queryKey: GUESTS_KEY })
    },
    onError: (err: unknown) => setAddError(errorText(err, 'Could not add them to the roll.')),
  })

  const setRollType = useMutation({
    mutationFn: ({ rowId, type }: { rowId: string; type: MemberType }) => setDepartmentGuestType(rowId, type),
    onSuccess: () => {
      setAddError(null)
      queryClient.invalidateQueries({ queryKey: departmentGuestsKey(id ?? '') })
    },
    onError: (err: unknown) => setAddError(errorText(err, 'Could not change that membership.')),
  })

  const removeRollGuest = useMutation({
    mutationFn: (rowId: string) => removeDepartmentGuest(rowId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: departmentGuestsKey(id ?? '') }),
    onError: (err: unknown) => setAddError(errorText(err, 'Could not remove them.')),
  })

  /** A roll guest on the team, wherever one is drawn: name, the fact they have no account yet, the two controls. */
  const rollRow = (g: DepartmentGuest, where: 'card' | 'guest') => {
    const who = g.guests ? guestLabel(g.guests) : 'Somebody on the roll'
    const toGuest = g.member_type === 'core'
    const quiet = where === 'card' ? 'tap text-label-md' : 'tap inline-flex items-center text-body-sm'
    return (
      <>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="min-w-0 break-words text-body-md font-medium text-on-surface">{who}</span>
            <span className="shrink-0 whitespace-nowrap rounded-full bg-raised-strong px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
              No account yet
            </span>
          </div>
          <div className="mt-0.5 text-body-sm text-on-surface-faint">On the guest roll. Link them there once they sign up.</div>
        </div>
        {canManage && (
          <span className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              disabled={setRollType.isPending}
              onClick={() =>
                ask({
                  title: toGuest ? `Make ${who} a guest?` : `Make ${who} a core member?`,
                  body: toGuest
                    ? 'Guests are not counted when the team looks short.'
                    : 'Core members are counted when the team looks short. With no account, they are not asked for availability.',
                  confirmLabel: toGuest ? 'Make a guest' : 'Make core',
                  onConfirm: () => setRollType.mutate({ rowId: g.id, type: toGuest ? 'guest' : 'core' }),
                })
              }
              className={`${quiet} text-on-surface-faint hover:text-accent-blue-soft hover:underline disabled:opacity-60`}
            >
              {toGuest ? 'Make a guest' : 'Make core'}
            </button>
            <button
              type="button"
              onClick={() =>
                ask({
                  title: `Remove ${who} from the team?`,
                  body: 'They stay on the guest roll and can be added back at any time.',
                  confirmLabel: 'Remove',
                  onConfirm: () => removeRollGuest.mutate(g.id),
                })
              }
              className={`${quiet} text-on-surface-faint hover:text-error hover:underline`}
            >
              Remove
            </button>
          </span>
        )}
      </>
    )
  }

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from('department_members').delete().eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['department-members', id] }),
  })

  /*
   * Moving somebody between core and guest.
   *
   * People move both ways over a year — a guest who keeps turning up
   * becomes part of the team, a core member steps back to helping when
   * they can — and until now the only way to record it was to remove them
   * and add them again, which loses the date they joined and reads on the
   * feed like they left.
   *
   * It is not cosmetic: availability is counted against the core, and so
   * is the readiness ring. Moving somebody to guest stops the team being
   * marked a person down every week they cannot serve.
   */
  const setMemberType = useMutation({
    mutationFn: async ({ memberId, type }: { memberId: string; type: 'core' | 'guest' }) => {
      const { error } = await supabase
        .from('department_members')
        .update({ member_type: type })
        .eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      setAddError(null)
      // The rota and availability count the core, so both are now stale.
      queryClient.invalidateQueries({ queryKey: ['department-members', id] })
      queryClient.invalidateQueries({ queryKey: ['availability'] })
    },
    onError: (err: unknown) => setAddError(errorText(err, 'Could not change that membership.')),
  })

  /** The one control, wherever a member is drawn. */
  const moveButton = (m: DepartmentMemberRow, className: string) => {
    const toGuest = m.member_type === 'core'
    const who = m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : 'this person'
    return (
      <button
        type="button"
        disabled={setMemberType.isPending}
        onClick={() =>
          ask({
            title: toGuest ? `Make ${who} a guest?` : `Make ${who} a core member?`,
            body: toGuest
              ? 'Guests are not counted when the team looks short, and are not chased for an answer on availability.'
              : 'Core members are counted when the team looks short, and are asked whether they can serve.',
            confirmLabel: toGuest ? 'Make a guest' : 'Make core',
            onConfirm: () =>
              setMemberType.mutate({ memberId: m.id, type: toGuest ? 'guest' : 'core' }),
          })
        }
        className={className}
      >
        {toGuest ? 'Make a guest' : 'Make core'}
      </button>
    )
  }

  // Uploading lives in its own modal; here we only take one away.
  const removeHandbook = useMutation({
    mutationFn: async () => {
      const path = deptQuery.data?.handbook_url
      if (!path) return
      const { error: removeErr } = await supabase.storage.from(HANDBOOK_BUCKET).remove([path])
      if (removeErr) throw removeErr
      const { error: updateErr } = await supabase
        .from('departments')
        .update({ handbook_url: null })
        .eq('id', id)
      if (updateErr) throw updateErr
    },
    onSuccess: () => {
      setConfirmRemoveHandbook(false)
      setUploadError(null)
      queryClient.invalidateQueries({ queryKey: ['department', id] })
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
    onError: (err: unknown) => setUploadError(errorText(err, 'Could not remove the handbook.')),
  })

  const { ask, dialog } = useConfirmAction()

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!addEmail.trim()) return
    addMember.mutate({ email: addEmail.trim(), type: addType })
  }

  return (
    <QueryState isLoading={deptQuery.isLoading} error={deptQuery.error} isEmpty={deptQuery.data === null} emptyMessage="Department not found, or you don't have access to it.">
      <div>
        {/* The handbook controls are 199px of buttons that were pinned to
            the right of the title with nowhere to go on a phone, so they
            hung off the edge. They sit under the title until there is
            room for both. */}
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-headline-xl">{deptQuery.data?.name}</h1>
            <p className="mt-1 text-body-md text-on-surface-variant">
              Manage core team members, guest access, and compliance status.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            {handbookQuery.data && (
              <a
                href={handbookQuery.data}
                target="_blank"
                rel="noreferrer"
                className="tap rounded-full hairline bg-surface-lowest px-4 py-2 text-body-sm font-medium text-on-surface hover:border-secondary"
              >
                {handbookLabel}
              </a>
            )}
            {(canInvite || canEditTeam) && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Adding somebody who has no account yet is the commonest
                    dead end on this page: the roster only takes people who
                    already exist. */}
                {canInvite && (
                <button
                  type="button"
                  onClick={() => setInviting(true)}
                  className="tap rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:opacity-90"
                >
                  Invite someone
                </button>
                )}
                {canEditTeam && (
                <>
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="tap rounded-full hairline bg-surface-lowest px-4 py-2 text-body-sm font-medium text-on-surface hover:border-secondary"
                >
                  {deptQuery.data?.handbook_url ? 'Replace handbook' : 'Upload handbook'}
                </button>
                {deptQuery.data?.handbook_url && (
                  <button
                    type="button"
                    onClick={() => {
                      setUploadError(null)
                      setConfirmRemoveHandbook(true)
                    }}
                    className="tap rounded-sm px-3 py-2 text-body-sm font-medium text-on-surface-variant hover:text-error"
                  >
                    Remove
                  </button>
                )}
                </>
                )}
              </div>
            )}
          </div>
        </div>
        {uploadError && (
          <p className="mt-2 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">{uploadError}</p>
        )}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-headline-md">Core Members</h2>
              <span className="rounded-full bg-surface-container px-2 py-0.5 font-mono text-label-sm text-on-surface-variant">
                {coreMembers.length} Active
              </span>
            </div>

            <QueryState isLoading={membersQuery.isLoading} error={membersQuery.error}>
              {/*
                Four columns need about 420px and a phone has 360, so the
                table used to hand a phone a sideways scroll with the
                compliance badge parked off the edge where nobody found it.
                Below `sm` each member is a card instead — same fields,
                stacked, nothing hidden. The table returns where it fits.
              */}
              {/*
                Name, then who they are, then how to reach them, then the
                one badge — in that order down the card rather than fought
                over on one line. Remove sits at the bottom right as quiet
                text: it is the rarest thing anyone does here and it used to
                be the loudest thing on every row.
              */}
              <ul className="mt-4 flex flex-col gap-2.5 sm:hidden">
                {coreMembers.map((m) => {
                  const rank = designationOf(m.user_id)
                  return (
                    <li key={m.id} className="rounded-[var(--radius-row)] bg-raised p-3.5 hairline">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="min-w-0 break-words text-body-md font-medium text-on-surface">
                          {m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : 'Unknown user'}
                        </span>
                        {rank !== 'member' && (
                          <span
                            className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide ${
                              rank === 'head'
                                ? 'bg-primary/15 text-accent-blue-soft'
                                : 'bg-secondary/15 text-accent-blue-soft'
                            }`}
                          >
                            {DESIGNATION_BADGE[rank]}
                          </span>
                        )}
                      </div>
                      {/* An email has no spaces to wrap at, so it needs
                          permission to break mid-word or it sets the card's
                          width for it. The Owner's alone to see. */}
                      {isOwner && m.profiles?.email && (
                        <div className="mt-1 break-all text-body-sm text-on-surface-variant">
                          {m.profiles.email}
                        </div>
                      )}
                      {ageFrom(m.profiles?.dob) !== null && (
                        <div className="mt-0.5 text-body-sm text-on-surface-faint">
                          <Age dob={m.profiles?.dob} /> years old
                        </div>
                      )}
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        {isOwner ? <ComplianceCell sensitive={sensitiveQuery.data?.[m.user_id]} /> : <span />}
                        {canManage && (
                          <span className="flex items-center gap-3">
                            {moveButton(
                              m,
                              'tap text-label-md text-on-surface-faint hover:text-accent-blue-soft hover:underline disabled:opacity-60',
                            )}
                            <button
                              onClick={() =>
                              ask({
                                title: `Remove ${
                                  m.profiles
                                    ? `${m.profiles.first_name} ${m.profiles.last_name}`
                                    : 'this person'
                                } from the team?`,
                                body: 'They keep their account and can be added back at any time.',
                                confirmLabel: 'Remove',
                                onConfirm: () => removeMember.mutate(m.id),
                              })
                            }
                              className="tap text-label-md text-on-surface-faint hover:text-error hover:underline"
                            >
                              Remove
                            </button>
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
                {rollCore.map((g) => (
                  <li key={g.id} className="flex items-start justify-between gap-3 rounded-[var(--radius-row)] bg-raised p-3.5 hairline">
                    {rollRow(g, 'card')}
                  </li>
                ))}
              </ul>

              <div className="mt-4 hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-body-sm">
                  <thead>
                    <tr className="border-b border-border-subtle font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                      <th className="py-2 pr-4">Member</th>
                      <th className="py-2 pr-4">Age</th>
                      <th className="py-2 pr-4">On this team</th>
                      {isOwner && <th className="py-2 pr-4">Contact</th>}
                      {isOwner && <th className="py-2 pr-4">Compliance</th>}
                      {canManage && <th className="py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {coreMembers.map((m) => (
                        <tr key={m.id} className="border-b border-border-subtle last:border-0">
                          <td className="py-3 pr-4 font-medium text-on-surface">
                            {m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : 'Unknown user'}
                          </td>
                          <td className="py-3 pr-4 text-on-surface-variant">
                            <Age dob={m.profiles?.dob} />
                          </td>
                          <td className="py-3 pr-4 text-on-surface-variant">
                            {DESIGNATION_LABEL[designationOf(m.user_id)]}
                          </td>
                          {isOwner && (
                            <td className="py-3 pr-4 break-all text-on-surface-variant">
                              {m.profiles?.email}
                            </td>
                          )}
                          {isOwner && (
                            <td className="py-3 pr-4">
                              <ComplianceCell sensitive={sensitiveQuery.data?.[m.user_id]} />
                            </td>
                          )}
                          {canManage && (
                            <td className="py-3 text-right">
                              <span className="inline-flex items-center gap-3">
                                {moveButton(
                                  m,
                                  'tap inline-flex items-center text-body-sm text-on-surface-faint hover:text-accent-blue-soft hover:underline disabled:opacity-60',
                                )}
                                <button
                                  onClick={() =>
                              ask({
                                title: `Remove ${
                                  m.profiles
                                    ? `${m.profiles.first_name} ${m.profiles.last_name}`
                                    : 'this person'
                                } from the team?`,
                                body: 'They keep their account and can be added back at any time.',
                                confirmLabel: 'Remove',
                                onConfirm: () => removeMember.mutate(m.id),
                              })
                            }
                                  className="tap inline-flex items-center text-body-sm text-on-surface-faint hover:text-error hover:underline"
                                >
                                  Remove
                                </button>
                              </span>
                            </td>
                          )}
                        </tr>
                      ))}
                    {rollCore.map((g) => (
                      <tr key={g.id} className="border-b border-border-subtle last:border-0">
                        <td colSpan={3 + (isOwner ? 2 : 0) + (canManage ? 1 : 0)} className="py-3">
                          <div className="flex items-center justify-between gap-3">{rollRow(g, 'guest')}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {coreMembers.length === 0 && rollCore.length === 0 && (
                  <p className="py-4 text-body-sm text-on-surface-variant">No core members yet.</p>
                )}
              </div>
            </QueryState>

            {canManage && (
              <form onSubmit={handleAdd} className="mt-6 flex flex-wrap items-end gap-2 border-t border-border-subtle pt-4">
                <div className="relative flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
                  <label className="flex flex-col gap-1">
                    Add by name, or their full email
                    <input
                      type="text"
                      autoComplete="off"
                      value={addEmail}
                      onChange={(e) => {
                        setAddEmail(e.target.value)
                        setPicked(null)
                      }}
                      placeholder="Start typing a name…"
                      className="rounded-full hairline px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
                    />
                  </label>

                  {picked && (
                    <p className="text-label-sm text-accent-blue-soft">
                      Adding {picked.first_name} {picked.last_name}
                    </p>
                  )}

                  {/* Floating over the form only where there is room beside the
                      box: on a phone the Add button wraps underneath, and a list
                      floating there sat on top of it. In the flow it pushes the
                      button down instead. */}
                  {!picked && searchTerm.length >= 2 && (
                    <div className="mt-1 overflow-hidden rounded-[var(--radius-chip)] hairline bg-surface-lowest shadow-lg sm:absolute sm:left-0 sm:right-0 sm:top-full sm:z-10">
                      {suggestionsQuery.isLoading ? (
                        <p className="px-3 py-2 text-body-sm text-on-surface-variant">Searching…</p>
                      ) : suggestions.length === 0 ? (
                        <div className="px-3 py-2 text-body-sm text-on-surface-variant">
                          No matching registered user.
                          {!searchTerm.includes('@') && (
                            <button
                              type="button"
                              onClick={() => {
                                setRollOffer(searchTerm)
                                setAddError(null)
                              }}
                              className="tap mt-1 block font-medium text-accent-blue-soft hover:underline"
                            >
                              Add “{searchTerm}” to the guest roll instead
                            </button>
                          )}
                        </div>
                      ) : (
                        <ul className="max-h-56 overflow-y-auto">
                          {suggestions.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setPicked(p)
                                  setAddEmail(`${p.first_name} ${p.last_name}`.trim())
                                  setAddError(null)
                                }}
                                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-container"
                              >
                                <span className="text-body-sm font-medium text-on-surface">
                                  {p.first_name} {p.last_name}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
                  Type
                  <Select
                    value={addType}
                    onChange={(type) => setAddType(type as MemberType)}
                    className={selectPillClasses}
                    aria-label="Member type"
                    options={[
                      { value: 'core', label: 'Core' },
                      { value: 'guest', label: 'Guest' },
                    ]}
                  />
                </label>
                <button
                  type="submit"
                  disabled={addMember.isPending}
                  className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                >
                  {addMember.isPending ? 'Adding…' : 'Add'}
                </button>
              </form>
            )}
            {rollOffer && canManage && (
              <div role="status" className="mt-3 rounded-[var(--radius-card)] bg-raised p-4 hairline">
                <p className="text-body-md font-medium text-on-surface">{rollOffer} has no account here.</p>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  Add them to the guest roll and to this team as {addType === 'core' ? 'a core member' : 'a guest'}? They can be put on the
                  rota, but are not asked for availability until they sign up and are linked on the roll.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={addRollGuest.isPending}
                    onClick={() => addRollGuest.mutate({ name: rollOffer, type: addType })}
                    className="rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                  >
                    {addRollGuest.isPending ? 'Adding…' : 'Add to the roll'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRollOffer(null)}
                    className="rounded-full px-4 py-2 text-body-sm text-on-surface-variant hairline hover:text-on-surface"
                  >
                    Not now
                  </button>
                </div>
              </div>
            )}
            {addError && (
              <p className="mt-2 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">{addError}</p>
            )}
          </section>

          <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
            <h2 className="text-headline-md">Guest List</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Users from other departments with visibility into this department's content.
            </p>
            <QueryState isLoading={membersQuery.isLoading} error={membersQuery.error}>
              <ul className="mt-4 flex flex-col gap-3">
                {guestMembers.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] hairline p-3"
                    >
                      <div className="min-w-0">
                        <div className="text-body-sm font-medium text-on-surface">
                          {m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : 'Unknown user'}
                        </div>
                        {isOwner && m.profiles?.email && (
                          <div className="break-all text-body-sm text-on-surface-variant">
                            {m.profiles.email}
                          </div>
                        )}
                        {/* Guests get their age shown too: the point of
                            putting it on the page is that everybody on a
                            team can see everybody, and a guest is on the
                            team. */}
                        {ageFrom(m.profiles?.dob) !== null && (
                          <div className="mt-0.5 text-body-sm text-on-surface-faint">
                            <Age dob={m.profiles?.dob} /> years old
                          </div>
                        )}
                      </div>
                      {canManage && (
                        <span className="flex shrink-0 items-center gap-3">
                          {moveButton(
                            m,
                            'tap inline-flex items-center text-body-sm text-on-surface-faint hover:text-accent-blue-soft hover:underline disabled:opacity-60',
                          )}
                          <button
                            onClick={() =>
                              ask({
                                title: `Remove ${
                                  m.profiles
                                    ? `${m.profiles.first_name} ${m.profiles.last_name}`
                                    : 'this person'
                                } from the team?`,
                                body: 'They keep their account and can be added back at any time.',
                                confirmLabel: 'Remove',
                                onConfirm: () => removeMember.mutate(m.id),
                              })
                            }
                            className="tap inline-flex items-center text-body-sm text-error hover:underline"
                          >
                            Remove
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                {rollGuests.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] hairline p-3">
                    {rollRow(g, 'guest')}
                  </li>
                ))}
                {guestMembers.length === 0 && rollGuests.length === 0 && (
                  <p className="text-body-sm text-on-surface-variant">No guests yet.</p>
                )}
              </ul>
            </QueryState>
          </section>
        </div>

        {/*
          Roles runs the width of the page rather than sitting in the
          column beside the roster.

          A role carries its whole checklist — two stages side by side,
          each item a row with a drag handle, its label and a Remove — and
          in a third of the page that left about ninety pixels for the
          label. "Get the Service Planner" came out broken across five
          lines, one syllable at a time. The roster is a table of short
          columns and the guest list is a name and an address, so those
          two are the pair that fits beside each other; this is the part of
          the page that needed the room.
        */}
        {id && (
          <div className="mt-6">
            <DepartmentRolesCard
              departmentId={id}
              canManage={can('team.roles', here)}
              canGroups={can('team.groups', here)}
              canChecklists={can('team.checklists', here)}
            />
          </div>
        )}

        <InviteDialog
          open={inviting}
          onClose={() => setInviting(false)}
          fixedDepartmentId={id}
        />

        {uploadOpen && deptQuery.data && (
          <HandbookUploadModal
            departmentId={id!}
            departmentName={deptQuery.data.name}
            currentPath={deptQuery.data.handbook_url}
            onClose={() => setUploadOpen(false)}
          />
        )}

        {confirmRemoveHandbook && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-handbook-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          >
            <div className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest hairline p-6 shadow-lg">
              <h2 id="remove-handbook-title" className="text-headline-md">
                Remove this handbook?
              </h2>
              <p className="mt-2 text-body-sm text-on-surface-variant">
                The team loses access to it straight away. You can upload a new one at any time.
              </p>
              {uploadError && (
                <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                  {uploadError}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmRemoveHandbook(false)}
                  className="rounded-full hairline px-4 py-2.5 text-body-sm font-medium text-on-surface hover:border-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => removeHandbook.mutate()}
                  disabled={removeHandbook.isPending}
                  className="rounded-full bg-error px-4 py-2.5 text-body-sm font-medium text-on-error hover:opacity-90 disabled:opacity-50"
                >
                  {removeHandbook.isPending ? 'Removing…' : 'Yes, remove'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {dialog}
    </QueryState>
  )
}
