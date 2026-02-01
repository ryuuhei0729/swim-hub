import { describe, expect, it } from 'vitest'

import { normalizeRelation, normalizeRelationArray } from '../../utils/supabase-helpers'

describe('supabase-helpers', () => {
  describe('normalizeRelation', () => {
    it('単一オブジェクトをそのまま返す', () => {
      const obj = { id: 1, name: 'test' }
      expect(normalizeRelation(obj)).toEqual(obj)
    })

    it('配列の場合は最初の要素を返す', () => {
      const arr = [{ id: 1, name: 'first' }, { id: 2, name: 'second' }]
      expect(normalizeRelation(arr)).toEqual({ id: 1, name: 'first' })
    })

    it('空配列の場合はnullを返す', () => {
      expect(normalizeRelation([])).toBe(null)
    })

    it('nullの場合はnullを返す', () => {
      expect(normalizeRelation(null)).toBe(null)
    })

    it('undefinedの場合はnullを返す', () => {
      expect(normalizeRelation(undefined)).toBe(null)
    })

    it('1要素の配列の場合はその要素を返す', () => {
      const arr = [{ id: 1, name: 'only' }]
      expect(normalizeRelation(arr)).toEqual({ id: 1, name: 'only' })
    })
  })

  describe('normalizeRelationArray', () => {
    it('配列をそのまま返す', () => {
      const arr = [{ id: 1 }, { id: 2 }]
      expect(normalizeRelationArray(arr)).toEqual(arr)
    })

    it('単一オブジェクトを1要素の配列にラップして返す', () => {
      const obj = { id: 1, name: 'test' }
      expect(normalizeRelationArray(obj)).toEqual([obj])
    })

    it('nullの場合は空配列を返す', () => {
      expect(normalizeRelationArray(null)).toEqual([])
    })

    it('undefinedの場合は空配列を返す', () => {
      expect(normalizeRelationArray(undefined)).toEqual([])
    })

    it('空配列の場合は空配列を返す', () => {
      expect(normalizeRelationArray([])).toEqual([])
    })
  })
})
