import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ValidationResult } from '../../components/team/shared/hooks/useTimeValidation'
import { useTimeValidation } from '../../components/team/shared/hooks/useTimeValidation'

describe('useTimeValidation', () => {
  describe('ValidationResult型', () => {
    it('ValidationResult型が正しい構造を持つ（valid）', () => {
      const result: ValidationResult = {
        isValid: true,
      }

      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('ValidationResult型が正しい構造を持つ（invalid）', () => {
      const result: ValidationResult = {
        isValid: false,
        error: 'タイムを入力してください',
      }

      expect(result.isValid).toBe(false)
      expect(result.error).toBe('タイムを入力してください')
    })
  })

  describe('parseTime', () => {
    describe('正常系', () => {
      it('MM:SS.ms形式をパースできる', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('1:23.45')).toBe(83.45)
        expect(result.current.parseTime('2:05.50')).toBe(125.5)
        expect(result.current.parseTime('0:30.00')).toBe(30.0)
      })

      it('SS.ms形式をパースできる', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('23.45')).toBe(23.45)
        expect(result.current.parseTime('59.99')).toBe(59.99)
        expect(result.current.parseTime('0.50')).toBe(0.5)
      })

      it('大きな分の値をパースできる', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('10:00.00')).toBe(600)
        expect(result.current.parseTime('59:59.99')).toBe(3599.99)
      })

      it('前後の空白をトリムする', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('  1:23.45  ')).toBe(83.45)
        expect(result.current.parseTime('\t23.45\n')).toBe(23.45)
      })

      it('整数秒をパースできる', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('30')).toBe(30)
        expect(result.current.parseTime('1:30')).toBe(90)
      })

      it('0秒をパースできる', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('0')).toBe(0)
        expect(result.current.parseTime('0.0')).toBe(0)
        expect(result.current.parseTime('0:00')).toBe(0)
        expect(result.current.parseTime('0:00.00')).toBe(0)
      })
    })

    describe('異常系', () => {
      it('空文字列はnullを返す', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('')).toBeNull()
        expect(result.current.parseTime('   ')).toBeNull()
      })

      it('無効な文字列はnullを返す', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('abc')).toBeNull()
        expect(result.current.parseTime('invalid')).toBeNull()
        expect(result.current.parseTime('1:2:3')).toBeNull() // コロンが2つ
      })

      it('負の値はnullを返す', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('-1:23.45')).toBeNull()
        expect(result.current.parseTime('-23.45')).toBeNull()
        expect(result.current.parseTime('1:-23.45')).toBeNull()
      })

      it('NaNを含む入力はnullを返す', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('NaN')).toBeNull()
        expect(result.current.parseTime('NaN:30.00')).toBeNull()
        expect(result.current.parseTime('1:NaN')).toBeNull()
      })

      it('Infinityを含む入力はnullを返す', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('Infinity')).toBeNull()
        expect(result.current.parseTime('Infinity:30.00')).toBeNull()
        expect(result.current.parseTime('1:Infinity')).toBeNull()
      })

      it('コロンが2つ以上ある場合はnullを返す', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('1:2:3')).toBeNull()
        expect(result.current.parseTime('1:2:3.45')).toBeNull()
        expect(result.current.parseTime('1:2:3:4')).toBeNull()
      })
    })

    describe('境界値', () => {
      it('0分0秒をパースできる', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('0:00.00')).toBe(0)
      })

      it('59分59.99秒をパースできる', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('59:59.99')).toBeCloseTo(3599.99)
      })

      it('小数点以下3桁以上もパースできる', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('1:23.456')).toBeCloseTo(83.456)
      })

      it('非常に小さい小数もパースできる', () => {
        const { result } = renderHook(() => useTimeValidation())

        expect(result.current.parseTime('0.001')).toBeCloseTo(0.001)
      })
    })
  })

  describe('validateTime', () => {
    describe('正常系', () => {
      it('有効なMM:SS.ms形式はisValid=true', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('1:23.45')

        expect(validation.isValid).toBe(true)
        expect(validation.error).toBeUndefined()
      })

      it('有効なSS.ms形式はisValid=true', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('23.45')

        expect(validation.isValid).toBe(true)
        expect(validation.error).toBeUndefined()
      })

      it('最大許容値の59分59秒はisValid=true', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('59:59.99')

        expect(validation.isValid).toBe(true)
      })

      it('0.01秒（0より大きい最小値）はisValid=true', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('0.01')

        expect(validation.isValid).toBe(true)
      })
    })

    describe('異常系 - 空の入力', () => {
      it('空文字列はエラー', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('')

        expect(validation.isValid).toBe(false)
        expect(validation.error).toBe('タイムを入力してください')
      })

      it('空白のみはエラー', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('   ')

        expect(validation.isValid).toBe(false)
        expect(validation.error).toBe('タイムを入力してください')
      })
    })

    describe('異常系 - 無効な形式', () => {
      it('無効な文字列はエラー', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('invalid')

        expect(validation.isValid).toBe(false)
        expect(validation.error).toBe('タイムの形式が正しくありません（例: 1:23.45 または 23.45）')
      })

      it('コロンが2つ以上はエラー', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('1:2:3')

        expect(validation.isValid).toBe(false)
        expect(validation.error).toBe('タイムの形式が正しくありません（例: 1:23.45 または 23.45）')
      })

      it('負の値はエラー', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('-1:23.45')

        expect(validation.isValid).toBe(false)
        expect(validation.error).toBe('タイムの形式が正しくありません（例: 1:23.45 または 23.45）')
      })
    })

    describe('異常系 - 境界値', () => {
      it('0秒はエラー', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('0')

        expect(validation.isValid).toBe(false)
        expect(validation.error).toBe('タイムは0より大きい必要があります')
      })

      it('0:00.00はエラー', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('0:00.00')

        expect(validation.isValid).toBe(false)
        expect(validation.error).toBe('タイムは0より大きい必要があります')
      })

      it('1時間を超えるタイムはエラー', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('60:00.01')

        expect(validation.isValid).toBe(false)
        expect(validation.error).toBe('タイムが大きすぎます')
      })

      it('ちょうど1時間はOK（3600秒以下はOK）', () => {
        const { result } = renderHook(() => useTimeValidation())

        // 60:00.00 = 3600秒、実装は > 3600 でチェックしているので3600秒はOK
        const validation = result.current.validateTime('60:00.00')

        expect(validation.isValid).toBe(true)
      })

      it('59分59.99秒はOK（1時間未満）', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('59:59.99')

        expect(validation.isValid).toBe(true)
      })
    })

    describe('エッジケース', () => {
      it('非常に小さい正の値はOK', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('0.001')

        expect(validation.isValid).toBe(true)
      })

      it('3600秒ちょうどはOK', () => {
        const { result } = renderHook(() => useTimeValidation())

        // 3600秒 = 60分 = 1時間、実装は > 3600 でチェックしているのでOK
        const validation = result.current.validateTime('3600')

        expect(validation.isValid).toBe(true)
      })

      it('3600.01秒はエラー', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('3600.01')

        expect(validation.isValid).toBe(false)
        expect(validation.error).toBe('タイムが大きすぎます')
      })

      it('3599.99秒はOK', () => {
        const { result } = renderHook(() => useTimeValidation())

        const validation = result.current.validateTime('3599.99')

        expect(validation.isValid).toBe(true)
      })
    })
  })

  describe('コールバックの安定性', () => {
    it('parseTimeは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() => useTimeValidation())

      const firstCallback = result.current.parseTime

      rerender()

      expect(result.current.parseTime).toBe(firstCallback)
    })

    it('validateTimeは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() => useTimeValidation())

      const firstCallback = result.current.validateTime

      rerender()

      expect(result.current.validateTime).toBe(firstCallback)
    })
  })

  describe('実際の水泳タイムのユースケース', () => {
    it('50m自由形の一般的なタイム', () => {
      const { result } = renderHook(() => useTimeValidation())

      // 世界記録レベル
      expect(result.current.validateTime('20.91').isValid).toBe(true)
      // 一般的な競泳タイム
      expect(result.current.validateTime('25.50').isValid).toBe(true)
      // 初心者レベル
      expect(result.current.validateTime('45.00').isValid).toBe(true)
    })

    it('100m自由形の一般的なタイム', () => {
      const { result } = renderHook(() => useTimeValidation())

      // 世界記録レベル
      expect(result.current.validateTime('46.86').isValid).toBe(true)
      // 一般的な競泳タイム
      expect(result.current.validateTime('55.50').isValid).toBe(true)
      // 初心者レベル
      expect(result.current.validateTime('1:30.00').isValid).toBe(true)
    })

    it('200m個人メドレーの一般的なタイム', () => {
      const { result } = renderHook(() => useTimeValidation())

      // 世界記録レベル
      expect(result.current.validateTime('1:54.00').isValid).toBe(true)
      // 一般的な競泳タイム
      expect(result.current.validateTime('2:15.00').isValid).toBe(true)
      // 初心者レベル
      expect(result.current.validateTime('3:30.00').isValid).toBe(true)
    })

    it('400m個人メドレーの一般的なタイム', () => {
      const { result } = renderHook(() => useTimeValidation())

      // 世界記録レベル
      expect(result.current.validateTime('4:02.50').isValid).toBe(true)
      // 一般的な競泳タイム
      expect(result.current.validateTime('4:45.00').isValid).toBe(true)
      // 初心者レベル
      expect(result.current.validateTime('6:30.00').isValid).toBe(true)
    })

    it('1500m自由形の一般的なタイム', () => {
      const { result } = renderHook(() => useTimeValidation())

      // 世界記録レベル
      expect(result.current.validateTime('14:31.02').isValid).toBe(true)
      // 一般的な競泳タイム
      expect(result.current.validateTime('16:30.00').isValid).toBe(true)
      // 初心者レベル
      expect(result.current.validateTime('25:00.00').isValid).toBe(true)
    })
  })

  describe('parseTimeとvalidateTimeの連携', () => {
    it('validateTimeが有効な場合、parseTimeも数値を返す', () => {
      const { result } = renderHook(() => useTimeValidation())

      const timeStr = '1:23.45'
      const validation = result.current.validateTime(timeStr)
      const parsed = result.current.parseTime(timeStr)

      expect(validation.isValid).toBe(true)
      expect(parsed).toBe(83.45)
    })

    it('validateTimeが無効な場合（空）、parseTimeはnull', () => {
      const { result } = renderHook(() => useTimeValidation())

      const timeStr = ''
      const validation = result.current.validateTime(timeStr)
      const parsed = result.current.parseTime(timeStr)

      expect(validation.isValid).toBe(false)
      expect(parsed).toBeNull()
    })

    it('validateTimeが無効な場合（形式エラー）、parseTimeはnull', () => {
      const { result } = renderHook(() => useTimeValidation())

      const timeStr = 'invalid'
      const validation = result.current.validateTime(timeStr)
      const parsed = result.current.parseTime(timeStr)

      expect(validation.isValid).toBe(false)
      expect(parsed).toBeNull()
    })

    it('parseTimeで0を返す場合、validateTimeは無効', () => {
      const { result } = renderHook(() => useTimeValidation())

      const timeStr = '0:00.00'
      const parsed = result.current.parseTime(timeStr)
      const validation = result.current.validateTime(timeStr)

      expect(parsed).toBe(0)
      expect(validation.isValid).toBe(false)
      expect(validation.error).toBe('タイムは0より大きい必要があります')
    })
  })
})
