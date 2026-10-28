import { useState } from 'react'
import { ownRuleCount, type TeamOverrides } from '../lib/permissions'
import { Select } from './Select'
import { ActionButton, Tile } from './Surface'

/**
 * "Copy Worship's rules to Media": one team's own rules (0162) made
 * another's, every page at once — as a draft, so the page says what
 * saving would do before anything changes. A team with no rules of its
 * own copies as "as the church" everywhere.
 */
export function CopyTeamRules({
  teams,
  rules,
  onCopy,
}: {
  teams: readonly { id: string; name: string }[]
  /** Every team's own rules, as the draft has them. */
  rules: TeamOverrides
  onCopy: (from: string, to: string) => void
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  if (teams.length < 2) return null
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? 'that team'
  const options = teams.map((t) => ({ value: t.id, label: t.name }))
  const count = from ? ownRuleCount(rules, from) : 0
  return (
    <Tile as="section">
      <h2 className="text-body-md font-medium text-on-surface">Copy one team’s rules to another</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        Every rule a team has set for itself, on every page, made another team’s — replacing that team’s own. As a
        draft: the changes, and who they move, show below before you save.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          aria-label="Copy the rules of"
          value={from}
          placeholder="From…"
          onChange={(v) => {
            setFrom(v)
            setCopied(null)
          }}
          options={options}
        />
        <span className="text-body-sm text-on-surface-variant">to</span>
        <Select
          aria-label="Copy them to"
          value={to}
          placeholder="To…"
          onChange={(v) => {
            setTo(v)
            setCopied(null)
          }}
          options={options.filter((o) => o.value !== from)}
        />
        <ActionButton
          tone="quiet"
          size="sm"
          disabled={!from || !to || from === to}
          onClick={() => {
            onCopy(from, to)
            setCopied(`${nameOf(from)}’s rules are now ${nameOf(to)}’s, in the draft.`)
          }}
        >
          Copy
        </ActionButton>
      </div>
      {from && (
        <p className="mt-2 text-label-md text-on-surface-faint">
          {count === 0
            ? `${nameOf(from)} has no rules of its own: copying makes ${to ? nameOf(to) : 'the other team'} follow the church everywhere.`
            : `${nameOf(from)} has ${count === 1 ? 'one rule' : `${count} rules`} of its own.`}
        </p>
      )}
      {copied && (
        <p role="status" className="mt-2 text-label-md text-on-surface-variant">
          {copied}
        </p>
      )}
    </Tile>
  )
}
