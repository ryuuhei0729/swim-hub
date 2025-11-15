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
  it('should format seconds to MM:SS.ss format when >= 60 seconds', () => {
    expect(formatTime(125.5)).toBe('2:05.50')
    expect(formatTime(60.0)).toBe('1:00.00')
    expect(formatTime(185.99)).toBe('3:05.99')
  })

  it('should format seconds without minutes when < 60 seconds', () => {
    expect(formatTime(59.99)).toBe('59.99')
    expect(formatTime(30.50)).toBe('30.50')
    expect(formatTime(5.12)).toBe('5.12')
  })

  it('should handle edge cases', () => {
    expect(formatTime(0)).toBe('0.00')
    expect(formatTime(0.01)).toBe('0.01')
  })
})

describe('formatDate', () => {
  const testDate = new Date('2025-01-15T10:30:00')

  it('should format date in short format (default)', () => {
    const result = formatDate(testDate, 'short')
    expect(result).toMatch(/2025\/01\/15/)
  })

  it('should format date in long format', () => {
    const result = formatDate(testDate, 'long')
    expect(result).toMatch(/2025年1月15日/)
    expect(result).toMatch(/曜日/)
  })

  it('should format time only', () => {
    const result = formatDate(testDate, 'time')
    expect(result).toMatch(/10:30/)
  })

  it('should handle string date input', () => {
    const result = formatDate('2025-01-15', 'short')
    expect(result).toMatch(/2025\/01\/15/)
  })
})

describe('formatNumber', () => {
  it('should format number with no decimals by default', () => {
    expect(formatNumber(1000)).toBe('1,000')
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('should format number with specified decimals', () => {
    expect(formatNumber(1234.5, 2)).toBe('1,234.50')
    expect(formatNumber(999.999, 1)).toBe('1,000.0')
  })

  it('should handle zero', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(0, 2)).toBe('0.00')
  })
})

describe('formatPercentage', () => {
  it('should calculate and format percentage', () => {
    expect(formatPercentage(50, 100)).toBe('50.0%')
    expect(formatPercentage(75, 100)).toBe('75.0%')
    expect(formatPercentage(1, 3)).toBe('33.3%')
  })

  it('should handle zero total', () => {
    expect(formatPercentage(10, 0)).toBe('0%')
  })

  it('should handle zero value', () => {
    expect(formatPercentage(0, 100)).toBe('0.0%')
  })

  it('should handle values greater than total', () => {
    expect(formatPercentage(150, 100)).toBe('150.0%')
  })
})

describe('formatStroke', () => {
  it('should format stroke names to Japanese', () => {
    expect(formatStroke('freestyle')).toBe('自由形')
    expect(formatStroke('backstroke')).toBe('背泳ぎ')
    expect(formatStroke('breaststroke')).toBe('平泳ぎ')
    expect(formatStroke('butterfly')).toBe('バタフライ')
    expect(formatStroke('individual_medley')).toBe('個人メドレー')
  })

  it('should return original string for unknown stroke', () => {
    expect(formatStroke('unknown')).toBe('unknown')
    expect(formatStroke('relay')).toBe('relay')
  })
})

describe('formatRole', () => {
  it('should always return メンバー', () => {
    expect(formatRole()).toBe('メンバー')
  })
})

describe('formatAttendanceStatus', () => {
  it('should format attendance status to Japanese', () => {
    expect(formatAttendanceStatus('present')).toBe('出席')
    expect(formatAttendanceStatus('absent')).toBe('欠席')
    expect(formatAttendanceStatus('late')).toBe('遅刻')
    expect(formatAttendanceStatus('excused')).toBe('公欠')
  })

  it('should return original string for unknown status', () => {
    expect(formatAttendanceStatus('unknown')).toBe('unknown')
  })
})

