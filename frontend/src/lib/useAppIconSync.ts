import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { BRANDING_BUCKET } from './appLogo'
import { fetchAppSettings, SETTINGS_KEY } from './appSettings'
import { usePermissions } from './usePermissions'
import { ICON_FOLDER, applyPageIcons, listIconSets, logoIdOf, logoOfSet, newestSet, syncAppIcons } from './appIcon'

/** The icon set in the bucket, as Settings › App Logo shows it. */
export const APP_ICON_KEY = ['app-icon-set']

/** One at a time in a tab: two would each make a set from the same logo. */
let running: Promise<unknown> | null = null

/**
 * Keeps the installed app's icon the same picture as the App Logo.
 *
 * Runs in the app shell for whoever may change the logo (the Owner, out
 * of the box), because they are who the bucket lets write. It compares the
 * logo in the settings with the logo the newest icon set was made from,
 * and makes a new set, or takes the sets down, when they differ. So it
 * follows a logo changed on this page, one changed on another device, and
 * the logo that was already there before any of this existed, with nobody
 * having to press anything.
 *
 * It waits for the settings to have really loaded. While they load, and
 * when they fail to, the app stands on defaults that say "no logo", and
 * acting on that would take a church's icon down because of a slow
 * connection.
 */
export function useAppIconSync(): void {
  const may = usePermissions().can('settings.logo')
  // The same key and reader as useAppSettings, for the one thing that
  // hook does not say: whether what it holds came from the database.
  const settings = useQuery({ queryKey: SETTINGS_KEY, queryFn: fetchAppSettings, staleTime: 5 * 60_000 })
  const logoPath = settings.isSuccess ? settings.data.logo_url : undefined
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!may || logoPath === undefined) return
    let stale = false
    const turn = (running ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => (stale ? null : syncAppIcons(logoPath)))
      .then((result) => {
        if (!result || stale) return
        if (result.changed) queryClient.invalidateQueries({ queryKey: APP_ICON_KEY })
        // This page's own tab and Home Screen icon follow at once; the
        // manifest the next visitor reads follows within minutes.
        applyPageIcons(result.set)
      })
      // Quiet: Settings › App Logo says where the icon stands and can try again.
      .catch(() => undefined)
    running = turn
    return () => {
      stale = true
    }
  }, [may, logoPath, queryClient])
}

/** Where the icon stands against the logo, for Settings › App Logo. */
export interface AppIconStatus {
  /** The newest set, if there is one. */
  set: string | null
  /** A link to its picture that works for an hour, to show it. */
  preview: string | null
}

async function readStatus(): Promise<AppIconStatus> {
  const set = newestSet(await listIconSets())
  if (!set) return { set: null, preview: null }
  const { data } = await supabase.storage.from(BRANDING_BUCKET).createSignedUrl(`${ICON_FOLDER}/${set}/icon-192.png`, 3600)
  return { set, preview: data?.signedUrl ?? null }
}

/** The stored icon set, and whether it was made from the logo in use. */
export function useAppIconStatus(logoPath: string | null) {
  const query = useQuery({ queryKey: APP_ICON_KEY, queryFn: readStatus, staleTime: 60_000 })
  const set = query.data?.set ?? null
  const logoId = logoIdOf(logoPath)
  return {
    loaded: query.isSuccess,
    preview: query.data?.preview ?? null,
    /** The icon is this logo. */
    current: !!set && !!logoId && logoOfSet(set) === logoId,
    /** A set exists (for this logo or an earlier one). */
    hasSet: !!set,
  }
}
