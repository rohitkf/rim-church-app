import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FamiliesPage } from './FamiliesPage'

/*
 * Families (0326): every family, who is still on their own, and one
 * family as a tree with the box that links more people to it.
 */

const state = vi.hoisted(() => ({
  families: [] as unknown[],
  people: [] as { id: string; first_name: string; last_name: string }[],
  familyOf: {} as Record<string, unknown>,
  rpcs: [] as { name: string; args: unknown }[],
}))

const NOBODY = { spouse: [], children: [], parents: [], written_people: { spouse: [], children: [], parents: [] } }

vi.mock('../lib/useErrorText', () => ({ useErrorText: () => (_e: unknown, fallback: string) => fallback }))
vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      state.rpcs.push({ name, args })
      if (name === 'families') return Promise.resolve({ data: state.families, error: null })
      if (name === 'family_of') return Promise.resolve({ data: state.familyOf[args.p_person as string] ?? NOBODY, error: null })
      return Promise.resolve({ data: null, error: null })
    },
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: state.people, error: null }) }) }),
  },
}))

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

function show(at = '/families') {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route
            path="/families"
            element={
              <>
                <FamiliesPage />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

const person = (id: string, first: string, last: string) => ({ id, first_name: first, last_name: last })
const member = (id: string, kind: 'adult' | 'child', first: string, last: string, account = true) => ({
  id: `row-${id}`,
  user_id: account ? id : null,
  kind,
  first_name: first,
  last_name: last,
})

beforeEach(() => {
  state.rpcs = []
  state.people = [person('anna', 'Anna', 'Jacob'), person('tom', 'Tom', 'Jacob'), person('kid', 'Kid', 'Jacob'), person('rose', 'Rose', 'Mathew'), person('joel', 'Joel', 'Skaria')]
  state.families = [
    { id: 'h1', members: [member('anna', 'adult', 'Anna', 'Jacob'), member('tom', 'adult', 'Tom', 'Jacob'), member('kid', 'child', 'Kid', 'Jacob'), member('zak', 'child', 'Zak', 'Jacob', false)] },
  ]
  state.familyOf = {
    anna: {
      spouse: [person('tom', 'Tom', 'Jacob')],
      children: [person('kid', 'Kid', 'Jacob')],
      parents: [],
      written_people: { spouse: [], children: [{ id: 'row-zak', first_name: 'Zak', last_name: 'Jacob' }], parents: [] },
    },
  }
})

describe('the Families page', () => {
  it('lists each family by its adults, with everybody in it, the written-in said in words', async () => {
    show()
    const card = await screen.findByRole('listitem', { name: 'Anna & Tom Jacob' })
    expect(within(card).getByText('2 adults, 2 children')).toBeInTheDocument()
    expect(within(card).getByText('Kid Jacob')).toBeInTheDocument()
    expect(within(card).getByText(/Zak Jacob/)).toHaveTextContent('Zak Jacob · written in')
    expect(within(card).getByRole('link', { name: 'Anna & Tom Jacob: open the family' })).toHaveAttribute('href', '/families?person=anna')
  })

  it('counts the families, who is in one, and who is not linked to anybody', async () => {
    show()
    await screen.findByRole('listitem', { name: 'Anna & Tom Jacob' })
    const main = document.body.textContent ?? ''
    expect(main).toContain('1family')
    expect(main).toContain('3in a family')
    expect(main).toContain('2not linked')
  })

  it('lists everybody not in a family, each a way in to link them', async () => {
    show()
    const alone = await screen.findByRole('list', { name: 'Not linked to anybody' })
    expect(within(alone).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Rose MathewLink', 'Joel SkariaLink'])
    expect(within(alone).getByRole('link', { name: 'Rose Mathew: link their family' })).toHaveAttribute('href', '/families?person=rose')
  })

  it('searches both lists by name as it is typed', async () => {
    const user = show()
    await screen.findByRole('listitem', { name: 'Anna & Tom Jacob' })
    await user.type(screen.getByRole('searchbox', { name: 'Find a person or a family' }), 'rose')
    expect(screen.queryByRole('listitem', { name: 'Anna & Tom Jacob' })).toBeNull()
    expect(screen.getByText('No family has anybody by that name.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Not linked to anybody' })).getAllByRole('listitem')).toHaveLength(1)
    // A family is found by anybody in it, a child written in included.
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'zak')
    expect(screen.getByRole('listitem', { name: 'Anna & Tom Jacob' })).toBeInTheDocument()
    expect(screen.getByText('Nobody by that name is on their own.')).toBeInTheDocument()
  })

  it('says so when no families are linked yet', async () => {
    state.families = []
    show()
    expect(await screen.findByText('No families are linked yet. Choose somebody below to start one.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Not linked to anybody' })).getAllByRole('listitem')).toHaveLength(5)
  })
})

describe('one family on the Families page', () => {
  it('draws the family as a tree, with the way back', async () => {
    show('/families?person=anna')
    expect(await screen.findByRole('heading', { name: 'Anna Jacob’s family' })).toBeInTheDocument()
    expect(await screen.findByRole('figure', { name: 'Family tree of Anna Jacob' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Anna’s children' })).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Families/ })).toHaveAttribute('href', '/families')
    expect(state.rpcs.some((r) => r.name === 'family_of' && (r.args as { p_person: string }).p_person === 'anna')).toBe(true)
  })

  it('goes to somebody else’s tree when they are pressed in this one', async () => {
    const user = show('/families?person=anna')
    await user.click(await screen.findByRole('button', { name: 'Tom Jacob, Husband or wife. Show their family' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/families?person=tom'))
    expect(await screen.findByRole('heading', { name: 'Tom Jacob’s family' })).toBeInTheDocument()
  })

  it('has the box that links another account, under the tree', async () => {
    show('/families?person=rose')
    expect(await screen.findByRole('heading', { name: 'Rose Mathew’s family' })).toBeInTheDocument()
    expect(await screen.findByText(/Nobody is linked to Rose yet/)).toBeInTheDocument()
    const add = await screen.findByRole('region', { name: 'Add somebody' })
    // The word first (0328), and then the name.
    expect(within(add).getByRole('combobox', { name: 'What they are to Rose' })).toHaveTextContent('Choose what they are')
    expect(within(add).queryByLabelText('Name of the person to add')).not.toBeInTheDocument()
  })

  it('says so for somebody who is not on the app any more', async () => {
    show('/families?person=gone')
    expect(await screen.findByText('That person is not on the app any more.')).toBeInTheDocument()
    expect(state.rpcs.some((r) => r.name === 'family_of')).toBe(false)
  })
})

describe('everybody in the church, on one page', () => {
  beforeEach(() => {
    // Gran's household, with Anna a child of it; Anna's own, with Tom and two children.
    state.people = [...state.people, person('gran', 'Gran', 'Thomas')]
    state.families = [
      ...state.families,
      { id: 'h0', members: [member('gran', 'adult', 'Gran', 'Thomas'), { ...member('anna', 'child', 'Anna', 'Jacob'), id: 'row-anna-child' }, member('wren', 'child', 'Wren', 'Thomas', false)] },
    ]
  })

  it('is reached from a button on the list, by its own address', async () => {
    const user = show()
    await user.click(await screen.findByRole('link', { name: 'View all' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/families?view=all')
    expect(await screen.findByRole('heading', { name: 'Everybody' })).toBeInTheDocument()
  })

  it('draws each family as a tree, a household under the household its adult is a child of', async () => {
    show('/families?view=all')
    const tree = await screen.findByRole('figure', { name: 'Family tree of Anna & Tom Jacob' })
    const lists = within(tree).getAllByRole('list').map((l) => l.getAttribute('aria-label'))
    // Gran's children: Wren, who has no household of her own, and then Anna, drawn as hers.
    expect(lists).toEqual(['Gran', 'Children of Gran', 'Children of Gran, with their own families', 'Anna and Tom', 'Children of Anna and Tom'])
    // Anna is drawn once: beside Tom, under Gran, and not a second time among Gran's children.
    expect(within(tree).getAllByText('Anna Jacob')).toHaveLength(1)
    expect(within(within(tree).getByRole('list', { name: 'Children of Anna and Tom' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'KJKid Jacob',
      'ZJZak JacobWritten in',
    ])
  })

  it('says how many people it is showing, and lists whoever is linked to nobody as themselves', async () => {
    show('/families?view=all')
    expect(await screen.findByText('6 on the app · 2 written in · 1 family')).toBeInTheDocument()
    const alone = screen.getByRole('list', { name: 'Not linked to anybody' })
    expect(within(alone).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['RMRose Mathew', 'JSJoel Skaria'])
  })

  it('goes to somebody’s own family when they are pressed, in a tree or on their own', async () => {
    const user = show('/families?view=all')
    await user.click(await screen.findByRole('button', { name: 'Tom Jacob. Show their family' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/families?person=tom')
  })

  it('has nothing to press on somebody written in', async () => {
    show('/families?view=all')
    await screen.findByRole('figure', { name: 'Family tree of Anna & Tom Jacob' })
    expect(screen.queryByRole('button', { name: /Zak Jacob/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Wren Thomas/ })).toBeNull()
  })

  it('finds a family by anybody in it, and somebody alone by their name', async () => {
    const user = show('/families?view=all')
    const box = await screen.findByRole('searchbox', { name: 'Find a person or a family' })
    await user.type(box, 'wren')
    expect(screen.getByRole('figure', { name: 'Family tree of Anna & Tom Jacob' })).toBeInTheDocument()
    expect(screen.getByText('Nobody by that name is on their own.')).toBeInTheDocument()
    await user.clear(box)
    await user.type(box, 'rose')
    expect(screen.queryByRole('figure')).toBeNull()
    expect(screen.getByText('No family has anybody by that name.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Not linked to anybody' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it('asks the database for nothing the list does not already read', async () => {
    show('/families?view=all')
    await screen.findByRole('figure', { name: 'Family tree of Anna & Tom Jacob' })
    expect([...new Set(state.rpcs.map((r) => r.name))]).toEqual(['families'])
  })

  it('has the way back to the list', async () => {
    const user = show('/families?view=all')
    await user.click(await screen.findByRole('link', { name: /Families/ }))
    expect(screen.getByTestId('where')).toHaveTextContent(/\/families$/)
  })
})
