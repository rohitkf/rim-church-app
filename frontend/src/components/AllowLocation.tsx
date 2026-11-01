import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { askForLocation, refusalWords, stepsForThisPhone, type AskOutcome } from '../lib/locationHelp'
import { ActionButton } from './Surface'

/**
 * "Allow location", and what happened when it was pressed (lib/locationHelp).
 *
 * The answer stays on screen: a phone that refuses without asking does so
 * in milliseconds, and a button that only flashed "Finding you…" told
 * nobody anything. Under a refusal come the steps for this phone and this
 * browser, and a link to the page with every phone's.
 */
export function AllowLocation({
  onAllowed,
  showSteps = 'after-refusal',
  size = 'sm',
  autoAsk = false,
  linkToSteps = true,
  className = '',
}: {
  /** Called once a position came back: whatever is showing the dot can read it again. */
  onAllowed?: () => void
  /** The steps for this phone: always, or only once it has refused. */
  showSteps?: 'always' | 'after-refusal'
  size?: 'sm' | 'md'
  /** Ask once as soon as it is shown — where a tap brought the person here to do just that. */
  autoAsk?: boolean
  /** The link to every phone's steps — not on the page that is those steps. */
  linkToSteps?: boolean
  className?: string
}) {
  const [asking, setAsking] = useState(false)
  const [outcome, setOutcome] = useState<AskOutcome | null>(null)
  const steps = stepsForThisPhone()
  const words = outcome ? refusalWords(outcome) : null
  const stepsShown = showSteps === 'always' || (outcome !== null && outcome.result !== 'granted')

  const ask = async () => {
    setAsking(true)
    const next = await askForLocation()
    setOutcome(next)
    setAsking(false)
    if (next.result === 'granted') onAllowed?.()
  }

  const askedOnArrival = useRef(false)
  useEffect(() => {
    if (!autoAsk || askedOnArrival.current) return
    askedOnArrival.current = true
    void ask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAsk])

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ActionButton size={size} onClick={ask} disabled={asking}>
          {asking ? 'Asking your phone…' : outcome && outcome.result !== 'granted' ? 'Try again' : 'Allow location'}
        </ActionButton>
        {linkToSteps && (
          <Link to="/location" className="tap text-label-md text-accent-blue-soft hover:underline">
            Steps for every phone
          </Link>
        )}
      </div>
      {outcome?.result === 'granted' && (
        <p role="status" className="mt-2 text-body-sm text-accent-green-soft">
          Location is allowed.
        </p>
      )}
      {words && (
        <p role="alert" className="mt-2 text-body-sm text-on-surface">
          {words}
        </p>
      )}
      {stepsShown && (
        <div className="mt-2">
          <p className="text-label-md font-medium text-on-surface-variant">{steps.title}</p>
          <ol aria-label={`How to allow location: ${steps.title}`} className="mt-1 list-decimal pl-5 text-label-md text-on-surface-variant">
            {steps.steps.map((s) => (
              <li key={s} className="py-0.5">
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
