import { describe, expect, it } from 'vitest'
import { deriveSlug, isValidSlug } from '@/lib/slug'

describe('deriveSlug', () => {
  it('lowercases and hyphenates words', () => {
    expect(deriveSlug('ACME Corp')).toBe('acme-corp')
  })

  it('collapses runs of separators and punctuation', () => {
    expect(deriveSlug('Foo   Bar // Baz!!')).toBe('foo-bar-baz')
  })

  it('strips leading and trailing separators', () => {
    expect(deriveSlug('  --Acme--  ')).toBe('acme')
  })

  it('strips diacritics', () => {
    expect(deriveSlug('Café Zürich')).toBe('cafe-zurich')
  })

  it('returns empty string for names with no usable characters', () => {
    expect(deriveSlug('!!! ***')).toBe('')
  })

  it('caps length at 64 characters without a trailing hyphen', () => {
    const derived = deriveSlug(`${'a'.repeat(63)} tail`)
    expect(derived.length).toBeLessThanOrEqual(64)
    expect(derived.endsWith('-')).toBe(false)
  })
})

describe('isValidSlug', () => {
  it('accepts server-pattern slugs', () => {
    expect(isValidSlug('acme')).toBe(true)
    expect(isValidSlug('acme-corp-2')).toBe(true)
  })

  it('rejects slugs that are too short, cased, or mis-delimited', () => {
    expect(isValidSlug('ab')).toBe(false)
    expect(isValidSlug('Acme')).toBe(false)
    expect(isValidSlug('-acme')).toBe(false)
    expect(isValidSlug('acme-')).toBe(false)
    expect(isValidSlug('a'.repeat(65))).toBe(false)
  })
})
