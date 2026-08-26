export interface PasswordChecks {
  minLength: boolean
  hasUpperLower: boolean
  hasNumber: boolean
  hasSymbol: boolean
}

export function passwordChecks(pw: string): PasswordChecks {
  return {
    minLength: pw.length >= 8,
    hasUpperLower: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    hasNumber: /\d/.test(pw),
    hasSymbol: /[^a-zA-Z0-9]/.test(pw),
  }
}

/** 0–4: one point per satisfied check. */
export function passwordScore(pw: string): number {
  if (!pw) return 0
  return Object.values(passwordChecks(pw)).filter(Boolean).length
}

export const strengthLabel: Record<number, string> = {
  0: 'Too weak',
  1: 'Weak',
  2: 'Fair',
  3: 'Good',
  4: 'Strong',
}

/** Meter color per score, matching the attendance health tones. */
export function strengthColorClass(score: number): string {
  if (score <= 1) return 'bg-error'
  if (score <= 2) return 'bg-warning'
  return 'bg-success'
}
