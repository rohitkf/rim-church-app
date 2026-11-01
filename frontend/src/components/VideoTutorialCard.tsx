import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { SETTINGS_KEY, useAppSettings } from '../lib/appSettings'
import { useErrorText } from '../lib/useErrorText'
import { safeVideoLink, saveVideoLink } from '../lib/videoTutorial'
import { showToast } from '../lib/toast'
import { ActionButton, SectionTile, inputClasses } from './Surface'

/**
 * Settings › Video Tutorial (0233): the link behind "Video tutorial" in
 * everybody's account menu. The Owner's alone; with no link, the menu
 * item is not there.
 */
export function VideoTutorialCard() {
  const { isSuperAdmin } = useAuth()
  const settings = useAppSettings()
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const saved = settings.video_tutorial_url ?? ''
  // Untouched, the box shows what is saved; typing makes it a draft.
  const [typed, setTyped] = useState<string | null>(null)
  const draft = typed ?? saved
  const setDraft = setTyped

  const save = useMutation({
    mutationFn: (link: string | null) => saveVideoLink(link),
    onSuccess: (_d, link) => {
      setTyped(null)
      showToast(link ? 'Video tutorial link saved' : 'Video tutorial link removed')
      return queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    },
  })

  if (!isSuperAdmin) return null
  const trimmed = draft.trim()
  const valid = trimmed === '' || safeVideoLink(trimmed) !== null
  const changed = trimmed !== saved

  return (
    <SectionTile
      title="Video tutorial"
      hint="A link to a video that walks people through the app — YouTube, Google Drive, anything that opens in a browser. It shows as Video tutorial in everybody’s account menu, and is not there at all without a link."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid && changed) save.mutate(trimmed || null)
        }}
      >
        <input
          type="url"
          inputMode="url"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://"
          aria-label="Video tutorial link"
          className={inputClasses}
        />
        {!valid && <p className="text-body-sm text-accent-red-soft">That needs to be a link starting https://</p>}
        {save.error && (
          <p role="alert" className="text-body-sm text-accent-red-soft">
            {errorText(save.error, 'Could not save the link.')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <ActionButton type="submit" size="sm" disabled={!valid || !changed || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </ActionButton>
          {saved && (
            <ActionButton tone="quiet" size="sm" onClick={() => save.mutate(null)} disabled={save.isPending}>
              Remove the link
            </ActionButton>
          )}
          {saved && (
            <a href={safeVideoLink(saved) ?? undefined} target="_blank" rel="noopener noreferrer" className="tap self-center text-label-md text-accent-blue-soft hover:underline">
              Open it
            </a>
          )}
        </div>
      </form>
    </SectionTile>
  )
}
