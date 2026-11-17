import type { FallbackResult } from './signInFallback'

/**
 * The second road, tried alongside the first — but only while the first
 * has still not answered, and only ever as a winner.
 *
 * It used to set off after its wait whatever had happened meanwhile. So
 * every sign-in was made twice: a good one left a second session behind
 * six seconds later and moved the rest of the visit onto the slower road,
 * and a refused one was refused again, which is how one person's thirty-odd
 * tries at a forgotten password reached the sign-in service as sixty-seven
 * (November 2026). `stillWaiting` is asked when the wait is over, and an
 * answer of no — the direct road said yes, said no, or failed outright,
 * which the caller handles itself — means there is nothing to hedge.
 *
 * If the attempt fails this stays pending for ever, so it can be raced
 * against the direct attempt without a failure here cutting that one short:
 * whichever road actually works is the one that answers.
 */
export function hedge(
  afterMs: number,
  stillWaiting: () => boolean,
  attempt: () => Promise<FallbackResult>,
): Promise<'signed-in'> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!stillWaiting()) return
      void attempt().then(
        (result) => {
          if (result.ok) resolve('signed-in')
        },
        () => {},
      )
    }, afterMs)
  })
}

/** A request, and whether it has still said nothing: settled either way is an answer. */
export function watch<T>(request: PromiseLike<T>): { answer: Promise<T>; silent: () => boolean } {
  let silent = true
  const answer = Promise.resolve(request).finally(() => {
    silent = false
  })
  return { answer, silent: () => silent }
}
