import { describe, expect, it } from 'vitest'

import { getMonthDateRange } from '../../utils/date'

describe('date utilities', () => {
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
