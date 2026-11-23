import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { FitFigure, PageHeader, SectionTile, Statistic, Tile, inputClasses } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { FamilyTree } from '../components/FamilyTree'
import { FamilyLinksPanel } from '../components/FamilyLinksDialog'
import { familyOfKey, fetchFamilyOf } from '../lib/familyLinks'
import {
  FAMILIES_KEY,
  PEOPLE_NAMES_KEY,
  anchorOf,
  familyCount,
  familyMatches,
  familyTitle,
  fetchFamilies,
  fetchPeopleNames,
  nameMatches,
  nameOf,
  onTheirOwn,
  type Family,
  type PersonName,
} from '../lib/families'

/**
 * Families (0326): every family the church has linked, who is still on
 * their own, and one family drawn as a tree with the box that links more
 * people to it.
 *
 * The Owner asked (November 2026) for "a page for seeing and linking
 * families", "node based (like org chart) view of that family", and to
 * "search and link accounts together". Until now a family was reached one
 * person at a time, from a button on their card on Volunteers.
 *
 * For whoever holds `people.family` (Admins and the Owner out of the
 * box). What it shows is names: the accounts, and the people written in
 * by hand. A family's address, and a child's date of birth and school,
 * stay with the family and `people.contacts`.
 *
 * One page, two views, told apart by the address: `/families` is
 * everybody, `/families?person=<id>` is that person's family. So a tree
 * can be linked to, the back button works, and pressing somebody in a
 * tree is just going to theirs.
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
        loading={people.isLoading}
        error={people.error}
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
  const shownFamilies = families.filter((f) => familyMatches(f, typed))
  const shownAlone = alone.filter((p) => nameMatches(nameOf(p), typed))
  const linked = people.length - alone.length
  const searching = typed.trim() !== ''

  return (
    <div>
      <PageHeader
        title="Families"
        description="Who is linked to whom: husbands and wives, children and parents. Find anybody, see their family as a tree, and link accounts together."
      />

      <QueryState isLoading={loading} error={error}>
        <div className="grid grid-cols-3 gap-3">
          <Tile className="@container min-w-0">
            <Statistic className="flex-col" value={<FitFigure>{families.length}</FitFigure>} unit={families.length === 1 ? 'family' : 'families'} />
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
            Everybody with an account who is in no family yet. Choose one to link them to their husband or wife, children or parents.
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
                    <span className="shrink-0 text-label-md font-medium text-primary">Link</span>
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

function FamilyCard({ family }: { family: Family }) {
  const anchor = anchorOf(family)
  const title = familyTitle(family)
  const body = (
    <>
      <span className="block text-headline-md text-on-surface [overflow-wrap:anywhere]">{title}</span>
      <span className="mt-0.5 block font-mono text-label-sm text-on-surface-faint">{familyCount(family)}</span>
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
  loading,
  error,
  onOpen,
}: {
  personId: string
  people: PersonName[] | undefined
  loading: boolean
  error: unknown
  onOpen: (id: string) => void
}) {
  const person = people?.find((p) => p.id === personId)
  const family = useQuery({ queryKey: familyOfKey(personId), queryFn: () => fetchFamilyOf(personId), enabled: !!person })
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
        description={`Their parents above, ${first} beside their husband or wife, their children below. Press anybody with an account to see the tree from them.`}
      />
      <QueryState isLoading={family.isLoading} error={family.error}>
        {family.data && <FamilyTree person={person} family={family.data} onOpen={onOpen} />}
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
