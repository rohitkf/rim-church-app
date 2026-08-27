import { describe, expect, it } from 'vitest'
import { isNewServiceFormDirty, isTemplateFormDirty, type TemplateFormState } from './formDirty'

const blank: TemplateFormState = { name: '', startTime: '10:00', sessions: [] }

describe('isTemplateFormDirty', () => {
  it('is clean for an untouched blank form', () => {
    expect(isTemplateFormDirty({ ...blank, sessions: [{ session_name: '', duration_minutes: 5 }] }, blank)).toBe(false)
  })

  it('notices a name, a time change, or a filled session row', () => {
    expect(isTemplateFormDirty({ ...blank, name: 'English' }, blank)).toBe(true)
    expect(isTemplateFormDirty({ ...blank, startTime: '09:30' }, blank)).toBe(true)
    expect(
      isTemplateFormDirty({ ...blank, sessions: [{ session_name: 'Worship', duration_minutes: 20 }] }, blank),
    ).toBe(true)
  })

  it('ignores whitespace-only differences', () => {
    expect(isTemplateFormDirty({ ...blank, name: '  ' }, blank)).toBe(false)
    const baseline: TemplateFormState = {
      name: 'English',
      startTime: '10:00',
      sessions: [{ session_name: 'Worship', duration_minutes: 20 }],
    }
    const current: TemplateFormState = {
      name: ' English ',
      startTime: '10:00',
      sessions: [{ session_name: ' Worship ', duration_minutes: 20 }],
    }
    expect(isTemplateFormDirty(current, baseline)).toBe(false)
  })

  it('notices an edited duration on an existing template', () => {
    const baseline: TemplateFormState = {
      name: 'English',
      startTime: '10:00',
      sessions: [{ session_name: 'Worship', duration_minutes: 20 }],
    }
    expect(
      isTemplateFormDirty({ ...baseline, sessions: [{ session_name: 'Worship', duration_minutes: 25 }] }, baseline),
    ).toBe(true)
  })

  it('notices a removed session', () => {
    const baseline: TemplateFormState = {
      name: 'English',
      startTime: '10:00',
      sessions: [
        { session_name: 'Worship', duration_minutes: 20 },
        { session_name: 'Sermon', duration_minutes: 40 },
      ],
    }
    expect(
      isTemplateFormDirty({ ...baseline, sessions: [{ session_name: 'Worship', duration_minutes: 20 }] }, baseline),
    ).toBe(true)
  })
})

describe('isNewServiceFormDirty', () => {
  it('is clean when empty and dirty once anything is entered', () => {
    expect(isNewServiceFormDirty('', '')).toBe(false)
    expect(isNewServiceFormDirty('  ', ' ')).toBe(false)
    expect(isNewServiceFormDirty('2026-08-30', '')).toBe(true)
    expect(isNewServiceFormDirty('', 'English Service')).toBe(true)
  })
})
