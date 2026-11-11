import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BLOCK_REASON_MAX, accountBlockSchema, blockAccount, fetchAccountBlocks, mayBlock, unblockAccount } from './accountBlocks'

/*
 * Blocking an account (0279). The database's rules about who may block
 * whom, said once more so a button that would be refused is not offered,
 * and the two calls that are the only way to write a block.
 */

const rpc = vi.hoisted(() => vi.fn<(name: string, args: unknown) => Promise<{ error: unknown }>>())
const select = vi.hoisted(() => vi.fn<() => Promise<{ data: unknown; error: unknown }>>())
vi.mock('./supabaseClient', () => ({
  supabase: { rpc: (name: string, args: unknown) => rpc(name, args), from: () => ({ select: () => select() }) },
}))

beforeEach(() => {
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null })
  select.mockReset()
})

const admin = { hasRight: true, viewerId: 'me', viewerIsOwner: false, targetId: 'them', targetIsOwner: false, targetIsAdmin: false }

describe('who the Block button is offered on', () => {
  it('is anybody else, for somebody the grid lets block', () => {
    expect(mayBlock(admin)).toBe(true)
  })

  it('is nobody, without the right', () => {
    expect(mayBlock({ ...admin, hasRight: false })).toBe(false)
    expect(mayBlock({ ...admin, hasRight: false, viewerIsOwner: true })).toBe(false)
  })

  it('is never yourself', () => {
    expect(mayBlock({ ...admin, targetId: 'me' })).toBe(false)
    expect(mayBlock({ ...admin, targetId: 'me', viewerIsOwner: true })).toBe(false)
  })

  it('is never the Owner', () => {
    expect(mayBlock({ ...admin, targetIsOwner: true, targetIsAdmin: true })).toBe(false)
  })

  it('is an Admin only for the Owner', () => {
    expect(mayBlock({ ...admin, targetIsAdmin: true })).toBe(false)
    expect(mayBlock({ ...admin, targetIsAdmin: true, viewerIsOwner: true })).toBe(true)
  })

  it('is nobody while it is not known who is looking', () => {
    expect(mayBlock({ ...admin, viewerId: undefined, targetId: 'them' })).toBe(true)
    expect(mayBlock({ ...admin, viewerId: null, hasRight: false })).toBe(false)
  })
})

describe('blocking and unblocking', () => {
  it('goes through block_account, with the note trimmed', async () => {
    await blockAccount('them', '  Asked to step back for now  ')
    expect(rpc).toHaveBeenCalledWith('block_account', { target_user_id: 'them', why: 'Asked to step back for now' })
  })

  it('sends no note at all for a blank one', async () => {
    await blockAccount('them', '   ')
    expect(rpc).toHaveBeenCalledWith('block_account', { target_user_id: 'them', why: null })
  })

  it('cuts a note at the length the database keeps', async () => {
    await blockAccount('them', 'x'.repeat(BLOCK_REASON_MAX + 50))
    expect((rpc.mock.calls[0][1] as { why: string }).why).toHaveLength(BLOCK_REASON_MAX)
  })

  it('goes through unblock_account', async () => {
    await unblockAccount('them')
    expect(rpc).toHaveBeenCalledWith('unblock_account', { target_user_id: 'them' })
  })

  it('hands back the database\'s refusal as it is, for the page to word', async () => {
    const refusal = { code: 'P0001', message: 'Only the owner can block another Admin\'s account' }
    rpc.mockResolvedValue({ error: refusal })
    await expect(blockAccount('them', '')).rejects.toBe(refusal)
    await expect(unblockAccount('them')).rejects.toBe(refusal)
  })
})

describe('who is blocked', () => {
  it('is read as the table gives it', async () => {
    const row = { user_id: 'them', reason: null, blocked_by: 'me', blocked_at: '2026-11-11T15:42:00Z' }
    select.mockResolvedValue({ data: [row], error: null })
    await expect(fetchAccountBlocks()).resolves.toEqual([row])
  })

  it('is nobody for somebody the table does not answer', async () => {
    select.mockResolvedValue({ data: [], error: null })
    await expect(fetchAccountBlocks()).resolves.toEqual([])
  })

  it('keeps a block whose maker has since been removed', () => {
    expect(accountBlockSchema.parse({ user_id: 'them', reason: 'x', blocked_by: null, blocked_at: '2026-11-11T15:42:00Z' }).blocked_by).toBeNull()
  })
})
