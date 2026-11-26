import { useId, useRef } from 'react'
import { CloseIcon, SearchIcon } from './icons'

/**
 * The box on a page that narrows the page: a magnifying glass, what was
 * typed, and a way to take it back.
 *
 * `type="search"` so a phone's keyboard offers Search and a screen reader
 * says what it is; the browser's own clear button is switched off in
 * favour of one that looks the same everywhere and is big enough to hit.
 * `status` is said under the box, and aloud: how many were found.
 */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  status,
  className = '',
}: {
  value: string
  onChange: (next: string) => void
  /** What the box is for. Read out; not drawn, because the placeholder and the glass say it to the eye. */
  label: string
  placeholder: string
  status?: string | null
  className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const statusId = useId()
  return (
    <div className={className}>
      <label className="flex items-center gap-2.5 rounded-[var(--radius-chip)] bg-raised px-4 hairline transition-shadow duration-200 ease-[var(--ease-glide)] focus-within:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]">
        <SearchIcon width={18} height={18} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
        <span className="sr-only">{label}</span>
        <input
          ref={input}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-describedby={status ? statusId : undefined}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-3 text-body-md text-on-surface outline-none placeholder:text-on-surface-faint [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear the search"
            onClick={() => {
              onChange('')
              input.current?.focus()
            }}
            className="tap -mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-on-surface-variant hover:text-on-surface"
          >
            <CloseIcon width={16} height={16} aria-hidden="true" />
          </button>
        )}
      </label>
      {status && (
        <p id={statusId} role="status" className="mt-2 px-1 font-mono text-label-sm text-on-surface-faint">
          {status}
        </p>
      )}
    </div>
  )
}
