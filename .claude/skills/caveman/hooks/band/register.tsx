import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Band, Level, Tally } from '../../types'

/*
 * The caveman band: a row above the prompt that switches caveman's modes and
 * shows what they save, the way ponytail's band does for ponytail.
 *
 * Upstream keeps the mode with Node hooks that run on every prompt. Those are
 * not installed here (see SOURCE.md), so this module is the whole mechanism:
 * the level lives in the session's state, and the mode's own SKILL.md is what
 * the model is given, once per switch, beside the next prompt. Later prompts
 * carry one line saying the mode is still on. Nothing is added to the system
 * prompt, so switching never throws away the session's prompt cache.
 */

const LEVELS: readonly Level[] = ['off', 'caveman', 'ultracave', 'megacave']
const NO_TALLY: Tally = { turns: 0, output: 0 }
const OFF: Level = 'off'
const EMPTY: Band = { level: 'off', told: 'off', details: false, stats: false, on: NO_TALLY, off: NO_TALLY }

const band = atom({ plugin: 'caveman', key: 'band' } as const, EMPTY)
// State kept by an older version of the band lacks newer fields.
const load = async ($: EngineInterface): Promise<Band> => ({ ...EMPTY, ...(await read($, band)) })

const isLevel = (value: unknown): value is Level => typeof value === 'string' && (LEVELS as readonly string[]).includes(value)

/** A skill's instructions without its front matter. */
const body = (skill: string) => skill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()

/** The mode's rules as its skill states them: the one copy, read when a switch has to be said. */
async function rulesOf($: EngineInterface, level: Level): Promise<string> {
  try {
    return body(await $.fs.read(`${$.plugin.root}/skills/${level}/SKILL.md`))
  } catch {
    return ''
  }
}

/** What rides beside the next prompt for the model: the rules on a switch, one line after. */
async function noteFor($: EngineInterface, b: Band): Promise<string | undefined> {
  if (b.level === 'off') {
    return b.told === 'off' ? undefined : 'Caveman mode was switched off from the caveman panel. Write in your normal voice again.'
  }
  if (b.told === b.level) {
    return `Caveman mode "${b.level}" is still on (switched from the caveman panel). Keep to its rules.`
  }
  const rules = await rulesOf($, b.level)
  if (rules === '') return `Caveman mode "${b.level}" is on (switched from the caveman panel). Follow the ${b.level} skill.`
  return `The person switched replies to caveman mode "${b.level}" from the caveman panel. Follow these rules in every reply until told the mode is off:\n\n${rules}`
}

/** `/caveman ultra` and `/caveman wenyan` are the other two modes by another name. */
function levelFromCommand(command: string, args: string): Level | undefined {
  const name = command.split(':').pop() ?? command
  const first = args.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  if (name === 'ultracave') return 'ultracave'
  if (name === 'megacave') return 'megacave'
  if (name !== 'caveman') return undefined
  if (first === 'status' || first === 'help') return undefined
  if (first === 'off' || first === 'stop') return 'off'
  if (first === 'ultra') return 'ultracave'
  if (first === 'wenyan') return 'megacave'
  return 'caveman'
}

const average = (t: Tally) => (t.turns > 0 ? t.output / t.turns : 0)
const tokens = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`)

/** Share of output tokens a turn saves with a mode on, once both kinds of turn have been seen. */
function saving(b: Band): number | undefined {
  if (b.on.turns === 0 || b.off.turns === 0 || average(b.off) === 0) return undefined
  return Math.round((1 - average(b.on) / average(b.off)) * 100)
}

/** The figures as lines of text: what the Stats row and `/caveman-stats` both say. */
function statsLines(b: Band): string[] {
  const saved = saving(b)
  return [
    `Caveman mode: ${b.level}`,
    `With a mode on: ${b.on.turns} ${b.on.turns === 1 ? 'turn' : 'turns'}, ${tokens(b.on.output)} output tokens${b.on.turns > 0 ? `, ${tokens(average(b.on))} a turn` : ''}`,
    `With it off: ${b.off.turns} ${b.off.turns === 1 ? 'turn' : 'turns'}, ${tokens(b.off.output)} output tokens${b.off.turns > 0 ? `, ${tokens(average(b.off))} a turn` : ''}`,
    saved === undefined
      ? 'Saving: not measurable yet. It needs at least one turn with a mode on and one with it off in this session.'
      : `Saving: ${saved}% fewer output tokens a turn, measured in this session. The turns differ, so read it as a guide.`,
  ]
}

const MODE_COMMANDS = ['caveman', 'ultracave', 'megacave', 'caveman:caveman', 'caveman:ultracave', 'caveman:megacave']
const STATS_COMMAND = 'caveman-stats'

export const register: Register = on => {
  // A new session starts where the person left the panel; nothing has been said to the model yet.
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get('level').catch(() => undefined)
    const details = (await $.store.get('details').catch(() => undefined)) === true
    await update($, band, b => ({ ...EMPTY, ...b, level: isLevel(stored) ? stored : (b.level ?? OFF), told: OFF, details }))
    await $.command.register({ name: STATS_COMMAND, description: 'Output tokens with caveman on and off in this session, as measured.' }).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  // /clear empties the thread: the model has to be told the mode again.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, band, b => ({ ...EMPTY, ...b, told: OFF, on: NO_TALLY, off: NO_TALLY }))
    return next(e)
  }).catch(($, e, next) => next(e))

  // The mode travels beside the prompt, never in the system prompt.
  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    let b = await load($)
    // "stop caveman" and "normal mode" are how the skills say a person turns it off by hand.
    if (b.level !== 'off' && /^(stop caveman|normal mode)[.!]?$/i.test(text)) {
      b = await update($, band, x => ({ ...EMPTY, ...x, level: OFF }))
      await $.store.set('level', 'off').catch(() => undefined)
    }
    if (text === '' || text.startsWith('/')) return next(e)
    const note = await noteFor($, b)
    if (note === undefined) return next(e)
    const entered = await next({ ...e, context: [...(e.context ?? []), note] })
    if (entered.drop === undefined) await update($, band, x => ({ ...EMPTY, ...x, told: b.level }))
    return entered
  }).catch(($, e, next) => next(e))

  // A mode switched by typing its command shows on the band too; the skill it loads says the rules itself.
  on('command.run', { command: MODE_COMMANDS }, async ($, e, next) => {
    const level = levelFromCommand(e.command, e.args)
    if (level !== undefined) {
      await update($, band, b => ({ ...EMPTY, ...b, level, told: level === 'off' ? b.told : level }))
      await $.store.set('level', level).catch(() => undefined)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: STATS_COMMAND }, async $ => ({ text: statsLines(await load($)).join('\n') })).catch(($, e, next) => next(e))

  // Only the main thread's turns: a subagent answers a brief, not the person.
  on('turn.complete', async ($, e, next) => {
    const output = e.usage?.output_tokens
    if (e.agentId === undefined && output !== undefined && !e.isAborted) {
      await update($, band, x => {
        const b = { ...EMPTY, ...x }
        const add = (t: Tally) => ({ turns: t.turns + 1, output: t.output + output })
        return b.level === 'off' ? { ...b, off: add(b.off) } : { ...b, on: add(b.on) }
      })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    // Other mods share this slot (ponytail's band): theirs is drawn below, not replaced.
    // next(e) rejects only when nothing answers beneath (the test harness): the band still draws.
    const below = await next(e).catch(() => undefined)
    const b = await load($)

    const setLevel = async (level: Level) => {
      await update($, band, x => ({ ...EMPTY, ...x, level }))
      await $.store.set('level', level).catch(() => undefined)
      $.ui.toast(level === 'off' ? 'Caveman off from the next prompt' : `Caveman: ${level} from the next prompt`)
    }
    const toggleDetails = async () => {
      await update($, band, x => ({ ...EMPTY, ...x, details: !b.details }))
      await $.store.set('details', !b.details).catch(() => undefined)
    }
    const toggleStats = () => update($, band, x => ({ ...EMPTY, ...x, details: true, stats: !(b.details && b.stats) }))
    // The same command a person types, under whichever name this session lists it by.
    const runSkill = async (skill: string) => {
      const names = (await $.command.list().catch(() => [])).map(c => c.name)
      const command = [`caveman:${skill}`, skill].find(name => names.includes(name))
      if (command === undefined) {
        $.ui.toast(`The ${skill} skill is not loaded in this session`)
        return
      }
      await $.command.run({ command }).catch(() => $.ui.toast(`Could not run /${command} just now`))
    }
    const commit = () => runSkill('caveman-commit')
    const review = () => runSkill('caveman-review')

    const { Box, Text, Button } = $.ui.resolve(e)
    // bodyColumns counts terminal cells; a graphical surface lays its own row out.
    const width = e.surface === 'terminal' ? e.props.bodyColumns : undefined
    const stack = (mine: NonNullable<typeof below>) => (below ? <Box flexDirection="column">{mine}{below}</Box> : mine)
    const saved = saving(b)

    if (!b.details) {
      return stack(
        <Box flexDirection="row" alignItems="center" gap={2} width={width}>
          <Button key="cave-level" plain onPress={toggleDetails}>
            <Text color={b.level === 'off' ? 'inactive' : 'suggestion'}>●</Text> {b.level === 'off' ? 'caveman off' : b.level}
          </Button>
          {saved !== undefined && <Text dimColor>{saved}% fewer output tokens</Text>}
          <Box flexGrow={1} />
          <Button key="cave-commit" plain label="Commit" onPress={commit} />
          <Button key="cave-review" plain label="Review" onPress={review} />
          <Button key="cave-stats" plain label="Stats" onPress={toggleStats} />
          <Button key="cave-details" plain label="Details" onPress={toggleDetails} />
        </Box>,
      )
    }

    return stack(
      <Box flexDirection="column" width={width}>
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Text bold>caveman</Text>
          {LEVELS.map(level => (
            <Button
              key={`cave-level-${level}`}
              label={level}
              {...(level === b.level ? { variant: 'primary' as const } : { plain: true as const, dimColor: true })}
              onPress={() => setLevel(level)}
            />
          ))}
          <Box flexGrow={1} />
          <Button key="cave-commit" plain label="Commit" onPress={commit} />
          <Button key="cave-review" plain label="Review" onPress={review} />
          <Button key="cave-stats" label="Stats" {...(b.stats ? { variant: 'primary' as const } : { plain: true as const })} onPress={toggleStats} />
          <Button key="cave-details" plain label="Compact" onPress={toggleDetails} />
        </Box>
        {b.stats && (
          <Box flexDirection="column">
            {statsLines(b)
              .slice(1)
              .map((line, i) => (
                <Text key={`cave-stat-${i}`} dimColor wrap="truncate-end">
                  {line}
                </Text>
              ))}
          </Box>
        )}
      </Box>,
    )
  }).catch(($, e, next) => next(e))
}
