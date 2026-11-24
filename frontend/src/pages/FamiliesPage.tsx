import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { ActionLink, FitFigure, PageHeader, SectionTile, Statistic, Tile, inputClasses } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { FamilyGraph } from '../components/FamilyGraph'
import { FamilyLinksPanel } from '../components/FamilyLinksDialog'
import { accountNode, familyGraph } from '../lib/familyGraph'
import {
  FAMILIES_KEY,
  PEOPLE_NAMES_KEY,
  combineFamilies,
  fetchFamilies,
  fetchPeopleNames,
  groupAnchor,
  groupCount,
  groupMatches,
  groupTitle,
  nameMatches,
  nameOf,
  onTheirOwn,
  type Family,
  type FamilyGroup,
  type PersonName,
} from '../lib/families'

/**
 * Families (0326): every family the church has linked, who is still on
 * their own, and one family drawn as a graph with the box that links more
 * people to it.
 *
 * The Owner asked (November 2026) for "a page for seeing and linking
 * families", "node based (like org chart) view of that family", and to
 * "search and link accounts together". Until now a family was reached one
 * person at a time, from a button on their card on Volunteers.
 *
 * For whoever holds `people.family`: the Owner and a Pastor out of the
 * box (0327), and whoever else the Owner gives it. What it shows is names: the accounts, and the people written in
 * by hand. A family's address, and a child's date of birth and school,
 * stay with the family and `people.contacts`.
 *
 * A family here is everybody linked to each other, by any chain
 * (`combineFamilies`): somebody's parents, their own household and their
 * wife's parents are one card, not three. The database keeps them as
 * households, and listing each was listing one family several times.
 *
 * One page, three views, told apart by the address: `/families` is the
 * list, `/families?person=<id>` is that person's family, and
 * `/families?view=all` is the whole church as one graph. So a family can
 * be linked to, the back button works, and pressing somebody in a graph
 * is just going to theirs.
 *
 * A family is drawn as a graph (components/FamilyGraph): everybody a
 * node, every relationship a line between two people with what each is
 * to the other written on it.
 */
export function FamiliesPage() {
  const [params, setParams] = useSearchParams()
  const personId = params.get('person')
  const families = useQuery({ queryKey: FAMILIES_KEY, queryFn: fetchFamilies })
  const people = useQuery({ queryKey: PEOPLE_NAMES_KEY, queryFn: fetchPeopleNames })

  if (personId) {
    return (
      <OneFamily
        personId={personId}
        people={people.data}
        families={families.data ?? []}
        loading={people.isLoading || families.isLoading}
        error={people.error ?? families.error}
        onOpen={(id) => setParams({ person: id })}
      />
    )
  }
  if (params.get('view') === 'all') {
    return (
      <Everybody
        families={families.data ?? []}
        people={people.data ?? []}
        loading={families.isLoading || people.isLoading}
        error={families.error ?? people.error}
        onOpen={(id) => setParams({ person: id })}
      />
    )
  }
  return (
    <AllFamilies
      families={families.data ?? []}
      people={people.data ?? []}
      loading={families.isLoading || people.isLoading}
      error={families.error ?? people.error}
    />
  )
}

function AllFamilies({
  families,
  people,
  loading,
  error,
}: {
  families: Family[]
  people: PersonName[]
  loading: boolean
  error: unknown
}) {
  const [typed, setTyped] = useState('')
  const alone = onTheirOwn(people, families)
  // Households that share a person are one family.
  const joined = combineFamilies(families)
  const shownFamilies = joined.filter((f) => groupMatches(f, typed))
  const shownAlone = alone.filter((p) => nameMatches(nameOf(p), typed))
  const linked = people.length - alone.length
  const searching = typed.trim() !== ''

  return (
    <div>
      <PageHeader
        title="Families"
        description="Who is linked to whom: husbands and wives, children and parents. Find anybody, see their family drawn out, and link accounts together."
        action={
          // The Owner asked for it by this name: everybody in the church on one page, the related ones joined up.
          <ActionLink as={Link} to="/families?view=all">
            View all
          </ActionLink>
        }
      />

      <QueryState isLoading={loading} error={error}>
        <div className="grid grid-cols-3 gap-3">
          <Tile className="@container min-w-0">
            <Statistic className="flex-col" value={<FitFigure>{joined.length}</FitFigure>} unit={joined.length === 1 ? 'family' : 'families'} />
          </Tile>
          <Tile className="@container min-w-0">
            <Statistic className="flex-col" value={<FitFigure>{linked}</FitFigure>} unit="in a family" />
          </Tile>
          <Tile tone={alone.length > 0 ? 'warning' : 'plain'} className="@container min-w-0">
            <Statistic className="flex-col" value={<FitFigure>{alone.length}</FitFigure>} unit="not linked" />
          </Tile>
        </div>

        <label className="mt-5 flex flex-col gap-2 text-body-sm text-on-surface-variant">
          Find a person or a family
          <input
            type="search"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type a name"
            autoComplete="off"
            className={inputClasses}
          />
        </label>

        <section aria-labelledby="families-linked" className="mt-8">
          <h2 id="families-linked" className="flex items-baseline gap-2 text-headline-md text-on-surface">
            Families
            <span className="font-mono text-label-sm text-on-surface-faint">{shownFamilies.length}</span>
          </h2>
          {shownFamilies.length === 0 ? (
            <p className="mt-3 text-body-sm text-on-surface-variant">
              {searching ? 'No family has anybody by that name.' : 'No families are linked yet. Choose somebody below to start one.'}
            </p>
          ) : (
            <ul aria-label="Families" className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {shownFamilies.map((family) => (
                <FamilyCard key={family.id} family={family} />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="families-alone" className="mt-8">
          <h2 id="families-alone" className="flex items-baseline gap-2 text-headline-md text-on-surface">
            Not linked to anybody
            <span className="font-mono text-label-sm text-on-surface-faint">{shownAlone.length}</span>
          </h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Everybody with an account who is in no family yet. Choose one to link them to their husband or wife, children, parents, or brothers and sisters.
          </p>
          {shownAlone.length === 0 ? (
            <p className="mt-3 text-body-sm text-on-surface-variant">
              {searching ? 'Nobody by that name is on their own.' : 'Everybody is in a family.'}
            </p>
          ) : (
            <ul aria-label="Not linked to anybody" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {shownAlone.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/families?person=${p.id}`}
                    aria-label={`${nameOf(p)}: link their family`}
                    className="tap flex items-center justify-between gap-3 rounded-[var(--radius-row)] bg-surface-lowest px-4 py-3 hairline hover:ring-1 hover:ring-secondary"
                  >
                    <span className="min-w-0 text-body-md text-on-surface [overflow-wrap:anywhere]">{nameOf(p) || 'No name'}</span>
                    <span className="shrink-0 text-label-md font-medium text-accent-blue-soft">Link</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </QueryState>
    </div>
  )
}

/**
 * The whole church on one page (the Owner, November 2026: "a sort of VIEW
 * ALL button which shows everyone in the church, with related people
 * linked and all that"): one graph of everybody. Each family is a cluster
 * of people joined by their lines, and whoever is linked to nobody stands
 * after them with no line at all.
 *
 * It is the list's own data, drawn instead of listed: `families()` and
 * the church's names, which whoever opens this page already reads. So it
 * shows names, who is joined to whom, and what each is to the other, and
 * nothing else about anybody. Pressing somebody with an account goes to
 * their own family, where the box that links people is.
 */
function Everybody({
  families,
  people,
  loading,
  error,
  onOpen,
}: {
  families: Family[]
  people: PersonName[]
  loading: boolean
  error: unknown
  onOpen: (id: string) => void
}) {
  const [typed, setTyped] = useState('')
  const joined = combineFamilies(families)
  const alone = onTheirOwn(people, families)
  const shownFamilies = joined.filter((f) => groupMatches(f, typed))
  const shownAlone = alone.filter((p) => nameMatches(nameOf(p), typed))
  const searching = typed.trim() !== ''
  const writtenIn = new Set(families.flatMap((f) => f.members.filter((m) => !m.user_id).map((m) => m.id))).size
  // One picture of whoever is shown: the families whole, and then whoever is on their own.
  const graph = useMemo(
    () => familyGraph(shownFamilies.flatMap((f) => f.households), shownAlone),
    // The two lists are made afresh each time; who is in them is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [families, people, typed],
  )

  return (
    <div>
      <PageHeader
        back={
          <Link to="/families" className="tap hover:underline">
            <span aria-hidden="true">← </span>Families
          </Link>
        }
        title="Everybody"
        description="The whole church on one page. Each family is joined by its lines, with what two people are to each other written on the line between them; whoever is not linked to anybody yet stands after them. Press somebody with an account to open their own family."
        context={
          loading || error
            ? undefined
            : `${people.length} on the app · ${writtenIn} written in · ${joined.length} ${joined.length === 1 ? 'family' : 'families'}`
        }
      />

      <QueryState isLoading={loading} error={error}>
        <label className="flex flex-col gap-2 text-body-sm text-on-surface-variant">
          Find a person or a family
          <input
            type="search"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type a name"
            autoComplete="off"
            className={inputClasses}
          />
        </label>

        <p className="mt-4 font-mono text-label-sm text-on-surface-faint" role="status">
          {shownFamilies.length} {shownFamilies.length === 1 ? 'family' : 'families'} · {shownAlone.length} not linked to anybody
        </p>
        {graph.nodes.length === 0 ? (
          <p className="mt-3 text-body-sm text-on-surface-variant">{searching ? 'Nobody by that name.' : 'Nobody is on the app yet.'}</p>
        ) : (
          <div className="mt-3">
            <FamilyGraph graph={graph} label="Everybody in the church, and who is linked to whom" onOpen={onOpen} />
          </div>
        )}
      </QueryState>
    </div>
  )
}

function FamilyCard({ family }: { family: FamilyGroup }) {
  const anchor = groupAnchor(family)
  const title = groupTitle(family)
  const body = (
    <>
      <span className="block text-headline-md text-on-surface [overflow-wrap:anywhere]">{title}</span>
      <span className="mt-0.5 block font-mono text-label-sm text-on-surface-faint">{groupCount(family)}</span>
      <span className="mt-3 flex flex-wrap gap-1.5">
        {family.members.map((m) => (
          <span
            key={m.id}
            className={`max-w-full rounded-full px-2.5 py-1 text-label-md [overflow-wrap:anywhere] ${
              m.kind === 'adult' ? 'bg-raised-strong text-on-surface' : 'bg-raised text-on-surface-variant'
            }`}
          >
            {nameOf(m) || 'No name'}
            {/* Said in words, not by a colour: who has no account. */}
            {!m.user_id && <span className="text-on-surface-faint"> · written in</span>}
          </span>
        ))}
      </span>
    </>
  )
  return (
    <li aria-label={title}>
      {anchor?.user_id ? (
        <Link
          to={`/families?person=${anchor.user_id}`}
          aria-label={`${title}: open the family`}
          className="tap block h-full rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline hover:ring-1 hover:ring-secondary sm:p-5"
        >
          {body}
        </Link>
      ) : (
        <div className="h-full rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline sm:p-5">{body}</div>
      )}
    </li>
  )
}

function OneFamily({
  personId,
  people,
  families,
  loading,
  error,
  onOpen,
}: {
  personId: string
  people: PersonName[] | undefined
  families: Family[]
  loading: boolean
  error: unknown
  onOpen: (id: string) => void
}) {
  const person = people?.find((p) => p.id === personId)
  // The whole family they are in, in-laws and all (`combineFamilies`); somebody in none is drawn alone.
  const group = useMemo(
    () => combineFamilies(families).find((f) => f.members.some((m) => m.user_id === personId)),
    [families, personId],
  )
  const graph = useMemo(
    () => (person ? familyGraph(group?.households ?? [], group ? [] : [person]) : null),
    // `person` is found afresh each time; who they are is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group, person?.id, person?.first_name, person?.last_name],
  )
  const back = (
    <Link to="/families" className="tap hover:underline">
      <span aria-hidden="true">← </span>Families
    </Link>
  )
  if (!person) {
    return (
      <div>
        <PageHeader back={back} title="Families" />
        <QueryState isLoading={loading} error={error}>
          <p className="text-body-md text-on-surface-variant">That person is not on the app any more.</p>
        </QueryState>
      </div>
    )
  }
  const name = nameOf(person) || 'This person'
  const first = person.first_name || 'them'
  return (
    <div>
      <PageHeader
        back={back}
        title={`${name}’s family`}
        description={`Everybody ${first} is linked to, and everybody they are linked to in turn. What two people are to each other is written on the line between them. Press anybody with an account to open theirs.`}
      />
      <QueryState isLoading={loading} error={error}>
        {graph && <FamilyGraph graph={graph} label={`Family of ${name}`} focus={accountNode(person.id)} onOpen={onOpen} />}
        {!group && (
          <p className="mt-2 text-body-sm text-on-surface-variant">
            Nobody is linked to {first} yet. Add their husband or wife, a child, a parent, or a brother or sister below.
          </p>
        )}
      </QueryState>
      <div className="mt-6">
        <SectionTile
          title="Link or change"
          hint={`Link ${first} to the people on the app who are their family: they are linked straight away, with nobody having to confirm, and the family is told. Somebody not on the app yet can be written in by hand.`}
        >
          {/* A new person, a new panel: nothing half-typed for one family is carried to the next. */}
          <FamilyLinksPanel key={person.id} person={person} />
        </SectionTile>
      </div>
    </div>
  )
}
