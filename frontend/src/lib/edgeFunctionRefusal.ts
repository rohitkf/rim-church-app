/**
 * A refusal an edge function wrote for people — "That address already has
 * an account." — as opposed to something breaking.
 *
 * Its own type so `humanError` passes the words through untouched, the way
 * it does for our database functions' own messages, rather than swapping
 * them for a vaguer fallback.
 */
export class EdgeFunctionRefusal extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'EdgeFunctionRefusal'
    this.status = status
  }
}
