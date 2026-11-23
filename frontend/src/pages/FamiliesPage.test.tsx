import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FamiliesPage } from './FamiliesPage'

/*
 * Families (0326): every family, who is still on their own, and one
 * family as a graph with the box that links more people to it.
 *
 * A graph is a picture, which a test has no screen for. What is read here
 * is what a screen reader is given: the people as a list, and every line
 * as a sentence ("Gran Thomas is the mother of Anna Jacob.").
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
  const sentences = () => within(screen.getByRole('list', { name: 'Who is what to whom' })).getAllByRole('listitem').map((li) => li.textContent)

  it('draws the family as a graph, with the person it is about marked and the way back', async () => {
    show('/families?person=anna')
    expect(await screen.findByRole('heading', { name: 'Anna Jacob’s family' })).toBeInTheDocument()
    const graph = await screen.findByRole('figure', { name: 'Family of Anna Jacob' })
    const people = within(within(graph).getByRole('list', { name: 'People' })).getAllByRole('listitem')
    expect(people.map((li) => li.textContent)).toEqual(['AJAnna Jacob', 'TJTom Jacob', 'KJKid Jacob', 'ZJZak JacobWritten in'])
    expect(within(people[0]).getByText('Anna Jacob').closest('[aria-current]')).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: /Families/ })).toHaveAttribute('href', '/families')
  })

  it('has a line for a couple and a line for each child of theirs, said as sentences', async () => {
    show('/families?person=anna')
    await screen.findByRole('figure', { name: 'Family of Anna Jacob' })
    // Nobody has been said to be a man or a woman: the pair, and "parent".
    expect(sentences()).toEqual([
      'Anna Jacob is the husband or wife of Tom Jacob.',
      'Kid Jacob is the child of Anna Jacob and Tom Jacob.',
      'Zak Jacob is the child of Anna Jacob and Tom Jacob.',
    ])
  })

  it('says husband, wife, son and daughter once a word has said who is which', async () => {
    state.families = [
      {
        id: 'h1',
        members: [
          { ...member('anna', 'adult', 'Anna', 'Jacob'), gender: 'female' },
          { ...member('tom', 'adult', 'Tom', 'Jacob'), gender: 'male' },
          { ...member('kid', 'child', 'Kid', 'Jacob'), gender: 'male' },
          { ...member('zak', 'child', 'Zoe', 'Jacob', false), gender: 'female' },
        ],
      },
    ]
    show('/families?person=tom')
    await screen.findByRole('figure', { name: 'Family of Tom Jacob' })
    expect(sentences()).toEqual([
      'Anna Jacob is the wife of Tom Jacob.',
      'Kid Jacob is the son of Anna Jacob and Tom Jacob.',
      'Zoe Jacob is the daughter of Anna Jacob and Tom Jacob.',
    ])
  })

  it('shows the whole family they are in, in-laws and all, from whoever it is opened on', async () => {
    state.people = [...state.people, person('gran', 'Gran', 'Thomas')]
    state.families = [
      ...state.families,
      { id: 'h0', members: [{ ...member('gran', 'adult', 'Gran', 'Thomas'), gender: 'female' }, { ...member('anna', 'child', 'Anna', 'Jacob'), id: 'row-anna-child', gender: 'female' }] },
    ]
    show('/families?person=kid')
    const graph = await screen.findByRole('figure', { name: 'Family of Kid Jacob' })
    // His grandmother is there, though she is nothing to him by a link of his own; and his mother once.
    expect(within(graph).getAllByText('Anna Jacob')).toHaveLength(1)
    expect(within(graph).getByText('Gran Thomas')).toBeInTheDocument()
    expect(sentences()).toContain('Gran Thomas is the mother of Anna Jacob.')
  })

  it('goes to somebody else’s when they are pressed in this one', async () => {
    const user = show('/families?person=anna')
    await user.click(await screen.findByRole('button', { name: 'Tom Jacob. Open their family' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/families?person=tom'))
    expect(await screen.findByRole('heading', { name: 'Tom Jacob’s family' })).toBeInTheDocument()
  })

  it('has nothing to press on the person it is about, or on somebody written in', async () => {
    show('/families?person=anna')
    await screen.findByRole('figure', { name: 'Family of Anna Jacob' })
    expect(screen.queryByRole('button', { name: /Anna Jacob/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Zak Jacob/ })).toBeNull()
  })

  it('draws somebody linked to nobody alone, and says so, with the box that links another account under it', async () => {
    show('/families?person=rose')
    expect(await screen.findByRole('heading', { name: 'Rose Mathew’s family' })).toBeInTheDocument()
    const graph = await screen.findByRole('figure', { name: 'Family of Rose Mathew' })
    expect(within(graph).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['RMRose Mathew'])
    expect(screen.queryByRole('list', { name: 'Who is what to whom' })).toBeNull()
    expect(await screen.findByText(/Nobody is linked to Rose yet/)).toBeInTheDocument()
    const add = await screen.findByRole('region', { name: 'Add somebody' })
    // The word first (0328), and then the name.
    expect(within(add).getByRole('combobox', { name: 'What they are to Rose' })).toHaveTextContent('Choose what they are')
    expect(within(add).queryByLabelText('Name of the person to add')).not.toBeInTheDocument()
  })

  it('can make the picture bigger and smaller, and fit it in', async () => {
    show('/families?person=anna')
    const graph = await screen.findByRole('figure', { name: 'Family of Anna Jacob' })
    const size = within(graph).getByRole('group', { name: 'Size of the picture' })
    expect(within(size).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Zoom out', 'Zoom in', 'Fit the whole picture in'])
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
  const everybody = () => screen.findByRole('figure', { name: 'Everybody in the church, and who is linked to whom' })
  const names = (graph: HTMLElement) => within(within(graph).getByRole('list', { name: 'People' })).getAllByRole('listitem').map((li) => li.textContent)

  it('is reached from a button on the list, by its own address', async () => {
    const user = show()
    await user.click(await screen.findByRole('link', { name: 'View all' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/families?view=all')
    expect(await screen.findByRole('heading', { name: 'Everybody' })).toBeInTheDocument()
  })

  it('is one picture of everybody: each family joined by its lines, and whoever is linked to nobody with none', async () => {
    show('/families?view=all')
    const graph = await everybody()
    // The older household first. Anna is in two households and is one person.
    expect(names(graph)).toEqual(['GTGran Thomas', 'AJAnna Jacob', 'WTWren ThomasWritten in', 'TJTom Jacob', 'KJKid Jacob', 'ZJZak JacobWritten in', 'RMRose Mathew', 'JSJoel Skaria'])
    const lines = within(screen.getByRole('list', { name: 'Who is what to whom' })).getAllByRole('listitem').map((li) => li.textContent)
    // Gran to each of her two; Anna and Tom; and each of their two to the pair of them.
    expect(lines).toHaveLength(5)
    expect(lines).toContain('Gran Thomas is the parent of Anna Jacob.')
    expect(lines).toContain('Kid Jacob is the child of Anna Jacob and Tom Jacob.')
    expect(lines.some((l) => /Rose Mathew|Joel Skaria/.test(l ?? ''))).toBe(false)
  })

  it('says how many people it is showing', async () => {
    show('/families?view=all')
    expect(await screen.findByText('6 on the app · 2 written in · 1 family')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 family · 2 not linked to anybody')
  })

  it('goes to somebody’s own family when they are pressed, in a family or on their own', async () => {
    const user = show('/families?view=all')
    await user.click(await screen.findByRole('button', { name: 'Rose Mathew. Open their family' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/families?person=rose')
  })

  it('has nothing to press on somebody written in', async () => {
    show('/families?view=all')
    await everybody()
    expect(screen.queryByRole('button', { name: /Zak Jacob/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Wren Thomas/ })).toBeNull()
  })

  it('finds a family by anybody in it, and somebody alone by their name', async () => {
    const user = show('/families?view=all')
    const box = await screen.findByRole('searchbox', { name: 'Find a person or a family' })
    await user.type(box, 'wren')
    // The whole family she is in, and nobody else.
    expect(names(await everybody())).toHaveLength(6)
    expect(screen.getByRole('status')).toHaveTextContent('1 family · 0 not linked to anybody')
    await user.clear(box)
    await user.type(box, 'rose')
    expect(names(await everybody())).toEqual(['RMRose Mathew'])
    expect(screen.getByRole('status')).toHaveTextContent('0 families · 1 not linked to anybody')
    await user.clear(box)
    await user.type(box, 'zzz')
    expect(screen.queryByRole('figure')).toBeNull()
    expect(screen.getByText('Nobody by that name.')).toBeInTheDocument()
  })

  it('asks the database for nothing the list does not already read', async () => {
    show('/families?view=all')
    await everybody()
    expect([...new Set(state.rpcs.map((r) => r.name))]).toEqual(['families'])
  })

  it('has the way back to the list', async () => {
    const user = show('/families?view=all')
    await user.click(await screen.findByRole('link', { name: /Families/ }))
    expect(screen.getByTestId('where')).toHaveTextContent(/\/families$/)
  })
})
