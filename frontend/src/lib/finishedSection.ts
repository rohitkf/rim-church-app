/**
 * What has already happened, out of the way of what hasn't.
 *
 * Every page that lists services had its own answer to a service that is
 * over. The planner index filed them under a collapsed "Finished" heading
 * at the foot of the page; the rota and the checklists pushed them to the
 * bottom of the same list but left them open; availability kept them at
 * the top, on their own day, because that is where the eye expects a
 * Sunday that has been and gone.
 *
 * Three answers to one question is two too many. A finished service is a
 * record — nothing on it can be answered, ticked, chased or assigned — so
 * on every page it now folds away into one section at the end, and what
 * is above it is only what somebody can still do something about.
 *
 * The split is a function rather than a sort so the two halves can be
 * drawn as two things. A sort puts the record last; it does not stop the
 * record being the loudest thing on a Sunday evening.
 */

export interface FinishedSplit<T> {
  /** Still ahead, still answerable — the page proper. */
  live: T[]
  /** Over. A record, kept and folded. */
  finished: T[]
}

/**
 * Split a list of services into what is still live and what is over,
 * each half keeping the order it came in.
 */
export function splitFinished<T>(
  services: T[],
  isFinished: (service: T) => boolean,
): FinishedSplit<T> {
  const live: T[] = []
  const finished: T[] = []
  for (const service of services) (isFinished(service) ? finished : live).push(service)
  return { live, finished }
}
