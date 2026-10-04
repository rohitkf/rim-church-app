import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportVolunteersDialog } from './ExportVolunteersDialog'

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))
vi.mock('../lib/writeWorkbook', () => ({ writeWorkbook: () => Promise.resolve() }))
vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))

function open(isOwner: boolean) {
  render(
    <ExportVolunteersDialog
      departments={[]}
      people={[]}
      memberships={[]}
      grants={[]}
      adminIds={new Set()}
      ownerId={null}
      isOwner={isOwner}
      onClose={() => {}}
    />,
  )
}

/*
 * Visa and DBS records are the Owner's alone (0126); the database would
 * hand an Admin nothing anyway, so the option is not offered to them.
 */
describe('exporting volunteers', () => {
  it('offers compliance details to the Owner', () => {
    open(true)
    expect(screen.getByRole('checkbox', { name: /Include compliance details/ })).toBeInTheDocument()
  })

  it('does not offer them to anybody else', () => {
    open(false)
    expect(screen.queryByRole('checkbox', { name: /Include compliance details/ })).toBeNull()
  })
})
