import { describe, expect, it } from 'vitest'
import {
  checklistItemRowSchema,
  departmentMemberRowSchema,
  departmentSchema,
  inventoryItemSchema,
} from './types'

// These are the schemas standing in for what used to be plain TypeScript
// `interface`s — the whole point is that they reject malformed data at
// runtime instead of silently producing `undefined` fields in the UI.

describe('departmentSchema', () => {
  it('accepts a well-formed row', () => {
    const result = departmentSchema.safeParse({
      id: 'd1',
      name: 'Media',
      handbook_url: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a row missing a required field', () => {
    const result = departmentSchema.safeParse({
      id: 'd1',
      handbook_url: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    expect(result.success).toBe(false)
  })

  it('rejects null where handbook_url is required to be present (even if nullable, the key must exist)', () => {
    const { handbook_url: _drop, ...withoutHandbookUrl } = {
      id: 'd1',
      name: 'Media',
      handbook_url: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(departmentSchema.safeParse(withoutHandbookUrl).success).toBe(false)
  })
})

describe('checklistItemRowSchema', () => {
  const base = {
    id: 'i1',
    checklist_id: 'c1',
    role_label: 'Sound check',
    assigned_to: null,
    completed_by: null,
    completed_at: null,
    verified_by_head: null,
    verified_by_head_at: null,
    verified_by_coordinator: null,
    verified_by_coordinator_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    assignee: null,
  }

  it('accepts every valid status value', () => {
    for (const status of ['pending', 'member_complete', 'head_verified', 'coordinator_verified']) {
      expect(checklistItemRowSchema.safeParse({ ...base, status }).success).toBe(true)
    }
  })

  it('rejects a status value outside the enum (e.g. a typo or a stale DB value)', () => {
    const result = checklistItemRowSchema.safeParse({ ...base, status: 'in_progress' })
    expect(result.success).toBe(false)
  })

  it('accepts a populated assignee object', () => {
    const result = checklistItemRowSchema.safeParse({
      ...base,
      status: 'pending',
      assignee: { id: 'u1', first_name: 'Sarah', last_name: 'Jenkins' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects an assignee object missing a required field', () => {
    const result = checklistItemRowSchema.safeParse({
      ...base,
      status: 'pending',
      assignee: { id: 'u1', first_name: 'Sarah' },
    })
    expect(result.success).toBe(false)
  })
})

describe('departmentMemberRowSchema', () => {
  it('rejects an invalid member_type instead of silently accepting it', () => {
    const result = departmentMemberRowSchema.safeParse({
      id: 'm1',
      department_id: 'd1',
      user_id: 'u1',
      member_type: 'admin', // not 'core' | 'guest'
      created_at: '2026-01-01T00:00:00Z',
      profiles: null,
    })
    expect(result.success).toBe(false)
  })

  it('accepts a null profiles join (e.g. RLS hid the row, or the user was deleted)', () => {
    const result = departmentMemberRowSchema.safeParse({
      id: 'm1',
      department_id: 'd1',
      user_id: 'u1',
      member_type: 'core',
      created_at: '2026-01-01T00:00:00Z',
      profiles: null,
    })
    expect(result.success).toBe(true)
  })
})

describe('inventoryItemSchema', () => {
  it('rejects a quantity sent as a string (e.g. an un-coerced form value)', () => {
    const result = inventoryItemSchema.safeParse({
      id: 'i1',
      department_id: 'd1',
      name: 'Mic',
      quantity: '5',
      status: null,
      location: null,
      last_checked: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    expect(result.success).toBe(false)
  })
})
