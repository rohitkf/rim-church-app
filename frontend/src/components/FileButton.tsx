import { useRef } from 'react'

/**
 * Choosing a file, in the app's own button.
 *
 * `<input type="file">` draws the browser's "Choose file · No file chosen"
 * strip, in the system font and a different shape on every phone. The
 * picker the phone opens is the phone's and has to be — this only replaces
 * the part on our page: a pill that says what to press, and the name of
 * what was chosen.
 */
export function FileButton({
  accept,
  onFile,
  label,
  chosen,
  'aria-label': ariaLabel,
  disabled,
}: {
  accept: string
  onFile: (file: File | null) => void
  /** What the button says: "Upload a picture". */
  label: string
  /** The chosen file's name, when the caller keeps one. */
  chosen?: string | null
  'aria-label'?: string
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="tap inline-flex items-center gap-2 rounded-full bg-raised-strong px-4 py-2 text-label-md text-on-surface hairline hover:opacity-90 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
        </svg>
        {label}
      </button>
      {chosen && <span className="min-w-0 truncate text-label-md text-on-surface-variant">{chosen}</span>}
      <input
        ref={input}
        type="file"
        accept={accept}
        aria-label={ariaLabel ?? label}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null
          // Cleared, so choosing the same file again still counts as a choice.
          e.target.value = ''
          onFile(file)
        }}
      />
    </span>
  )
}
