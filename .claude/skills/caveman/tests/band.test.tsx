import { expect, mock, test } from 'claude-code/testing'

// The band as the engine asks for it: the row above the prompt.
const BAND = {
  plugin: 'caveman',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

// The session's start is where the band reads what the person left it on.
async function start($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1]) {
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}

const TURN = { answer: 'ok', durationMs: 1000, isAborted: false, reason: 'answer' as const }
const usage = (output: number) => ({ model: 'm', input_tokens: 1, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })

test('the band shows the four levels and the four actions, on every surface', async ($, on) => {
  mock.store(on, { details: true })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    for (const level of ['off', 'caveman', 'ultracave', 'megacave']) {
      expect(await ui.find({ key: `cave-level-${level}` })).toBeDefined()
    }
    for (const action of ['commit', 'review', 'stats', 'details']) {
      expect(await ui.find({ key: `cave-${action}` })).toBeDefined()
    }
    // The last action folds the band back to one line, as ponytail's does.
    expect((await ui.find({ key: 'cave-details' }))?.props.label).toBe('Compact')
    await ui.unmount()
  }
})

test('it starts off and in its one-line form, and Details opens it', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'cave-level' }))?.text).toContain('caveman off')
  expect(await ui.find({ key: 'cave-level-ultracave' })).toBeUndefined()
  await ui.press({ key: 'cave-details' })
  expect(await ui.find({ key: 'cave-level-ultracave' })).toBeDefined()
  await ui.unmount()
})

test('a switch is said once beside the next prompt, then one line, then that it is off', async ($, on) => {
  mock.store(on, { details: true })
  const read: string[] = []
  on('fs.read', (_, e) => {
    read.push(e.path)
    return { value: '---\nname: ultracave\n---\n\nFragments. Payload only.' }
  })
  const entered: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    entered.push(e.context)
    return { text: e.text, context: e.context }
  })
  await start($, on)

  // Off, never switched: the prompt goes in as typed.
  await $.prompt.submit({ text: 'hello' })
  expect(entered[0]).toBeUndefined()

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'cave-level-ultracave' })

  await $.prompt.submit({ text: 'why is the build red?' })
  expect(read[0]).toContain('/skills/ultracave/SKILL.md')
  expect(entered[1]?.[0]).toContain('caveman mode "ultracave"')
  // The skill's rules, without its front matter.
  expect(entered[1]?.[0]).toContain('Fragments. Payload only.')
  expect(entered[1]?.[0]).not.toContain('name: ultracave')

  await $.prompt.submit({ text: 'and the tests?' })
  expect(entered[2]?.[0]).toContain('still on')
  expect(entered[2]?.[0]).not.toContain('Fragments')

  // A slash command carries nothing: the command is not a question to answer in the mode.
  await $.prompt.submit({ text: '/status' })
  expect(entered[3]).toBeUndefined()

  await ui.press({ key: 'cave-level-off' })
  await $.prompt.submit({ text: 'thanks' })
  expect(entered[4]?.[0]).toContain('switched off')
  await $.prompt.submit({ text: 'one more' })
  expect(entered[5]).toBeUndefined()
  await ui.unmount()
})

test('"stop caveman" typed by hand turns it off', async ($, on) => {
  mock.store(on, { details: true, level: 'caveman' })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.read', () => ({ value: 'Answer first.' }))
  on('prompt.submit', (_, e) => ({ text: e.text, context: e.context }))
  // The level the person left the panel on comes back with the session.
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'cave-level-caveman' }))?.props.variant).toBe('primary')
  await $.prompt.submit({ text: 'stop caveman' })
  await ui.unmount()

  const after = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await after.find({ key: 'cave-level-off' }))?.props.variant).toBe('primary')
  await after.unmount()
})

test('typing a mode command moves the band', async ($, on) => {
  mock.store(on, { details: true })
  on('command.run', () => ({ text: '' }))
  await start($, on)
  await $.command.run({ command: 'caveman', args: 'ultra' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'cave-level-ultracave' }))?.props.variant).toBe('primary')
  await ui.unmount()

  // Asking for the status changes nothing.
  await $.command.run({ command: 'caveman:caveman', args: 'status' })
  const same = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await same.find({ key: 'cave-level-ultracave' }))?.props.variant).toBe('primary')
  await same.unmount()
})

test('Stats reports what was measured, and no saving until both kinds of turn exist', async ($, on) => {
  mock.store(on, { details: true })
  on('turn.complete', () => ({ text: 'ok' }))
  on('command.run', () => ({ text: 'beneath' }))
  await start($, on)

  await $.turn.complete({ ...TURN, turnId: 't1', usage: usage(3000) })
  await $.turn.complete({ ...TURN, turnId: 't2', usage: usage(1000) })
  // A subagent's turn is not the person's answer: it is not counted.
  await $.turn.complete({ ...TURN, turnId: 't3', agentId: 'a1', usage: usage(9000) })

  let report = (await $.command.run({ command: 'caveman-stats' })).text ?? ''
  expect(report).toContain('With it off: 2 turns, 4.0k output tokens, 2.0k a turn')
  expect(report).toContain('not measurable yet')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'cave-level-caveman' })
  await $.turn.complete({ ...TURN, turnId: 't4', usage: usage(500) })

  report = (await $.command.run({ command: 'caveman-stats' })).text ?? ''
  expect(report).toContain('With a mode on: 1 turn, 500 output tokens, 500 a turn')
  expect(report).toContain('Saving: 75% fewer output tokens a turn')

  // The Stats button shows the same lines under the row.
  await ui.press({ key: 'cave-stats' })
  expect(await ui.find({ type: 'Text', text: /75% fewer output tokens a turn/ })).toBeDefined()
  await ui.unmount()
})

test('Commit and Review run the skill under the name this session lists it by', async ($, on) => {
  mock.store(on, { details: true })
  const ran: string[] = []
  on('command.list', () => ({
    value: [
      { name: 'caveman:caveman-commit', description: '', source: 'plugin' as const },
      { name: 'caveman-review', description: '', source: 'user' as const },
    ],
  }))
  on('command.run', (_, e) => {
    ran.push(e.command)
    return { text: '' }
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'cave-commit' })
  await ui.press({ key: 'cave-review' })
  expect(ran).toEqual(['caveman:caveman-commit', 'caveman-review'])
  await ui.unmount()
})
