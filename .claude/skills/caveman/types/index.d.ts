// What the caveman band keeps for the session.

export type Level = 'off' | 'caveman' | 'ultracave' | 'megacave'

/** Turns counted, and the output tokens they cost. */
export type Tally = { turns: number; output: number }

export type Band = {
  /** The mode replies are written in. */
  level: Level
  /** The mode the model was last told about in this thread, so a switch is said once. */
  told: Level
  /** Whether the band shows its full row (levels and actions) or the one-line form. */
  details: boolean
  /** Whether the measured figures are shown under the full row. */
  stats: boolean
  /** Main-thread turns answered with a mode on. */
  on: Tally
  /** Main-thread turns answered with it off: the baseline the saving is measured against. */
  off: Tally
}

declare module 'claude-code' {
  interface PluginState {
    caveman: { band: Band }
  }
}
