import { useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { BRANDING_BUCKET } from '../lib/appLogo'
import { CHURCH_NAME } from '../lib/churchName'

/**
 * The frame round a page anybody opens from a link, signed in or not
 * (0244): the church's mark and name at the top, the page, and nothing of
 * the app's own menus — somebody registering for a conference is not a
 * member looking for the rota.
 *
 * The logo's path comes with the page's own data (the public functions
 * carry it), signed here for an hour: the bucket is private, and since
 * 0244 anybody may read it.
 */
export function PublicShell({ title, logoPath, children }: { title: string; logoPath: string | null; children: ReactNode }) {
  useEffect(() => {
    const before = document.title
    document.title = `${title} · ${CHURCH_NAME}`
    return () => {
      document.title = before
    }
  }, [title])

  const logo = useQuery({
    queryKey: ['public-logo', logoPath],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BRANDING_BUCKET).createSignedUrl(logoPath!, 3600)
      if (error) return null
      return data.signedUrl
    },
    enabled: !!logoPath,
    staleTime: 30 * 60_000,
  })

  return (
    <div className="flex min-h-[100svh] flex-col bg-background text-on-background">
      <header className="flex items-center gap-3 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6">
        {logo.data && <img src={logo.data} alt="" aria-hidden="true" className="h-9 w-auto max-w-[9rem] object-contain" />}
        <span className="text-label-md font-medium text-on-surface-variant">{CHURCH_NAME}</span>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-2 sm:px-6">{children}</main>
      <footer className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center font-mono text-label-sm text-on-surface-faint">
        {CHURCH_NAME}
      </footer>
    </div>
  )
}

/** A page that has nothing to show: the link is wrong, or the event has gone. */
export function PublicNothing({ title, body }: { title: string; body: string }) {
  return (
    <PublicShell title={title} logoPath={null}>
      <div className="mt-10 rounded-[var(--radius-card)] bg-surface-lowest p-6 text-center hairline">
        <h1 className="text-headline-md text-on-surface">{title}</h1>
        <p className="mt-2 text-body-md text-on-surface-variant">{body}</p>
      </div>
    </PublicShell>
  )
}
