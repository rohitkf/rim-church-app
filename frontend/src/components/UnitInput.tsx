import { useId } from 'react'
import { inputClasses } from './Surface'

/**
 * The words a church actually stores things by. Offered, never enforced:
 * somebody will need "gaffer roll" or "communion cup" and a fixed list would
 * make them choose the wrong one.
 */
export const UNIT_SUGGESTIONS = [
  'each',
  'box',
  'pack',
  'set',
  'pair',
  'roll',
  'metre',
  'litre',
  'kg',
  'sheet',
  'bag',
]

/**
 * What one of the thing is called.
 *
 * "10 screws, £1" is ambiguous in the way that costs money — a pound for the
 * box or a pound for the screw? Naming the unit beside the cost settles it,
 * and the total the register shows is then arithmetic anyone can check.
 */
export function UnitInput({
  value,
  onChange,
  disabled = false,
  placeholder = 'each',
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  // A datalist is addressed by id, so two of these on one page need two.
  const listId = useId()
  return (
    <>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        maxLength={24}
        disabled={disabled}
        placeholder={placeholder}
        className={inputClasses}
      />
      <datalist id={listId}>
        {UNIT_SUGGESTIONS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </>
  )
}
