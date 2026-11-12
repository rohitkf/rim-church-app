import { type FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionButton, Field } from './Surface'
import { Select } from './Select'
import { useConfirmAction } from './ConfirmAction'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import {
  EVERY_SERVICE,
  ROLE_PERMANENTS_KEY,
  atWords,
  changedWords,
  endedWords,
  fetchServiceKinds,
  fetchTeamPeople,
  madeWords,
  permanentLine,
  personName,
  removeRolePermanent,
  serviceKinds,
  setRolePermanent,
  type RolePermanent,
} from '../lib/rolePermanents'

/**
 * Who holds a role as a matter of course, under its name on the team's
 * page: "Permanent: Joel Skaria · Ama Owusu (English Service)". Read by
 * everybody who can see the roles; nothing when nobody is.
 */
export function RolePermanentsLine({ people }: { people: RolePermanent[] }) {
  if (people.length === 0) return null
  return (
    <p className="mt-0.5 break-words text-label-sm text-on-surface-variant">
      <span className="text-on-surface-faint">Permanent: </span>
      {permanentLine(people)}
    </p>
  )
}

/**
 * Choosing a role's permanent people (0282).
 *
 * The Owner asked for a role to carry "a permanent person(s)", so that "in
 * the rota, that role appears by default with that person's name instead
 * of having to manually always choose role and the person every time".
 *
 * Making somebody permanent puts them on the rota of every service still
 * to come, and of each new one as it is made. It is a default: the Team
 * Rota still takes them off one service, and that service stays without
 * them. What it did is said as it is done — how many services they were
 * put on — because it changes a page the person is not looking at.
 */
export function RolePermanentsPanel({
  roleId,
  roleName,
  departmentId,
  people,
  canEdit,
}: {
  roleId: string
  roleName: string
  departmentId: string
  /** This role's permanent people. */
  people: RolePermanent[]
  /** May choose them (whoever arranges this team's rota; for the Coordinator, a Head). */
  canEdit: boolean
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const { ask, dialog } = useConfirmAction()
  const [person, setPerson] = useState('')
  const [at, setAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const teamQuery = useQuery({
    queryKey: ['team-people', departmentId],
    queryFn: () => fetchTeamPeople(departmentId),
    enabled: canEdit,
  })
  const kindsQuery = useQuery({ queryKey: ['service-kinds'], queryFn: fetchServiceKinds, enabled: canEdit })
  // A kind somebody already has stays on offer, though no such service is planned just now.
  const kinds = serviceKinds(kindsQuery.data ?? [], people.map((p) => p.service_type))
  const atOptions = [{ value: '', label: EVERY_SERVICE }, ...kinds.map((k) => ({ value: k, label: k }))]
  const taken = new Set(people.map((p) => p.user_id))
  const free = (teamQuery.data ?? []).filter((m) => !taken.has(m.id))

  // The rota changed with it: every list that reads the rota reads again.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ROLE_PERMANENTS_KEY })
    queryClient.invalidateQueries({ queryKey: ['rota'] })
    queryClient.invalidateQueries({ queryKey: ['rota-assignments'] })
  }

  const make = useMutation({
    mutationFn: (v: { userId: string; name: string; at: string | null }) => setRolePermanent(roleId, v.userId, v.at),
    onSuccess: (added, v) => {
      setPerson('')
      setError(null)
      showToast(madeWords(v.name, roleName, added), 'success', 5000)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not make them permanent.')),
  })
  const change = useMutation({
    mutationFn: (v: { userId: string; name: string; at: string | null }) => setRolePermanent(roleId, v.userId, v.at),
    onSuccess: (added, v) => {
      setError(null)
      showToast(changedWords(v.name, v.at, added), 'success', 5000)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change that.')),
  })
  const end = useMutation({
    mutationFn: (v: { userId: string; name: string }) => removeRolePermanent(roleId, v.userId),
    onSuccess: (freed, v) => {
      setError(null)
      showToast(endedWords(v.name, roleName, freed), 'success', 5000)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not remove them.')),
  })
  const busy = make.isPending || change.isPending || end.isPending

  function add(e: FormEvent) {
    e.preventDefault()
    const who = free.find((m) => m.id === person)
    if (!who || busy) return
    make.mutate({ userId: who.id, name: who.name, at: at || null })
  }

  return (
    <div className="mt-3 w-full rounded-[var(--radius-card)] bg-surface-lowest/70 p-3 hairline sm:p-4">
      <h4 className="font-mono text-label-sm uppercase tracking-[0.14em] text-on-surface">Permanent on {roleName}</h4>
      <p className="mt-1 max-w-prose text-label-sm text-on-surface-faint">
        On the rota of every service to come, without being chosen each time. Take somebody off one service on the Team
        Rota and they stay off that one; say “can’t serve” and they come off as anybody would.
      </p>

      {people.length === 0 ? (
        <p className="mt-3 text-body-sm text-on-surface-variant">Nobody is permanent on this role.</p>
      ) : (
        <ul aria-label={`Permanent on ${roleName}`} className="mt-3 flex flex-col gap-2">
          {people.map((p) => {
            const name = personName(p.person)
            return (
              <li key={p.id} aria-label={name} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-chip)] bg-raised/50 px-3 py-2">
                <span className="min-w-0 flex-1 basis-40 break-words text-body-sm font-medium text-on-surface">{name}</span>
                {canEdit ? (
                  <>
                    <span className="w-full min-w-40 sm:w-56">
                      <Select
                        aria-label={`Services ${name} is permanent at`}
                        value={p.service_type ?? ''}
                        onChange={(next) => {
                          if ((next || null) !== (p.service_type ?? null)) change.mutate({ userId: p.user_id, name, at: next || null })
                        }}
                        options={atOptions}
                        disabled={busy}
                      />
                    </span>
                    <ActionButton
                      size="sm"
                      tone="danger-quiet"
                      disabled={busy}
                      onClick={() =>
                        ask({
                          title: `Stop ${name} being permanent on ${roleName}?`,
                          body: 'They come off the services still to come that this put them on. Services already held, and any they were put on by hand, stay as they are.',
                          onConfirm: () => end.mutate({ userId: p.user_id, name }),
                        })
                      }
                    >
                      Remove
                    </ActionButton>
                  </>
                ) : (
                  <span className="text-body-sm text-on-surface-variant">{atWords(p.service_type)}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canEdit && (
        <form onSubmit={add} aria-label={`Make somebody permanent on ${roleName}`} className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Person" className="min-w-48 flex-1">
            <Select
              aria-label={`Person to make permanent on ${roleName}`}
              value={person}
              onChange={setPerson}
              placeholder={teamQuery.isLoading ? 'Loading…' : free.length === 0 ? 'Everybody on the team already is' : 'Choose somebody on the team'}
              options={free.map((m) => ({ value: m.id, label: m.name }))}
              disabled={free.length === 0}
            />
          </Field>
          <Field label="At" className="min-w-40 flex-1 sm:flex-none sm:basis-56">
            <Select aria-label={`Which services, on ${roleName}`} value={at} onChange={setAt} options={atOptions} />
          </Field>
          <ActionButton type="submit" disabled={!person || busy}>
            {make.isPending ? 'Adding…' : 'Make permanent'}
          </ActionButton>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}
      {dialog}
    </div>
  )
}
