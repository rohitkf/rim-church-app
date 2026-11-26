import { useState } from 'react'
import { searchList, tokensOf, type Field } from './searchMatch'

/**
 * What the box over a page's list knows (components/ListSearch draws it):
 * what is typed, and the list narrowed by it, best match first.
 */
export interface ListSearchState<T> {
  typed: string
  setTyped: (next: string) => void
  /** Whether anything is being looked for. A page that groups its list may want to stop grouping while it is. */
  searching: boolean
  shown: T[]
  total: number
}

export function useListSearch<T>(items: readonly T[] | null | undefined, fields: (item: T) => Field[]): ListSearchState<T> {
  const [typed, setTyped] = useState('')
  const all = items ?? []
  const searching = tokensOf(typed).length > 0
  return { typed, setTyped, searching, shown: searching ? searchList(typed, all, fields) : [...all], total: all.length }
}

