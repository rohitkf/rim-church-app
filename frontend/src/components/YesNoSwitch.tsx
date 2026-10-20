import { SegmentedControl } from './Surface'

/**
 * Yes or No, one tap — the same segmented control the availability page
 * answers "Can you serve?" with. The chosen answer stands up out of the
 * track in its own colour, Yes green and No red; with nothing chosen
 * neither does.
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
  return (
    <SegmentedControl
      label={label}
      kind="pressed"
      disabled={disabled}
      value={value === null ? null : value ? 'yes' : 'no'}
      onChange={(next) => onChange(next === 'yes')}
      options={[
        { value: 'yes', label: 'Yes', tone: 'green' },
        { value: 'no', label: 'No', tone: 'red' },
      ]}
      className="max-w-xs"
    />
  )
}
