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
    expect(within(add).getByRole('combobox', { name: 'What they are to Rose' })).toBeInTheDocument()
    expect(within(add).getByLabelText('Name of the person to add')).toBeInTheDocument()
  })

  it('says so for somebody who is not on the app any more', async () => {
    show('/families?person=gone')
    expect(await screen.findByText('That person is not on the app any more.')).toBeInTheDocument()
    expect(state.rpcs.some((r) => r.name === 'family_of')).toBe(false)
  })
})
