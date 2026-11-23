import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/*
 * `scripts/hr` runs a command and prints its output through Headroom, so a
 * long output costs less of a conversation (AGENTS.md §12). These are the
 * promises it makes that do not need Headroom to be there, which are the
 * ones that matter most: a check run through it must still say whether it
 * passed, and nothing it printed may be lost. What Headroom itself does to
 * a log or a table is its own, and was measured by hand.
 */

const script = resolve(import.meta.dirname, '../../scripts/hr')
const python = spawnSync('python3', ['--version']).status === 0

/** Run it on a machine with no Headroom: a home folder with nothing in it. */
const hr = (args: string[], input?: string) => {
  const home = mkdtempSync(join(tmpdir(), 'hr-home-'))
  const kept = mkdtempSync(join(tmpdir(), 'hr-kept-'))
  const ran = spawnSync('python3', [script, ...args], { input, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, HR_DIR: kept, HEADROOM_OFFLINE: 'mine' } })
  return { ...ran, kept }
}

describe.skipIf(!python)('scripts/hr, where Headroom is not installed', () => {
  it('is there to run', () => {
    expect(existsSync(script)).toBe(true)
  })

  it('prints what the command printed, as it came, and says once how to install Headroom', () => {
    const ran = hr(['printf', 'one\\ntwo\\n'])
    expect(ran.stdout).toBe('one\ntwo\n')
    expect(ran.stderr).toMatch(/headroom is not installed here.*uv tool install .*headroom-ai==/)
    expect(ran.status).toBe(0)
  })

  it('exits with the command’s own exit code: a failed check still fails', () => {
    const ran = hr(['echo broken; exit 3'])
    expect(ran.stdout).toBe('broken\n')
    expect(ran.status).toBe(3)
  })

  it('takes what the command wrote to stderr too, in the order it was written', () => {
    const ran = hr(['echo out; echo err 1>&2; echo out again'])
    expect(ran.stdout).toBe('out\nerr\nout again\n')
  })

  it('reads what is piped in when it is given no command', () => {
    const ran = hr([], 'piped in\n')
    expect(ran.stdout).toBe('piped in\n')
    expect(ran.status).toBe(0)
  })

  it('keeps the whole output in a file whatever it prints', () => {
    const ran = hr(['echo kept'])
    const files = spawnSync('ls', [ran.kept], { encoding: 'utf8' }).stdout.trim().split('\n')
    expect(files).toHaveLength(1)
    expect(readFileSync(join(ran.kept, files[0]), 'utf8')).toBe('kept\n')
  })

  it('takes the colour codes out, which are nothing but length', () => {
    const ran = hr(['printf', '\\033[31mred\\033[0m\\n'])
    expect(ran.stdout).toBe('red\n')
  })

  it('gives the command the environment it was given, not the one Headroom is run with', () => {
    const ran = hr(['echo "offline=$HEADROOM_OFFLINE beacon=$HEADROOM_BEACON again=$HR_AGAIN"'])
    expect(ran.stdout).toBe('offline=mine beacon= again=\n')
  })

  it('says so when there is no such command', () => {
    const ran = hr(['no-such-command-here'])
    expect(ran.status).toBe(127)
    expect(ran.stderr).toMatch(/no such command: no-such-command-here/)
  })
})
