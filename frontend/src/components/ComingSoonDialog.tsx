import { useEffect, useState } from 'react'
import { Overlay } from './Surface'
import { Confetti } from './Confetti'
import { SparklesIcon } from './icons'

/**
 * What Ask says until Ask can answer.
 *
 * The assistant is built but not deployed, and the dock carried it as a
 * greyed-out label — which reads as a broken button rather than as a thing
 * on its way. A button that says "coming soon" when pressed is honest
 * about the same fact and answers the person who pressed it.
 *
 * The confetti is drawn rather than fetched — see Confetti, which the
 * welcome uses as well.
 */

export function ComingSoonDialog({ onClose }: { onClose: () => void }) {
  // The card arrives a beat after the confetti starts, so the shower reads
  // as the thing being celebrated rather than as decoration behind it.
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setLanded(true), 20)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <Overlay onDismiss={onClose} label="Ask is coming soon">
      <Confetti />

      <div
        className={`relative w-full max-w-sm rounded-[var(--radius-shell)] bg-surface-lowest p-8 text-center shadow-[var(--shadow-lifted)] ring-1 ring-black/10 transition-all duration-500 ease-[var(--ease-glide)] dark:ring-white/12 ${
          landed ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-accent-indigo)_22%,transparent)] text-accent-indigo-soft">
          <SparklesIcon width={22} height={22} />
        </span>
        <h2 className="mt-4 text-headline-md">Coming soon !!!</h2>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          Ask will answer questions about the rota, the checklists and who is on this Sunday. It is
          built — it just is not switched on here yet.
        </p>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="mt-6 rounded-full bg-primary px-5 py-2.5 text-body-sm font-medium text-on-primary shadow-[var(--shadow-ambient)] transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
        >
          Can’t wait
        </button>
      </div>
    </Overlay>
  )
}
