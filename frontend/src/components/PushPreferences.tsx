import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import {
  PUSH_DEFAULTS,
  fetchPushPreferences,
  pushPreferencesKey,
  savePushPreferences,
  type PushPreferences as Prefs,
} from '../lib/pushPreferences'
import { useErrorText } from '../lib/useErrorText'
import { Switch } from './SettingRows'

const ROWS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: 'board', label: 'Message board posts', hint: 'Who posted and what they said, the newest replacing the last.' },
  { key: 'team_chat', label: 'Team chat', hint: 'A message in one of your teams’ chats. @mentions and alerts always come through.' },
]

/**
 * Which talk reaches this person's phone (0185). Everything aimed at them
 * alone always does; the board and team chat can be quietened, which
 * leaves the bell as it was. Saved on the account, so every device follows.
 */
export function PushPreferences() {
  const { session } = useAuth()
  const userId = session?.user.id
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const key = pushPreferencesKey(userId)
  const query = useQuery({ queryKey: key, queryFn: () => fetchPushPreferences(userId!), enabled: !!userId })
  const prefs = query.data ?? PUSH_DEFAULTS

  const save = useMutation({
    mutationFn: (next: Prefs) => savePushPreferences(userId!, next),
    onMutate: (next) => {
      const was = queryClient.getQueryData<Prefs>(key)
      queryClient.setQueryData(key, next)
      return { was }
    },
    onError: (_err, _next, context) => queryClient.setQueryData(key, context?.was ?? PUSH_DEFAULTS),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  if (!userId) return null
  return (
    <ul aria-label="What reaches your phone" className="flex flex-col border-t border-border-subtle">
      {ROWS.map((row) => (
        <li key={row.key} className="flex items-center gap-3 px-5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-body-sm font-medium text-on-surface">{row.label}</span>
            <span className="block text-label-md text-on-surface-variant">{row.hint}</span>
          </span>
          <Switch
            label={row.label}
            checked={prefs[row.key]}
            onChange={(on) => save.mutate({ ...prefs, [row.key]: on })}
          />
        </li>
      ))}
      {save.isError && (
        <li role="alert" className="px-5 pb-3 text-label-md text-error">
          {errorText(save.error, 'Could not save that.')}
        </li>
      )}
    </ul>
  )
}
