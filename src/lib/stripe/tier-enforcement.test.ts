import { describe, it, expect } from 'vitest'
import {
  canCreateProject,
  canIngestSignal,
  canUseVoice,
  canUseFeature,
} from './tier-enforcement'

// ---------------------------------------------------------------------------
// canCreateProject
// ---------------------------------------------------------------------------
describe('canCreateProject', () => {
  describe('free tier', () => {
    it('allows when 0 projects exist', () => {
      expect(canCreateProject('free', 0)).toEqual({ allowed: true })
    })

    it('blocks at 1 project (limit)', () => {
      const result = canCreateProject('free', 1)
      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.upgradeRequired).toBe('pro')
        expect(result.reason).toContain('1 project')
      }
    })

    it('blocks above limit', () => {
      const result = canCreateProject('free', 5)
      expect(result.allowed).toBe(false)
    })
  })

  describe('pro tier', () => {
    it('allows with 0 projects', () => {
      expect(canCreateProject('pro', 0)).toEqual({ allowed: true })
    })

    it('allows with 2 projects', () => {
      expect(canCreateProject('pro', 2)).toEqual({ allowed: true })
    })

    it('blocks at 3 projects (limit)', () => {
      const result = canCreateProject('pro', 3)
      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.upgradeRequired).toBe('autonomous')
        expect(result.reason).toContain('3 projects')
      }
    })
  })

  describe('autonomous tier', () => {
    it('never blocks (Infinity limit)', () => {
      expect(canCreateProject('autonomous', 0)).toEqual({ allowed: true })
      expect(canCreateProject('autonomous', 100)).toEqual({ allowed: true })
      expect(canCreateProject('autonomous', 999999)).toEqual({ allowed: true })
    })
  })
})

// ---------------------------------------------------------------------------
// canIngestSignal
// ---------------------------------------------------------------------------
describe('canIngestSignal', () => {
  describe('free tier', () => {
    it('allows under 100', () => {
      expect(canIngestSignal('free', 0)).toEqual({ allowed: true })
      expect(canIngestSignal('free', 99)).toEqual({ allowed: true })
    })

    it('blocks at 100', () => {
      const result = canIngestSignal('free', 100)
      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.upgradeRequired).toBe('pro')
        expect(result.reason).toContain('100')
      }
    })
  })

  describe('pro tier', () => {
    it('allows under 10000', () => {
      expect(canIngestSignal('pro', 0)).toEqual({ allowed: true })
      expect(canIngestSignal('pro', 9999)).toEqual({ allowed: true })
    })

    it('blocks at 10000', () => {
      const result = canIngestSignal('pro', 10000)
      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.upgradeRequired).toBe('autonomous')
        expect(result.reason).toContain('10000')
      }
    })
  })

  describe('autonomous tier', () => {
    it('never blocks (Infinity limit)', () => {
      expect(canIngestSignal('autonomous', 0)).toEqual({ allowed: true })
      expect(canIngestSignal('autonomous', 999999)).toEqual({ allowed: true })
    })
  })
})

// ---------------------------------------------------------------------------
// canUseVoice
// ---------------------------------------------------------------------------
describe('canUseVoice', () => {
  it('blocks free tier (0 limit)', () => {
    const result = canUseVoice('free')
    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.upgradeRequired).toBe('pro')
      expect(result.reason).toContain('Voice companion requires Pro')
    }
  })

  it('allows pro tier', () => {
    expect(canUseVoice('pro')).toEqual({ allowed: true })
  })

  it('allows autonomous tier', () => {
    expect(canUseVoice('autonomous')).toEqual({ allowed: true })
  })
})

// ---------------------------------------------------------------------------
// canUseFeature
// ---------------------------------------------------------------------------
describe('canUseFeature', () => {
  describe('free tier', () => {
    it('blocks autoImplement', () => {
      const result = canUseFeature('free', 'autoImplement')
      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.upgradeRequired).toBe('pro')
      }
    })

    it('blocks autoApprove', () => {
      const result = canUseFeature('free', 'autoApprove')
      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.upgradeRequired).toBe('autonomous')
      }
    })

    it('blocks autoMerge', () => {
      const result = canUseFeature('free', 'autoMerge')
      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.upgradeRequired).toBe('autonomous')
      }
    })

    it('blocks posthog', () => {
      const result = canUseFeature('free', 'posthog')
      expect(result.allowed).toBe(false)
    })

    it('blocks sentry', () => {
      const result = canUseFeature('free', 'sentry')
      expect(result.allowed).toBe(false)
    })
  })

  describe('pro tier', () => {
    it('allows autoImplement', () => {
      expect(canUseFeature('pro', 'autoImplement')).toEqual({ allowed: true })
    })

    it('blocks autoApprove', () => {
      const result = canUseFeature('pro', 'autoApprove')
      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.upgradeRequired).toBe('autonomous')
      }
    })

    it('blocks autoMerge', () => {
      const result = canUseFeature('pro', 'autoMerge')
      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.upgradeRequired).toBe('autonomous')
      }
    })

    it('allows posthog', () => {
      expect(canUseFeature('pro', 'posthog')).toEqual({ allowed: true })
    })

    it('allows sentry', () => {
      expect(canUseFeature('pro', 'sentry')).toEqual({ allowed: true })
    })
  })

  describe('autonomous tier', () => {
    it('allows autoImplement', () => {
      expect(canUseFeature('autonomous', 'autoImplement')).toEqual({ allowed: true })
    })

    it('allows autoApprove', () => {
      expect(canUseFeature('autonomous', 'autoApprove')).toEqual({ allowed: true })
    })

    it('allows autoMerge', () => {
      expect(canUseFeature('autonomous', 'autoMerge')).toEqual({ allowed: true })
    })

    it('allows posthog', () => {
      expect(canUseFeature('autonomous', 'posthog')).toEqual({ allowed: true })
    })

    it('allows sentry', () => {
      expect(canUseFeature('autonomous', 'sentry')).toEqual({ allowed: true })
    })
  })
})
