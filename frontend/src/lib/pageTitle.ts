import { useEffect } from 'react'
import { CHURCH_NAME } from './churchName'

/*
 * What the browser's tab says.
 *
 * Every page had the same title, the church's name, so three tabs of the
 * app could not be told apart, the browser's history was one line said
 * twenty times, and a screen reader announced the same words on every
 * page it arrived at. Each page now names itself first and the church
 * after, the way the public pages already did (PublicShell).
 */

/** "Team Rota · Rehoboth International Ministries". */
export const titleFor = (page: string | null | undefined) => {
  const name = page?.trim()
  return name ? `${name} · ${CHURCH_NAME}` : CHURCH_NAME
}

/**
 * Names the tab after this page for as long as it is on screen, and gives
 * the church's name back as it leaves, so a page that names nothing never
 * keeps the last one's title.
 */
export function usePageTitle(page: string | null | undefined): void {
  useEffect(() => {
    document.title = titleFor(page)
    return () => {
      document.title = CHURCH_NAME
    }
  }, [page])
}
