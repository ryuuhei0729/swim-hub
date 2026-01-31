import { describe, expect, it } from 'vitest'
import {
  formatSecondsToDisplay,
  parseTimeToSeconds,
} from '../../components/forms/record-log/utils/formatters'

describe('formatSecondsToDisplay', () => {
  describe('正常系: 通常の秒数', () => {
    it('整数秒を正しくフォーマットする', () => {
      expect(formatSecondsToDisplay(30)).toBe('30.00')
      expect(formatSecondsToDisplay(45)).toBe('45.00')
    })

    it('小数秒を正しくフォーマットする', () => {
      expect(formatSecondsToDisplay(30.5)).toBe('30.50')
      expect(formatSecondsToDisplay(45.12)).toBe('45.12')
      expect(formatSecondsToDisplay(59.99)).toBe('59.99')
    })

    it('60秒以上の場合はM:SS.ss形式でフォーマットする', () => {
      expect(formatSecondsToDisplay(60)).toBe('1:00.00')
      expect(formatSecondsToDisplay(65.5)).toBe('1:05.50')
      expect(formatSecondsToDisplay(125.5)).toBe('2:05.50')
      expect(formatSecondsToDisplay(185.99)).toBe('3:05.99')
    })

    it('10秒未満の場合padStartで0埋めされる', () => {
      expect(formatSecondsToDisplay(5)).toBe('05.00')
      expect(formatSecondsToDisplay(5.5)).toBe('05.50')
      expect(formatSecondsToDisplay(9.99)).toBe('09.99')
    })

    it('60秒以上で秒部分が10未満の場合も正しくパディングされる', () => {
      expect(formatSecondsToDisplay(61)).toBe('1:01.00')
      expect(formatSecondsToDisplay(65.05)).toBe('1:05.05')
      expect(formatSecondsToDisplay(120.01)).toBe('2:00.01')
    })
  })

  describe('エッジケース: 0, undefined, null', () => {
    it('seconds === 0 の場合は空文字を返す', () => {
      expect(formatSecondsToDisplay(0)).toBe('')
    })

    it('seconds が undefined の場合は空文字を返す', () => {
      expect(formatSecondsToDisplay(undefined)).toBe('')
    })

    it('引数なしの場合は空文字を返す', () => {
      expect(formatSecondsToDisplay()).toBe('')
    })
  })

  describe('エッジケース: 負の数', () => {
    it('負の秒数の場合は空文字を返す', () => {
      expect(formatSecondsToDisplay(-1)).toBe('')
      expect(formatSecondsToDisplay(-30.5)).toBe('')
      expect(formatSecondsToDisplay(-100)).toBe('')
    })
  })

  describe('境界値テスト', () => {
    it('59.99秒（60秒未満の境界）は分なし形式', () => {
      expect(formatSecondsToDisplay(59.99)).toBe('59.99')
    })

    it('60秒（60秒ちょうどの境界）は分あり形式', () => {
      expect(formatSecondsToDisplay(60)).toBe('1:00.00')
    })

    it('0.01秒（最小の正の値）', () => {
      expect(formatSecondsToDisplay(0.01)).toBe('00.01')
    })

    it('小数点以下3桁以上の場合は2桁に丸められる', () => {
      expect(formatSecondsToDisplay(30.125)).toBe('30.13') // 四捨五入
      expect(formatSecondsToDisplay(30.124)).toBe('30.12')
      expect(formatSecondsToDisplay(30.999)).toBe('31.00')
    })
  })
})

describe('parseTimeToSeconds', () => {
  describe('正常系: 秒数のみの形式', () => {
    it('整数秒をパースする', () => {
      expect(parseTimeToSeconds('30')).toBe(30)
      expect(parseTimeToSeconds('45')).toBe(45)
    })

    it('小数秒をパースする', () => {
      expect(parseTimeToSeconds('30.5')).toBe(30.5)
      expect(parseTimeToSeconds('45.12')).toBe(45.12)
      expect(parseTimeToSeconds('59.99')).toBe(59.99)
    })
  })

  describe('正常系: 分:秒.小数 形式', () => {
    it('M:SS.ss形式をパースする', () => {
      expect(parseTimeToSeconds('1:00.00')).toBe(60)
      expect(parseTimeToSeconds('1:05.50')).toBe(65.5)
      expect(parseTimeToSeconds('2:05.50')).toBe(125.5)
      expect(parseTimeToSeconds('3:05.99')).toBe(185.99)
    })

    it('分のみで秒が0の場合', () => {
      expect(parseTimeToSeconds('1:00')).toBe(60)
      expect(parseTimeToSeconds('2:00')).toBe(120)
    })

    it('分が0で秒のみの場合', () => {
      expect(parseTimeToSeconds('0:30.5')).toBe(30.5)
      expect(parseTimeToSeconds('0:05.00')).toBe(5)
    })
  })

  describe('エッジケース: 空文字, undefined, null', () => {
    it('空文字の場合は0を返す', () => {
      expect(parseTimeToSeconds('')).toBe(0)
    })

    it('空白のみの場合は0を返す', () => {
      expect(parseTimeToSeconds('   ')).toBe(0)
      expect(parseTimeToSeconds('\t')).toBe(0)
    })
  })

  describe('エッジケース: 不正な入力', () => {
    it('数値以外の文字列の場合は0を返す', () => {
      expect(parseTimeToSeconds('abc')).toBe(0)
      expect(parseTimeToSeconds('invalid')).toBe(0)
    })

    it('コロンのみの場合は0を返す', () => {
      expect(parseTimeToSeconds(':')).toBe(0)
    })

    it('部分的に無効な入力の場合', () => {
      // 柔軟パーサーは数字以外を区切りとして扱うため、数字部分のみ抽出
      expect(parseTimeToSeconds('abc:30')).toBe(30) // 'abc'は無視、'30'のみ
      expect(parseTimeToSeconds('1:abc')).toBe(1) // '1'のみ抽出
    })
  })

  describe('往復変換テスト（formatSecondsToDisplay と parseTimeToSeconds）', () => {
    it('formatSecondsToDisplay の出力を parseTimeToSeconds でパースして元の値に戻る', () => {
      const testValues = [30, 45.5, 60, 65.5, 125.5, 185.99]

      testValues.forEach((original) => {
        const formatted = formatSecondsToDisplay(original)
        const parsed = parseTimeToSeconds(formatted)
        expect(parsed).toBeCloseTo(original, 2)
      })
    })
  })
})
