import { useEffect, useId, useRef, useState } from 'react'
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min'
import { Select } from './Select'
import { checkPhone, countryOptions, splitPhone, type PhoneStatus } from '../lib/phone'

/**
 * A phone number with its country.
 *
 * The box takes the number the way people write it; the country beside it
 * says what it is a number *of*, and what is saved is the full
 * international form ("+447912345678"). Typing a "+" in the box switches
 * the country by itself, which is what somebody pasting a number from their
 * contacts expects.
 *
 * `value` is only where it starts. What is typed lives here, because a
 * field that rewrote its own text from the saved value on every keystroke
 * would fight the cursor. `onChange` is told only about numbers that are
 * valid (or empty), so a half-typed one can never overwrite a good one
 * somewhere that saves as you go; `onStatus` says which of the two it is.
 */

const inputClasses =
  'w-full rounded-[var(--radius-chip)] bg-raised px-3 py-2.5 text-body-md text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary'

export function PhoneField({
  value,
  onChange,
  onStatus,
  showError = false,
  normalise = false,
  label = 'Phone',
  inputClassName,
}: {
  value: string
  onChange: (e164: string) => void
  onStatus?: (status: PhoneStatus) => void
  /** Show a problem even if the box was never visited (a form that was submitted). */
  showError?: boolean
  /** On first showing, rewrite an older-style valid number as international. */
  normalise?: boolean
  label?: string
  inputClassName?: string
}) {
  const id = useId()
  const [start] = useState(() => splitPhone(value))
  const [country, setCountry] = useState<CountryCode>(start.country)
  const [national, setNational] = useState(start.national)
  const [touched, setTouched] = useState(false)

  const check = checkPhone(country, national)
  const callbacks = useRef({ onChange, onStatus })
  useEffect(() => {
    callbacks.current = { onChange, onStatus }
  })

  // The status at the start, and whenever it changes after.
  useEffect(() => {
    callbacks.current.onStatus?.(check.status)
  }, [check.status])

  // An older valid number, say with a leading 0, becomes international once.
  const normalised = useRef(false)
  useEffect(() => {
    if (!normalise || normalised.current) return
    normalised.current = true
    if (check.status === 'valid' && check.e164 !== value) callbacks.current.onChange(check.e164)
  })

  function emit(nextCountry: CountryCode, nextNational: string) {
    const next = checkPhone(nextCountry, nextNational)
    if (next.status === 'valid') onChange(next.e164)
    else if (next.status === 'empty') onChange('')
  }

  function typed(text: string) {
    let nextCountry = country
    let nextNational = text
    if (text.trim().startsWith('+')) {
      const parsed = parsePhoneNumberFromString(text)
      if (parsed?.country) {
        nextCountry = parsed.country
        nextNational = parsed.formatNational()
        setCountry(nextCountry)
      }
    }
    setNational(nextNational)
    emit(nextCountry, nextNational)
  }

  function pickCountry(code: string) {
    setCountry(code as CountryCode)
    emit(code as CountryCode, national)
  }

  const problem = (touched || showError) && check.status === 'invalid' ? check.message : ''

  return (
    <div className="flex flex-col gap-1.5 text-body-sm text-on-surface-variant">
      <label htmlFor={id}>{label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="sm:w-64 sm:shrink-0">
          <Select
            value={country}
            onChange={pickCountry}
            options={countryOptions()}
            aria-label="Country code"
          />
        </div>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={national}
          onChange={(e) => typed(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="Phone number"
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${id}-note`}
          className={`${inputClasses} min-w-0 ${problem ? 'field-error' : ''} ${inputClassName ?? ''}`}
        />
      </div>
      <p id={`${id}-note`} role={problem ? 'alert' : undefined} className="text-label-sm">
        {problem ? (
          <span className="text-error">{problem}</span>
        ) : check.status === 'valid' ? (
          <span className="text-on-surface-faint">We’ll save it as {check.display}</span>
        ) : null}
      </p>
    </div>
  )
}
