import { describe, expect, it } from 'vitest'
import { humanError } from './humanError'
import { NO_ANSWER, TOOK_TOO_LONG, isNetworkFailure, noAnswerText } from './networkFailure'
import { errorMessage } from './errorMessage'
import { RequestTimeoutError } from './fetchTimeout'

const duplicateRota = {
  code: '23505',
  message:
    'duplicate key value violates unique constraint "rota_assignments_one_role_per_service"',
}
const duplicateCoordinator = {
  code: '23505',
  message:
    'duplicate key value violates unique constraint "rota_assignments_one_coordinator_per_team"',
}
const ourRule = { code: 'P0001', message: 'Only the team head can change a count' }
const rlsRefusal = {
  code: '42501',
  message: 'new row violates row-level security policy for table "messages"',
}

describe('humanError', () => {
  it('explains the rule to someone who is not an Admin', () => {
    const text = humanError(duplicateRota, 'Could not assign that role.', false)
    expect(text).toContain('one role per service')
    expect(text).not.toContain('duplicate key')
  })

  it('gives an Admin the raw message as well', () => {
    const text = humanError(duplicateRota, 'Could not assign that role.', true)
    expect(text).toContain('one role per service')
    expect(text).toContain('rota_assignments_one_role_per_service')
  })

  it('names Coordinator as the exception, since that is the rule people trip on', () => {
    const text = humanError(duplicateRota, 'Could not assign that role.', false)
    expect(text).toContain('apart from Team Coordinator')
  })

  it('tells a second Coordinator apart from a second job', () => {
    const text = humanError(duplicateCoordinator, 'Could not assign that role.', false)
    expect(text).toContain('Coordinator for this service')
    expect(text).not.toContain('duplicate key')
  })

  it('passes our own function messages through untouched — they are already for people', () => {
    expect(humanError(ourRule, 'fallback', false)).toBe('Only the team head can change a count')
    expect(humanError(ourRule, 'fallback', true)).toBe('Only the team head can change a count')
  })

  it('reads a permission refusal as permission, not as SQL', () => {
    expect(humanError(rlsRefusal, 'fallback', false)).toBe("You don't have permission to do that.")
  })

  it('falls back rather than showing an unknown database error to a volunteer', () => {
    const odd = { code: 'XX000', message: 'internal wibble' }
    expect(humanError(odd, 'Could not save that.', false)).toBe('Could not save that.')
    expect(humanError(odd, 'Could not save that.', true)).toBe('internal wibble')
  })
})

/*
 * A request that got no answer. The Supabase client passes a failed fetch
 * on as an object: the error's name and message run together, and the
 * browser's stack as `details` — which the raw view for Admins used to put
 * on the page in full, script addresses and all.
 */
describe('a request that got no answer', () => {
  const stack = 'TypeError: Failed to fetch\n    at https://app.example/assets/useErrorText-DZ-yeTal.js:11:61517\n    at d (https://app.example/assets/useErrorText-DZ-yeTal.js:11:60503)'
  const asTheClientHandsItOn = { message: 'TypeError: Failed to fetch', details: stack, hint: '', code: '' }
  const timedOut = { message: `RequestTimeoutError: ${new RequestTimeoutError().message}`, details: 'RequestTimeoutError: …\n    at …', hint: '', code: '' }

  it('is one plain sentence, the same for an Admin as for anybody', () => {
    expect(humanError(asTheClientHandsItOn, 'Could not post message.', true)).toBe(NO_ANSWER)
    expect(humanError(asTheClientHandsItOn, 'Could not post message.', false)).toBe(NO_ANSWER)
  })

  it('never shows the stack', () => {
    for (const admin of [true, false]) {
      const text = humanError(asTheClientHandsItOn, 'Could not post message.', admin)
      expect(text).not.toMatch(/assets\/|\.js|TypeError/)
    }
    expect(errorMessage(asTheClientHandsItOn, 'Could not load.')).toBe(NO_ANSWER)
  })

  it('says it took too long when it was the app’s own deadline', () => {
    expect(humanError(timedOut, 'Could not save.', false)).toBe(TOOK_TOO_LONG)
    expect(humanError(new RequestTimeoutError(), 'Could not save.', true)).toBe(TOOK_TOO_LONG)
  })

  it('is known in each browser’s words, thrown or handed on', () => {
    for (const said of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
      expect(noAnswerText(new TypeError(said)), said).toBe(NO_ANSWER)
      expect(noAnswerText({ message: `TypeError: ${said}`, details: '', hint: '', code: '' }), said).toBe(NO_ANSWER)
    }
    expect(isNetworkFailure({ message: 'AbortError: The operation was aborted.', details: '', hint: 'Request was aborted (timeout or manual cancellation)', code: '' })).toBe(true)
  })

  it('leaves every other error as it was', () => {
    expect(noAnswerText({ code: '23505', message: 'duplicate key value violates unique constraint "songs_pkey"' })).toBeNull()
    expect(noAnswerText(new Error('Only the team head can change a count'))).toBeNull()
    expect(humanError(ourRule, 'Could not save.', true)).toBe('Only the team head can change a count')
    expect(errorMessage({ message: 'permission denied for table songs', details: 'x' }, 'f')).toBe('permission denied for table songs — x')
  })
})
