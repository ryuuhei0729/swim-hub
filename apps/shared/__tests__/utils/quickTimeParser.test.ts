import { describe, expect, it } from 'vitest'

import {
  parseQuickTime,
  isQuickTimeFormat,
  defaultQuickTimeContext,
  QuickTimeContext
} from '../../utils/quickTimeParser'

describe('quickTimeParser', () => {
  // =============================================================================
  // parseQuickTime - 基本的な2パーツ入力
  // =============================================================================
  describe('parseQuickTime - 2パーツ入力（60秒未満）', () => {
    describe('正常系', () => {
      it('2桁秒-1桁小数をパースできる', () => {
        const result = parseQuickTime('31-2')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(31.20)
        expect(result!.context.tensDigit).toBe(3)
        expect(result!.context.minutes).toBe(0)
        expect(result!.displayValue).toBe('31.2')
      })

      it('2桁秒-2桁小数をパースできる', () => {
        const result = parseQuickTime('31-23')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(31.23)
        expect(result!.displayValue).toBe('31.2')
      })

      it('1桁秒-1桁小数をパースできる（十の位0）', () => {
        const result = parseQuickTime('5-3')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(5.30)
        expect(result!.context.tensDigit).toBe(0)
      })
    })

    describe('区切り文字のバリエーション', () => {
      it('ハイフン区切りをパースできる', () => {
        const result = parseQuickTime('31-2')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(31.20)
      })

      it('ドット区切りをパースできる', () => {
        const result = parseQuickTime('31.2')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(31.20)
      })

      it('「秒」区切りをパースできる', () => {
        const result = parseQuickTime('31秒2')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(31.20)
      })

      it('コロン区切りをパースできる', () => {
        const result = parseQuickTime('31:2')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(31.20)
      })

      it('全角コロン区切りをパースできる', () => {
        const result = parseQuickTime('31：2')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(31.20)
      })

      it('長音記号区切りをパースできる', () => {
        const result = parseQuickTime('31ー2')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(31.20)
      })
    })
  })

  // =============================================================================
  // parseQuickTime - 十の位の引き継ぎ
  // =============================================================================
  describe('parseQuickTime - 十の位の引き継ぎ', () => {
    describe('正常系', () => {
      it('1桁入力で十の位を引き継ぐ', () => {
        const prevContext: QuickTimeContext = { minutes: 0, tensDigit: 3 }
        const result = parseQuickTime('2-3', prevContext)
        expect(result).not.toBeNull()
        expect(result!.time).toBe(32.30)
        expect(result!.context.tensDigit).toBe(3)
      })

      it('連続した1桁入力で十の位を引き継ぐ', () => {
        const prevContext: QuickTimeContext = { minutes: 0, tensDigit: 3 }
        const result = parseQuickTime('8-4', prevContext)
        expect(result).not.toBeNull()
        expect(result!.time).toBe(38.40)
        expect(result!.context.tensDigit).toBe(3)
      })

      it('2桁入力で十の位を更新する', () => {
        const prevContext: QuickTimeContext = { minutes: 0, tensDigit: 3 }
        const result = parseQuickTime('46-1', prevContext)
        expect(result).not.toBeNull()
        expect(result!.time).toBe(46.10)
        expect(result!.context.tensDigit).toBe(4)
      })

      it('コンテキストなしの場合は十の位0として扱う', () => {
        const result = parseQuickTime('2-3')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(2.30)
        expect(result!.context.tensDigit).toBe(0)
      })
    })

    describe('ユースケース：連続入力シナリオ', () => {
      it('31-2 → 2-3 → 8-4 → 46-1 の連続入力', () => {
        // 1回目: 31-2 → 31.20秒
        const result1 = parseQuickTime('31-2')
        expect(result1!.time).toBe(31.20)
        expect(result1!.context.tensDigit).toBe(3)

        // 2回目: 2-3 → 32.30秒（十の位引き継ぎ）
        const result2 = parseQuickTime('2-3', result1!.context)
        expect(result2!.time).toBe(32.30)
        expect(result2!.context.tensDigit).toBe(3)

        // 3回目: 8-4 → 38.40秒（十の位引き継ぎ）
        const result3 = parseQuickTime('8-4', result2!.context)
        expect(result3!.time).toBe(38.40)
        expect(result3!.context.tensDigit).toBe(3)

        // 4回目: 46-1 → 46.10秒（十の位更新）
        const result4 = parseQuickTime('46-1', result3!.context)
        expect(result4!.time).toBe(46.10)
        expect(result4!.context.tensDigit).toBe(4)
      })
    })
  })

  // =============================================================================
  // parseQuickTime - 3パーツ入力（60秒以上）
  // =============================================================================
  describe('parseQuickTime - 3パーツ入力（60秒以上）', () => {
    describe('正常系', () => {
      it('分-秒-小数をパースできる', () => {
        const result = parseQuickTime('1-05-3')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(65.30)
        expect(result!.context.minutes).toBe(1)
        expect(result!.context.tensDigit).toBe(0)
      })

      it('分-秒-2桁小数をパースできる', () => {
        const result = parseQuickTime('1-05-30')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(65.30)
      })

      it('2分以上のタイムをパースできる', () => {
        const result = parseQuickTime('2-15-5')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(135.50)
        expect(result!.context.minutes).toBe(2)
        expect(result!.context.tensDigit).toBe(1)
      })
    })

    describe('区切り文字のバリエーション', () => {
      it('異なる区切り文字の組み合わせをパースできる', () => {
        const result = parseQuickTime('1:05.3')
        expect(result).not.toBeNull()
        expect(result!.time).toBe(65.30)
      })
    })
  })

  // =============================================================================
  // parseQuickTime - 60秒以上での引き継ぎ
  // =============================================================================
  describe('parseQuickTime - 60秒以上での引き継ぎ', () => {
    describe('正常系', () => {
      it('1-05-3の後、8-3で1-08-3になる', () => {
        // 1回目: 1-05-3 → 65.30秒
        const result1 = parseQuickTime('1-05-3')
        expect(result1!.time).toBe(65.30)
        expect(result1!.context.minutes).toBe(1)
        expect(result1!.context.tensDigit).toBe(0)

        // 2回目: 8-3 → 68.30秒（分と十の位を引き継ぎ）
        const result2 = parseQuickTime('8-3', result1!.context)
        expect(result2!.time).toBe(68.30)
        expect(result2!.context.minutes).toBe(1)
        expect(result2!.context.tensDigit).toBe(0)
      })

      it('1-05-3の後、12-2で1-12-2になる', () => {
        // 1回目: 1-05-3 → 65.30秒
        const result1 = parseQuickTime('1-05-3')
        expect(result1!.time).toBe(65.30)

        // 2回目: 12-2 → 72.20秒（2桁入力で十の位更新、分は引き継ぎ）
        const result2 = parseQuickTime('12-2', result1!.context)
        expect(result2!.time).toBe(72.20)
        expect(result2!.context.minutes).toBe(1)
        expect(result2!.context.tensDigit).toBe(1)
      })
    })

    describe('ユースケース：60秒以上の連続入力シナリオ', () => {
      it('1-05-3 → 8-3 → 12-2 → 2-05-1 の連続入力', () => {
        // 1回目: 1-05-3 → 65.30秒
        const result1 = parseQuickTime('1-05-3')
        expect(result1!.time).toBe(65.30)

        // 2回目: 8-3 → 68.30秒
        const result2 = parseQuickTime('8-3', result1!.context)
        expect(result2!.time).toBe(68.30)

        // 3回目: 12-2 → 72.20秒
        const result3 = parseQuickTime('12-2', result2!.context)
        expect(result3!.time).toBe(72.20)

        // 4回目: 2-05-1 → 125.10秒（3パーツなのでコンテキスト全更新）
        const result4 = parseQuickTime('2-05-1', result3!.context)
        expect(result4!.time).toBe(125.10)
        expect(result4!.context.minutes).toBe(2)
        expect(result4!.context.tensDigit).toBe(0)
      })
    })
  })

  // =============================================================================
  // parseQuickTime - 異常系
  // =============================================================================
  describe('parseQuickTime - 異常系', () => {
    it('空文字列はnullを返す', () => {
      expect(parseQuickTime('')).toBeNull()
      expect(parseQuickTime('   ')).toBeNull()
    })

    it('1パーツのみはnullを返す', () => {
      expect(parseQuickTime('31')).toBeNull()
    })

    it('4パーツ以上はnullを返す', () => {
      expect(parseQuickTime('1-2-3-4')).toBeNull()
    })

    it('数字以外の値はnullを返す', () => {
      expect(parseQuickTime('abc-def')).toBeNull()
    })
  })

  // =============================================================================
  // isQuickTimeFormat
  // =============================================================================
  describe('isQuickTimeFormat', () => {
    describe('正常系', () => {
      it('2パーツ形式はtrueを返す', () => {
        expect(isQuickTimeFormat('31-2')).toBe(true)
        expect(isQuickTimeFormat('31.2')).toBe(true)
        expect(isQuickTimeFormat('31秒2')).toBe(true)
      })

      it('3パーツ形式はtrueを返す', () => {
        expect(isQuickTimeFormat('1-05-3')).toBe(true)
        expect(isQuickTimeFormat('1:05.3')).toBe(true)
      })
    })

    describe('異常系', () => {
      it('空文字列はfalseを返す', () => {
        expect(isQuickTimeFormat('')).toBe(false)
      })

      it('1パーツはfalseを返す', () => {
        expect(isQuickTimeFormat('31')).toBe(false)
      })

      it('4パーツ以上はfalseを返す', () => {
        expect(isQuickTimeFormat('1-2-3-4')).toBe(false)
      })
    })
  })

  // =============================================================================
  // defaultQuickTimeContext
  // =============================================================================
  describe('defaultQuickTimeContext', () => {
    it('デフォルト値が正しい', () => {
      expect(defaultQuickTimeContext.minutes).toBe(0)
      expect(defaultQuickTimeContext.tensDigit).toBe(0)
    })
  })
})
