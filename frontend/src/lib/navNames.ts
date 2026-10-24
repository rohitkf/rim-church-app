import { createContext, useContext } from 'react'
import { NAV_ITEMS } from './navItems'

/**
 * What the church calls each page (Settings › Menu, lib/navLayout).
 *
 * The shell reads the menu's arrangement once and hands the names down
 * here, so the page's own heading and the search box say what the menu
 * says without each fetching it again. Outside the shell — a test, the
 * sign-in pages — there are no names, and every page keeps its own.
 */
export const NavNamesContext = createContext<Record<string, string>>({})

/** The church's names, path to name: only the pages it has renamed. */
export function useNavNames(): Record<string, string> {
  return useContext(NavNamesContext)
}

/** A page's name as the app calls it, before any renaming. */
export function defaultNavLabel(path: string): string | undefined {
  return NAV_ITEMS.find((i) => i.to === path)?.label
}
