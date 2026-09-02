import { describe, expect, it } from 'vitest'
import { BUILD_ID_PLACEHOLDER, resolveBuildId, stampServiceWorker } from './swBuildId.ts'

describe('stampServiceWorker', () => {
  it('writes the id in where the placeholder was', () => {
    const out = stampServiceWorker(`const BUILD_ID = '${BUILD_ID_PLACEHOLDER}'`, 'abc123')
    expect(out).toBe("const BUILD_ID = 'abc123'")
  })

  it('stops the build when the placeholder has gone', () => {
    // The bug this guards against shipped silently for eighty-four
    // deploys. If it ever comes back it should come back loudly.
    expect(() => stampServiceWorker("const BUILD_ID = 'hardcoded'", 'abc123')).toThrow(
      /byte-identical between deploys/,
    )
  })
})

describe('resolveBuildId', () => {
  it('takes the commit the host is building, when it says', () => {
    expect(resolveBuildId({ VERCEL_GIT_COMMIT_SHA: '0123456789abcdef' })).toBe('0123456789ab')
  })

  it('is the same twice for one commit, so a redeploy prompts nobody', () => {
    const env = { GITHUB_SHA: 'fedcba9876543210' }
    expect(resolveBuildId(env)).toBe(resolveBuildId(env))
  })

  it('still changes every build when there is no commit to be had', () => {
    // A timestamp is a worse id than a sha and a far better one than a
    // constant: the file has to differ, or none of this works.
    const noGit = { PATH: '/nonexistent' }
    expect(resolveBuildId(noGit)).toMatch(/^(t[a-z0-9]+|[0-9a-f]{12})$/)
  })
})
