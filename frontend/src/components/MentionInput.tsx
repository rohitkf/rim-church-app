import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import {
  activeMentionQuery,
  applyMention,
  fullName,
  matchPeople,
  type MentionablePerson,
} from '../lib/mentions'

/**
 * A message box that knows who is in the room.
 *
 * Typing @ opens a short list of people; arrow keys move through it and
 * Enter or Tab takes one. Enter with the list closed does what Enter
 * normally does, so the keyboard never feels captured — the commonest
 * complaint about a box like this is that it eats the key you meant for
 * something else.
 */
export function MentionInput({
  value,
  onChange,
  people,
  placeholder,
  rows = 3,
  className = '',
  onSubmit,
  disabled,
}: {
  value: string
  onChange: (next: string) => void
  people: MentionablePerson[]
  placeholder?: string
  rows?: number
  className?: string
  /** Called on Enter when the mention list isn't open. */
  onSubmit?: () => void
  disabled?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [open, setOpen] = useState(false)
  const [matches, setMatches] = useState<MentionablePerson[]>([])
  const [highlighted, setHighlighted] = useState(0)

  function refresh(text: string, caret: number) {
    const active = activeMentionQuery(text, caret)
    if (!active) {
      setOpen(false)
      return
    }
    const found = matchPeople(active.query, people)
    setMatches(found)
    setHighlighted(0)
    setOpen(found.length > 0)
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value)
    refresh(event.target.value, event.target.selectionStart ?? event.target.value.length)
  }

  function choose(person: MentionablePerson) {
    const node = ref.current
    const caret = node?.selectionStart ?? value.length
    const next = applyMention(value, caret, person)
    onChange(next.text)
    setOpen(false)
    // Put the caret back where the name ended, once React has drawn it.
    requestAnimationFrame(() => {
      if (!node) return
      node.focus()
      node.setSelectionRange(next.caret, next.caret)
    })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && matches.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlighted((i) => (i + 1) % matches.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlighted((i) => (i - 1 + matches.length) % matches.length)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        choose(matches[highlighted])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
    }

    if (event.key === 'Enter' && !event.shiftKey && onSubmit) {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onClick={(e) => refresh(value, e.currentTarget.selectionStart ?? 0)}
        className={className}
      />

      {open && (
        <ul
          role="listbox"
          aria-label="People you can mention"
          className="absolute bottom-full z-20 mb-2 max-h-56 w-full max-w-xs overflow-y-auto rounded-[var(--radius-card)] bg-surface-low p-1.5 shadow-[var(--shadow-lifted)] hairline-strong"
        >
          {matches.map((person, index) => (
            <li key={person.id}>
              <button
                type="button"
                // The textarea's blur must not beat the click.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(person)}
                className={`flex w-full items-center gap-2.5 rounded-[var(--radius-row)] px-3 py-2 text-left text-body-sm ${
                  index === highlighted ? 'bg-raised-strong text-on-surface' : 'text-on-surface-variant'
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised-strong font-mono text-label-sm">
                  {person.first_name.slice(0, 1)}
                  {person.last_name.slice(0, 1)}
                </span>
                {fullName(person)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
