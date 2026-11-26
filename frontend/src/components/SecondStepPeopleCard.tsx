import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { PEOPLE_NAMES_KEY, fetchPeopleNames, nameOf } from '../lib/families'
import { SECOND_STEP_PEOPLE_KEY, clearSecondStep, fetchSecondStepPeople } from '../lib/secondStep'
import { showToast } from '../lib/toast'
import { useErrorText } from '../lib/useErrorText'
import { useConfirmAction } from './ConfirmAction'
import { QueryState } from './QueryState'
import { ActionButton, Row, SectionTile } from './Surface'

/**
 * Settings › Your account, for the Owner: who has a second step, and
 * clearing it for somebody who has lost the phone theirs is on (0334).
 *
 * Clearing is the only thing here. It does not sign anybody in or change
 * a password: the person signs in with the password they already have,
 * and sets a new authenticator up if they want one. The Owner's alone,
 * and the database agrees; in a preview it is not drawn, because a
 * previewed Admin is not the Owner.
 */
export function SecondStepPeopleCard() {
  const { isSuperAdmin, session } = useAuth()
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const people = useQuery({ queryKey: SECOND_STEP_PEOPLE_KEY, queryFn: fetchSecondStepPeople, enabled: isSuperAdmin })
  const names = useQuery({ queryKey: PEOPLE_NAMES_KEY, queryFn: fetchPeopleNames, enabled: isSuperAdmin })
  const clear = useMutation({
    mutationFn: clearSecondStep,
    onSuccess: () => {
      showToast('Second step cleared')
      return queryClient.invalidateQueries({ queryKey: SECOND_STEP_PEOPLE_KEY })
    },
  })

  if (!isSuperAdmin) return null

  const byId = new Map((names.data ?? []).map((p) => [p.id, nameOf(p)]))
  const rows = (people.data ?? [])
    // The Owner's own is turned off in the card above, with their own code.
    .filter((id) => id !== session?.user.id)
    .map((id) => ({ id, name: byId.get(id) || 'Somebody with no name yet' }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <SectionTile
      title="Other people’s second step"
      hint="Who has set one up. Clear it for somebody who has lost their phone: their password alone signs them in again."
    >
      <QueryState isLoading={people.isLoading || names.isLoading} error={people.error ?? names.error}>
        {rows.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">Nobody else has set one up.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((person) => (
              <Row as="li" key={person.id}>
                <span className="min-w-0 flex-1 text-body-md text-on-surface [overflow-wrap:anywhere]">{person.name}</span>
                <ActionButton
                  tone="quiet"
                  size="sm"
                  disabled={clear.isPending}
                  aria-label={`Clear ${person.name}’s second step`}
                  onClick={() =>
                    ask({
                      title: `Clear ${person.name}’s second step?`,
                      body: 'Only do this when they have asked you themselves. Their password alone will sign them in until they set a new one up.',
                      confirmLabel: 'Clear it',
                      onConfirm: () => clear.mutate(person.id),
                    })
                  }
                >
                  Clear
                </ActionButton>
              </Row>
            ))}
          </ul>
        )}
        {clear.error && (
          <p role="alert" className="mt-3 text-body-sm text-accent-red-soft">
            {errorText(clear.error, 'Could not clear it.')}
          </p>
        )}
      </QueryState>
      {dialog}
    </SectionTile>
  )
}
