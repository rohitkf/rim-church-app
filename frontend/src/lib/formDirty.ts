export interface TemplateFormState {
  name: string
  startTime: string
  sessions: { session_name: string; duration_minutes: number }[]
}

/** Canonical form of a template draft: trimmed, ignoring blank session
 * rows, so an empty row the admin added but never filled in doesn't count
 * as an unsaved change. */
function canonical(state: TemplateFormState): string {
  return JSON.stringify({
    name: state.name.trim(),
    startTime: state.startTime,
    sessions: state.sessions
      .filter((s) => s.session_name.trim())
      .map((s) => ({ name: s.session_name.trim(), minutes: s.duration_minutes })),
  })
}

export function isTemplateFormDirty(current: TemplateFormState, baseline: TemplateFormState): boolean {
  return canonical(current) !== canonical(baseline)
}

/** The New Service form counts as dirty once a date or name is entered. */
export function isNewServiceFormDirty(date: string, serviceType: string): boolean {
  return date.trim() !== '' || serviceType.trim() !== ''
}
