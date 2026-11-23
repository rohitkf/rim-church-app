import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FamilyTree } from './FamilyTree'
import type { FamilyOf } from '../lib/familyLinks'

/*
 * One family as a tree: parents above, the person beside their husband or
 * wife, children below. With nothing to measure it is three plain lists,
 * which is what a screen reader is given too.
 */

const ANNA = { id: 'anna', first_name: 'Anna', last_name: 'Jacob' }
const nobody: FamilyOf = { spouse: [], children: [], parents: [], written_people: { spouse: [], children: [], parents: [] } }
const whole: FamilyOf = {
  spouse: [{ id: 'tom', first_name: 'Tom', last_name: 'Jacob' }],
  children: [{ id: 'kid', first_name: 'Kid', last_name: 'Jacob' }],
  parents: [{ id: 'gran', first_name: 'Gran', last_name: 'Thomas' }],
  written_people: {
    spouse: [],
    children: [{ id: 'w1', first_name: 'Zak', last_name: 'Jacob', dob: '2018-01-02' }],
    parents: [{ id: 'w2', first_name: 'Grandad', last_name: 'Thomas' }],
  },
}

const names = (list: HTMLElement) => within(list).getAllByRole('listitem').map((li) => li.textContent)

describe('a family drawn as a tree', () => {
  it('has three rows: parents, the person and their husband or wife, children', () => {
    render(<FamilyTree person={ANNA} family={whole} />)
    expect(screen.getByRole('figure', { name: 'Family tree of Anna Jacob' })).toBeInTheDocument()
    const rows = screen.getAllByRole('list').map((l) => l.getAttribute('aria-label'))
    expect(rows).toEqual(['Anna’s parents', 'Anna and their husband or wife', 'Anna’s children'])
    expect(names(screen.getByRole('list', { name: 'Anna’s parents' }))).toEqual(['GTGran ThomasParent', 'GTGrandad ThomasParent · written in'])
    expect(names(screen.getByRole('list', { name: 'Anna and their husband or wife' }))).toEqual(['AJAnna JacobThis person', 'TJTom JacobHusband or wife'])
    expect(names(screen.getByRole('list', { name: 'Anna’s children' }))).toEqual(['KJKid JacobChild', 'ZJZak JacobChild · written in'])
  })

  it('marks the person it is drawn from, who is not a button', () => {
    render(<FamilyTree person={ANNA} family={whole} onOpen={() => {}} />)
    const me = screen.getByText('This person').closest('[aria-current]')
    expect(me).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByRole('button', { name: /Anna Jacob/ })).toBeNull()
  })

  it('opens somebody else’s tree when they are pressed, if they have an account', async () => {
    const user = userEvent.setup()
    const opened = vi.fn()
    render(<FamilyTree person={ANNA} family={whole} onOpen={opened} />)
    await user.click(screen.getByRole('button', { name: 'Gran Thomas, Parent. Show their family' }))
    expect(opened).toHaveBeenCalledWith('gran')
    await user.click(screen.getByRole('button', { name: 'Kid Jacob, Child. Show their family' }))
    expect(opened).toHaveBeenLastCalledWith('kid')
    // Somebody written in has no family of their own to open.
    expect(screen.queryByRole('button', { name: /Zak Jacob/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Grandad Thomas/ })).toBeNull()
  })

  it('leaves out a row with nobody in it', () => {
    render(<FamilyTree person={ANNA} family={{ ...nobody, spouse: whole.spouse }} />)
    expect(screen.getAllByRole('list').map((l) => l.getAttribute('aria-label'))).toEqual(['Anna and their husband or wife'])
  })

  it('shows somebody alone as themselves, and says nobody is linked yet', () => {
    render(<FamilyTree person={ANNA} family={nobody} />)
    expect(names(screen.getByRole('list'))).toEqual(['AJAnna JacobThis person'])
    expect(screen.getByText(/Nobody is linked to Anna yet/)).toBeInTheDocument()
  })

  it('does not say that of somebody with a family', () => {
    render(<FamilyTree person={ANNA} family={whole} />)
    expect(screen.queryByText(/Nobody is linked/)).toBeNull()
  })
})
