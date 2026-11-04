import { describe, expect, it } from 'vitest'
import { SETTINGS_COLUMNS, appSettingsSchema } from './appSettings'

/*
 * The settings read is built from the schema (it was a list kept by hand,
 * and the stage clear day and hour fell out of it: saved, but always read
 * back as their defaults, so the Save bar never cleared).
 */
describe('what the settings read asks for', () => {
  it('asks for every setting the app knows, each once', () => {
    const asked = SETTINGS_COLUMNS.split(', ')
    expect(asked).toEqual(Object.keys(appSettingsSchema.shape))
    expect(new Set(asked).size).toBe(asked.length)
    expect(asked).toEqual(expect.arrayContaining(['stage_clear_dow', 'stage_clear_hour']))
  })
})
