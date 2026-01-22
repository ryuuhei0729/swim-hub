import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useTimeInput } from '../../components/forms/shared/TimeInput/hooks/useTimeInput'

describe('useTimeInput', () => {
  describe('parseTime', () => {
    describe('正常系', () => {
      it('MM:SS.ms形式をパースできる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.parseTime('1:23.45')).toBe(83.45)
        expect(result.current.parseTime('2:05.50')).toBe(125.5)
        expect(result.current.parseTime('0:30.00')).toBe(30.0)
      })

      it('SS.ms形式をパースできる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.parseTime('23.45')).toBe(23.45)
        expect(result.current.parseTime('59.99')).toBe(59.99)
        expect(result.current.parseTime('0.50')).toBe(0.5)
      })

      it('大きな分の値をパースできる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.parseTime('10:00.00')).toBe(600)
        expect(result.current.parseTime('59:59.99')).toBeCloseTo(3599.99)
      })

      it('前後の空白をトリムする', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.parseTime('  1:23.45  ')).toBe(83.45)
        expect(result.current.parseTime('\t23.45\n')).toBe(23.45)
      })

      it('整数秒をパースできる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.parseTime('30')).toBe(30)
        expect(result.current.parseTime('1:30')).toBe(90)
      })

      it('末尾のsをトリミングできる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.parseTime('23.45s')).toBe(23.45)
        expect(result.current.parseTime('30s')).toBe(30)
      })
    })

    describe('異常系', () => {
      it('空文字列は0を返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.parseTime('')).toBe(0)
        expect(result.current.parseTime('   ')).toBe(0)
      })

      it('無効な文字列は0を返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.parseTime('abc')).toBe(0)
        expect(result.current.parseTime('invalid')).toBe(0)
      })

      it('コロンが2つ以上ある場合は0を返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.parseTime('1:2:3')).toBe(0)
      })

      it('負の値は0を返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.parseTime('-1:23.45')).toBe(0)
        expect(result.current.parseTime('-23.45')).toBe(0)
      })
    })

    describe('境界値', () => {
      it('0をパースできる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.parseTime('0')).toBe(0)
        expect(result.current.parseTime('0.0')).toBe(0)
        expect(result.current.parseTime('0:00')).toBe(0)
        expect(result.current.parseTime('0:00.00')).toBe(0)
      })

      it('小数点以下3桁以上もパースできる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.parseTime('1:23.456')).toBeCloseTo(83.456)
      })

      it('非常に小さい小数もパースできる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.parseTime('0.001')).toBeCloseTo(0.001)
      })
    })
  })

  describe('formatTime', () => {
    describe('正常系', () => {
      it('0秒は"0.00"を返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTime(0)).toBe('0.00')
      })

      it('1分未満の秒数をMM:SS.ms形式でフォーマットする', () => {
        const { result } = renderHook(() => useTimeInput())

        // formatTimeFullは常に分を表示する
        expect(result.current.formatTime(23.45)).toBe('0:23.45')
        expect(result.current.formatTime(59.99)).toBe('0:59.99')
      })

      it('1分以上の秒数をMM:SS.ms形式でフォーマットする', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTime(83.45)).toBe('1:23.45')
        expect(result.current.formatTime(125.5)).toBe('2:05.50')
        expect(result.current.formatTime(600)).toBe('10:00.00')
      })

      it('秒部分が10未満の場合は0パディングする', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTime(65.42)).toBe('1:05.42')
        expect(result.current.formatTime(61.01)).toBe('1:01.01')
      })
    })

    describe('異常系', () => {
      it('負の値は"0:00.00"を返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTime(-1)).toBe('0:00.00')
        expect(result.current.formatTime(-100)).toBe('0:00.00')
      })

      it('Infinityは"0:00.00"を返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTime(Infinity)).toBe('0:00.00')
        expect(result.current.formatTime(-Infinity)).toBe('0:00.00')
      })

      it('NaNは"0:00.00"を返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTime(NaN)).toBe('0:00.00')
      })
    })

    describe('境界値', () => {
      it('0.01秒をフォーマットできる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTime(0.01)).toBe('0:00.01')
      })

      it('59分59.99秒をフォーマットできる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTime(3599.99)).toBe('59:59.99')
      })

      it('1時間（3600秒）をフォーマットできる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTime(3600)).toBe('60:00.00')
      })
    })
  })

  describe('formatTimeShort', () => {
    describe('正常系', () => {
      it('0秒は空文字を返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTimeShort(0)).toBe('')
      })

      it('1分未満の秒数をSS.ms形式でフォーマットする', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTimeShort(23.45)).toBe('23.45')
        expect(result.current.formatTimeShort(59.99)).toBe('59.99')
      })

      it('1分以上の秒数をMM:SS.ms形式でフォーマットする', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTimeShort(83.45)).toBe('1:23.45')
        expect(result.current.formatTimeShort(125.5)).toBe('2:05.50')
        expect(result.current.formatTimeShort(600)).toBe('10:00.00')
      })

      it('秒部分が10未満の場合は0パディングする', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTimeShort(65.42)).toBe('1:05.42')
      })
    })

    describe('異常系', () => {
      it('負の値は空文字を返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTimeShort(-1)).toBe('')
        expect(result.current.formatTimeShort(-100)).toBe('')
      })

      it('Infinityは空文字を返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTimeShort(Infinity)).toBe('')
        expect(result.current.formatTimeShort(-Infinity)).toBe('')
      })

      it('NaNは空文字を返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTimeShort(NaN)).toBe('')
      })
    })

    describe('境界値', () => {
      it('0.01秒をフォーマットできる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTimeShort(0.01)).toBe('0.01')
      })

      it('59.99秒（1分未満の最大値）をフォーマットできる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTimeShort(59.99)).toBe('59.99')
      })

      it('60秒ちょうどはMM:SS.ms形式になる', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.formatTimeShort(60)).toBe('1:00.00')
      })
    })
  })

  describe('validateTime', () => {
    describe('正常系', () => {
      it('正の秒数はtrueを返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.validateTime(0.01)).toBe(true)
        expect(result.current.validateTime(1)).toBe(true)
        expect(result.current.validateTime(83.45)).toBe(true)
        expect(result.current.validateTime(3600)).toBe(true)
      })

      it('24時間以内の大きな値はtrueを返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.validateTime(86400)).toBe(true)
      })
    })

    describe('異常系', () => {
      it('0秒はfalseを返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.validateTime(0)).toBe(false)
      })

      it('負の値はfalseを返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.validateTime(-1)).toBe(false)
        expect(result.current.validateTime(-100)).toBe(false)
      })

      it('24時間を超える値はfalseを返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.validateTime(86401)).toBe(false)
        expect(result.current.validateTime(100000)).toBe(false)
      })

      it('Infinityはfalseを返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.validateTime(Infinity)).toBe(false)
        expect(result.current.validateTime(-Infinity)).toBe(false)
      })

      it('NaNはfalseを返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.validateTime(NaN)).toBe(false)
      })
    })

    describe('境界値', () => {
      it('0.001秒（0より大きい最小値）はtrueを返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.validateTime(0.001)).toBe(true)
      })

      it('86400秒（24時間ちょうど）はtrueを返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.validateTime(86400)).toBe(true)
      })

      it('86400.01秒（24時間を少し超える）はfalseを返す', () => {
        const { result } = renderHook(() => useTimeInput())

        expect(result.current.validateTime(86400.01)).toBe(false)
      })
    })
  })

  describe('コールバックの安定性', () => {
    it('parseTimeは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() => useTimeInput())

      const firstCallback = result.current.parseTime

      rerender()

      expect(result.current.parseTime).toBe(firstCallback)
    })

    it('formatTimeは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() => useTimeInput())

      const firstCallback = result.current.formatTime

      rerender()

      expect(result.current.formatTime).toBe(firstCallback)
    })

    it('formatTimeShortは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() => useTimeInput())

      const firstCallback = result.current.formatTimeShort

      rerender()

      expect(result.current.formatTimeShort).toBe(firstCallback)
    })

    it('validateTimeは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() => useTimeInput())

      const firstCallback = result.current.validateTime

      rerender()

      expect(result.current.validateTime).toBe(firstCallback)
    })
  })

  describe('parseTimeとformatTimeの相互変換', () => {
    it('パースしてフォーマットすると元の値に近い文字列を返す', () => {
      const { result } = renderHook(() => useTimeInput())

      const original = '1:23.45'
      const parsed = result.current.parseTime(original)
      const formatted = result.current.formatTime(parsed)

      expect(formatted).toBe('1:23.45')
    })

    it('フォーマットしてパースすると元の値に戻る', () => {
      const { result } = renderHook(() => useTimeInput())

      const original = 83.45
      const formatted = result.current.formatTime(original)
      const parsed = result.current.parseTime(formatted)

      expect(parsed).toBeCloseTo(original)
    })
  })

  describe('実際の水泳タイムのユースケース', () => {
    it('50m自由形の一般的なタイム', () => {
      const { result } = renderHook(() => useTimeInput())

      // 世界記録レベル
      expect(result.current.parseTime('20.91')).toBeCloseTo(20.91)
      expect(result.current.validateTime(20.91)).toBe(true)
      // 一般的な競泳タイム
      expect(result.current.parseTime('25.50')).toBeCloseTo(25.5)
      expect(result.current.validateTime(25.5)).toBe(true)
    })

    it('100m自由形の一般的なタイム', () => {
      const { result } = renderHook(() => useTimeInput())

      // 世界記録レベル
      expect(result.current.parseTime('46.86')).toBeCloseTo(46.86)
      expect(result.current.validateTime(46.86)).toBe(true)
      // 初心者レベル
      expect(result.current.parseTime('1:30.00')).toBe(90)
      expect(result.current.validateTime(90)).toBe(true)
    })

    it('400m個人メドレーの一般的なタイム', () => {
      const { result } = renderHook(() => useTimeInput())

      // 世界記録レベル
      expect(result.current.parseTime('4:02.50')).toBeCloseTo(242.5)
      expect(result.current.validateTime(242.5)).toBe(true)
    })

    it('1500m自由形の一般的なタイム', () => {
      const { result } = renderHook(() => useTimeInput())

      // 世界記録レベル
      expect(result.current.parseTime('14:31.02')).toBeCloseTo(871.02)
      expect(result.current.validateTime(871.02)).toBe(true)
    })
  })
})
