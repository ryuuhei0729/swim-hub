import { describe, expect, it } from 'vitest'

import { addMonthsImmutable, formatDate, formatDateTime, getMonthDateRange, toISODateString } from '../../utils/date'

describe('date utilities', () => {
  describe('formatDate', () => {
    describe('正常系', () => {
      it('文字列の日付をshortスタイルでフォーマットする', () => {
        expect(formatDate('2024-01-29')).toBe('1月29日')
      })

      it('Dateオブジェクトをshortスタイルでフォーマットする', () => {
        expect(formatDate(new Date(2024, 0, 29))).toBe('1月29日')
      })

      it('longスタイルでフォーマットする', () => {
        expect(formatDate('2024-01-29', 'long')).toBe('2024年1月29日')
      })

      it('longWithWeekdayスタイルでフォーマットする', () => {
        expect(formatDate('2024-01-29', 'longWithWeekday')).toBe('2024年1月29日(月)')
      })

      it('shortWithWeekdayスタイルでフォーマットする', () => {
        expect(formatDate('2024-01-29', 'shortWithWeekday')).toBe('1月29日(月)')
      })

      it('numericスタイルでフォーマットする', () => {
        expect(formatDate('2024-01-29', 'numeric')).toBe('2024/01/29')
      })

      it('isoスタイルでフォーマットする', () => {
        expect(formatDate('2024-01-29', 'iso')).toBe('2024-01-29')
      })
    })

    describe('異常系', () => {
      it('nullの場合は"-"を返す', () => {
        expect(formatDate(null)).toBe('-')
      })

      it('undefinedの場合は"-"を返す', () => {
        expect(formatDate(undefined)).toBe('-')
      })

      it('無効な日付文字列の場合は"-"を返す', () => {
        expect(formatDate('invalid-date')).toBe('-')
      })

      it('空文字の場合は"-"を返す', () => {
        expect(formatDate('')).toBe('-')
      })
    })
  })

  describe('toISODateString', () => {
    it('Dateを yyyy-MM-dd 形式に変換する', () => {
      expect(toISODateString(new Date(2024, 0, 29))).toBe('2024-01-29')
    })

    it('月と日が1桁の場合もゼロパディングされる', () => {
      expect(toISODateString(new Date(2024, 0, 5))).toBe('2024-01-05')
    })

    it('無効なDateの場合は空文字を返す', () => {
      expect(toISODateString(new Date('invalid'))).toBe('')
    })
  })

  describe('addMonthsImmutable', () => {
    it('月を加算した新しいDateを返す', () => {
      const original = new Date(2024, 0, 15)
      const result = addMonthsImmutable(original, 1)
      expect(result.getFullYear()).toBe(2024)
      expect(result.getMonth()).toBe(1)
      expect(result.getDate()).toBe(15)
    })

    it('元のDateは変更されない', () => {
      const original = new Date(2024, 0, 15)
      addMonthsImmutable(original, 3)
      expect(original.getMonth()).toBe(0)
    })

    it('年をまたぐ加算ができる', () => {
      const original = new Date(2024, 10, 15) // 11月
      const result = addMonthsImmutable(original, 3)
      expect(result.getFullYear()).toBe(2025)
      expect(result.getMonth()).toBe(1) // 2月
    })

    it('マイナス値で減算できる', () => {
      const original = new Date(2024, 5, 15) // 6月
      const result = addMonthsImmutable(original, -2)
      expect(result.getMonth()).toBe(3) // 4月
    })
  })

  describe('formatDateTime', () => {
    describe('正常系', () => {
      it('文字列の日時をlongスタイルでフォーマットする', () => {
        expect(formatDateTime('2024-01-29T14:30:00')).toBe('2024年1月29日 14:30')
      })

      it('Dateオブジェクトをlongスタイルでフォーマットする', () => {
        expect(formatDateTime(new Date(2024, 0, 29, 14, 30))).toBe('2024年1月29日 14:30')
      })

      it('shortスタイルでフォーマットする', () => {
        expect(formatDateTime('2024-01-29T14:30:00', 'short')).toBe('1/29 14:30')
      })
    })

    describe('異常系', () => {
      it('nullの場合は"-"を返す', () => {
        expect(formatDateTime(null)).toBe('-')
      })

      it('undefinedの場合は"-"を返す', () => {
        expect(formatDateTime(undefined)).toBe('-')
      })

      it('無効な日時文字列の場合は"-"を返す', () => {
        expect(formatDateTime('invalid-datetime')).toBe('-')
      })
    })
  })
  describe('getMonthDateRange', () => {
    describe('正常系', () => {
      it('1月の範囲を正しく計算する', () => {
        const [start, end] = getMonthDateRange(2024, 1)
        expect(start).toBe('2024-01-01')
        expect(end).toBe('2024-01-31')
      })

      it('2月の範囲を正しく計算する（通常年）', () => {
        const [start, end] = getMonthDateRange(2023, 2)
        expect(start).toBe('2023-02-01')
        expect(end).toBe('2023-02-28')
      })

      it('2月の範囲を正しく計算する（うるう年）', () => {
        const [start, end] = getMonthDateRange(2024, 2)
        expect(start).toBe('2024-02-01')
        expect(end).toBe('2024-02-29')
      })

      it('4月の範囲を正しく計算する（30日の月）', () => {
        const [start, end] = getMonthDateRange(2024, 4)
        expect(start).toBe('2024-04-01')
        expect(end).toBe('2024-04-30')
      })

      it('12月の範囲を正しく計算する', () => {
        const [start, end] = getMonthDateRange(2024, 12)
        expect(start).toBe('2024-12-01')
        expect(end).toBe('2024-12-31')
      })
    })

    describe('境界値', () => {
      it('年末の月（12月）を正しく処理する', () => {
        const [start, end] = getMonthDateRange(2024, 12)
        expect(start).toBe('2024-12-01')
        expect(end).toBe('2024-12-31')
      })

      it('年始の月（1月）を正しく処理する', () => {
        const [start, end] = getMonthDateRange(2025, 1)
        expect(start).toBe('2025-01-01')
        expect(end).toBe('2025-01-31')
      })
    })

    describe('うるう年の判定', () => {
      it('100年ごとのうるう年でない年を正しく処理する', () => {
        // 1900年はうるう年ではない（100で割り切れるが400で割り切れない）
        const [start, end] = getMonthDateRange(1900, 2)
        expect(start).toBe('1900-02-01')
        expect(end).toBe('1900-02-28')
      })

      it('400年ごとのうるう年を正しく処理する', () => {
        // 2000年はうるう年（400で割り切れる）
        const [start, end] = getMonthDateRange(2000, 2)
        expect(start).toBe('2000-02-01')
        expect(end).toBe('2000-02-29')
      })

      it('4年ごとのうるう年を正しく処理する', () => {
        // 2024年はうるう年（4で割り切れる）
        const [start, end] = getMonthDateRange(2024, 2)
        expect(start).toBe('2024-02-01')
        expect(end).toBe('2024-02-29')
      })
    })

    describe('各月の日数', () => {
      it.each([
        [1, 31],  // 1月
        [3, 31],  // 3月
        [4, 30],  // 4月
        [5, 31],  // 5月
        [6, 30],  // 6月
        [7, 31],  // 7月
        [8, 31],  // 8月
        [9, 30],  // 9月
        [10, 31], // 10月
        [11, 30], // 11月
        [12, 31]  // 12月
      ])('%d月の終了日が%d日であること', (month, lastDay) => {
        const [start, end] = getMonthDateRange(2024, month)
        expect(start).toBe(`2024-${String(month).padStart(2, '0')}-01`)
        expect(end).toBe(`2024-${String(month).padStart(2, '0')}-${lastDay}`)
      })
    })

    describe('フォーマット', () => {
      it('yyyy-MM-dd形式の文字列を返す', () => {
        const [start, end] = getMonthDateRange(2024, 6)

        // 正規表現でフォーマットを確認
        expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      })

      it('月と日が1桁の場合もゼロパディングされる', () => {
        const [start, end] = getMonthDateRange(2024, 1)
        expect(start).toBe('2024-01-01')
      })
    })
  })
})
