/**
 * Yes or No, one tap — the same segmented control the availability page
 * answers "Can you serve?" with. Yes fills green, No fills red, and with
 * nothing chosen neither is filled.
 */
export function YesNoSwitch({
  value,
  onChange,
  label,
  disabled,
}: {
  value: boolean | null
  onChange: (next: boolean) => void
  /** Read out as the group's name: "Has a valid DBS check". */
  label: string
  disabled?: boolean
}) {
  const options = [
    { on: true, text: 'Yes', active: 'bg-accent-green text-accent-green-ink' },
    { on: false, text: 'No', active: 'bg-accent-red text-white' },
  ]
  return (
    <div role="group" aria-label={label} className="flex max-w-xs gap-2 rounded-full bg-inset p-1 hairline">
      {options.map((o) => {
        const pressed = value === o.on
        return (
          <button
            key={o.text}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => onChange(o.on)}
            className={`flex h-10 flex-1 items-center justify-center rounded-full text-body-sm transition-all duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-60 ${
              pressed ? `font-semibold ${o.active}` : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {o.text}
          </button>
        )
      })}
    </div>
  )
}
