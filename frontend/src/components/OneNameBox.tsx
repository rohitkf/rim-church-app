/**
 * "I only have one name" (0323).
 *
 * A last name was compulsory, and not everybody has one. Somebody with a
 * single name had to make a second up to get past the form. This is the
 * way to say so instead: ticked, the last name is empty and is no longer
 * asked for; unticked and left blank, it is still a blank to fill in. A
 * box to tick rather than a last name anybody may skip, so a forgotten
 * one is still caught.
 *
 * The same box under the names on sign-up, the joining form and the
 * profile, so the three cannot word it three ways. Whoever uses it
 * empties and locks the last name box when it is ticked.
 */
export function OneNameBox({
  checked,
  onChange,
  className = '',
  textClassName = 'text-body-sm text-on-surface',
  hintClassName = 'text-label-md text-on-surface-faint',
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
  /** The words' colours, for a page drawn on its own surface (sign-up). */
  textClassName?: string
  hintClassName?: string
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 ${className}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
      <span className={textClassName}>
        I only have one name
        <span className={`block ${hintClassName}`}>Tick this if you have no last name. You will not be asked for one.</span>
      </span>
    </label>
  )
}
