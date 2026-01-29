import { describe, expect, it } from 'vitest'
import {
    formatAttendanceStatus,
    formatDate,
    formatNumber,
    formatPercentage,
    formatRole,
    formatStroke,
    formatTime,
} from '../../utils/formatters'

describe('formatTime', () => {
  it('60秒以上のときMM:SS.ss形式でフォーマットされる', () => {
    expect(formatTime(125.5)).toBe('2:05.50')
    expect(formatTime(60.0)).toBe('1:00.00')
    expect(formatTime(185.99)).toBe('3:05.99')
  })

  it('60秒未満のとき分なしでフォーマットされる', () => {
    expect(formatTime(59.99)).toBe('59.99')
    expect(formatTime(30.50)).toBe('30.50')
    expect(formatTime(5.12)).toBe('5.12')
  })

  it('エッジケースを処理できる', () => {
    expect(formatTime(0)).toBe('0.00')
    expect(formatTime(0.01)).toBe('0.01')
  })

  it('無効な入力に対して0.00を返す', () => {
    expect(formatTime(-1)).toBe('0.00')
    expect(formatTime(-100.5)).toBe('0.00')
    expect(formatTime(NaN)).toBe('0.00')
    expect(formatTime(Infinity)).toBe('0.00')
    expect(formatTime(-Infinity)).toBe('0.00')
  })
})

describe('formatDate', () => {
  const testDate = new Date('2025-01-15T10:30:00')

  it('短い形式（デフォルト）で日付がフォーマットされる', () => {
    const result = formatDate(testDate, 'short')
    expect(result).toBe('1月15日')
  })

  it('長い形式で日付がフォーマットされる', () => {
    const result = formatDate(testDate, 'long')
    expect(result).toBe('2025年1月15日')
  })

  it('数値形式で日付がフォーマットされる', () => {
    const result = formatDate(testDate, 'numeric')
    expect(result).toBe('2025/01/15')
  })

  it('文字列日付入力を処理できる', () => {
    const result = formatDate('2025-01-15', 'short')
    expect(result).toBe('1月15日')
  })

  it('無効な日付に対して - を返す', () => {
    expect(formatDate(null)).toBe('-')
    expect(formatDate(undefined)).toBe('-')
    expect(formatDate('invalid-date')).toBe('-')
  })
})

describe('formatNumber', () => {
  it('デフォルトで小数点なしで数値がフォーマットされる', () => {
    expect(formatNumber(1000)).toBe('1,000')
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('指定された小数点で数値がフォーマットされる', () => {
    expect(formatNumber(1234.5, 2)).toBe('1,234.50')
    expect(formatNumber(999.999, 1)).toBe('1,000.0')
  })

  it('ゼロを処理できる', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(0, 2)).toBe('0.00')
  })
})

describe('formatPercentage', () => {
  it('パーセンテージを計算してフォーマットできる', () => {
    expect(formatPercentage(50, 100)).toBe('50.0%')
    expect(formatPercentage(75, 100)).toBe('75.0%')
    expect(formatPercentage(1, 3)).toBe('33.3%')
  })

  it('合計がゼロのときを処理できる', () => {
    expect(formatPercentage(10, 0)).toBe('0%')
  })

  it('値がゼロのときを処理できる', () => {
    expect(formatPercentage(0, 100)).toBe('0.0%')
  })

  it('合計より大きい値を処理できる', () => {
    expect(formatPercentage(150, 100)).toBe('150.0%')
  })
})

describe('formatStroke', () => {
  it('ストローク名を日本語にフォーマットできる', () => {
    expect(formatStroke('freestyle')).toBe('自由形')
    expect(formatStroke('backstroke')).toBe('背泳ぎ')
    expect(formatStroke('breaststroke')).toBe('平泳ぎ')
    expect(formatStroke('butterfly')).toBe('バタフライ')
    expect(formatStroke('individual_medley')).toBe('個人メドレー')
  })

  it('不明なストロークに対して元の文字列を返す', () => {
    expect(formatStroke('unknown')).toBe('unknown')
    expect(formatStroke('relay')).toBe('relay')
  })
})

describe('formatRole', () => {
  it('常にメンバーを返す', () => {
    expect(formatRole()).toBe('メンバー')
  })
})

describe('formatAttendanceStatus', () => {
  it('出欠ステータスを日本語にフォーマットできる', () => {
    expect(formatAttendanceStatus('present')).toBe('出席')
    expect(formatAttendanceStatus('absent')).toBe('欠席')
    expect(formatAttendanceStatus('late')).toBe('遅刻')
    expect(formatAttendanceStatus('excused')).toBe('公欠')
  })

  it('不明なステータスに対して元の文字列を返す', () => {
    expect(formatAttendanceStatus('unknown')).toBe('unknown')
  })
})

