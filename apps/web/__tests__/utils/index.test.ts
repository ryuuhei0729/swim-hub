import { describe, it, expect, vi } from 'vitest'
import { cn, sleep, generateId, capitalize, truncate } from '@/utils'

describe('utils/index', () => {
  it('cn should join truthy class names', () => {
    const result = cn('foo', false, undefined, 'bar', null, 'baz')
    expect(result).toBe('foo bar baz')
  })

  it('sleep should resolve after specified milliseconds', async () => {
    vi.useFakeTimers()

    const promise = sleep(500)
    vi.advanceTimersByTime(500)

    await expect(promise).resolves.toBeUndefined()
    vi.useRealTimers()
  })

  it('generateId should produce stable format when Math.random is mocked', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789)

    const id = generateId()
    expect(id).toHaveLength(9)
    expect(id).toMatch(/^[a-z0-9]+$/)

    randomSpy.mockRestore()
  })

  it('capitalize should capitalize first character', () => {
    expect(capitalize('swim')).toBe('Swim')
    expect(capitalize('S')).toBe('S')
  })

  it('truncate should shorten long strings and keep shorter strings intact', () => {
    expect(truncate('short', 10)).toBe('short')
    expect(truncate('abcdefghijkl', 5)).toBe('abcde...')
  })
})


