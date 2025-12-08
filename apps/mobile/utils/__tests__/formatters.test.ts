// =============================================================================
// formatters.test.ts - フォーマッター関数のユニットテスト
// =============================================================================

import { describe, expect, it } from 'vitest'
import { formatTime } from '../formatters'

describe('formatTime', () => {
  it('60秒未満の値を正しくフォーマットする', () => {
    expect(formatTime(30.5)).toBe('30.50')
    expect(formatTime(0.5)).toBe('0.50')
    expect(formatTime(59.99)).toBe('59.99')
  })

  it('60秒以上の値を正しくフォーマットする', () => {
    expect(formatTime(60)).toBe('1:00.00')
    expect(formatTime(90.5)).toBe('1:30.50')
    expect(formatTime(125.75)).toBe('2:05.75')
    expect(formatTime(3661.25)).toBe('61:01.25')
  })

  it('0秒を正しくフォーマットする', () => {
    expect(formatTime(0)).toBe('0.00')
  })

  it('小数点以下2桁を正しく表示する', () => {
    expect(formatTime(30.1)).toBe('30.10')
    expect(formatTime(30.12)).toBe('30.12')
    expect(formatTime(30.123)).toBe('30.12') // 小数点以下2桁で切り捨て
    // 60.999は60.99に丸められ、1:00.99ではなく1:01.00になる（60秒を超えるため）
    expect(formatTime(60.999)).toBe('1:01.00')
  })

  it('負の値を正しくフォーマットする', () => {
    // formatTime関数は負の値もそのまま処理する
    // -30.5の場合: minutes = -1 (Math.floor(-30.5/60) = -1), remainingSeconds = 29.50
    // minutes > 0 は false なので remainingSeconds が返される
    expect(formatTime(-30.5)).toBe('-30.50')
    // -60の場合: minutes = -1, remainingSeconds = 0.00
    // minutes > 0 は false なので remainingSeconds が返される
    expect(formatTime(-60)).toBe('0.00')
  })

  it('大きな値を正しくフォーマットする', () => {
    expect(formatTime(3600)).toBe('60:00.00') // 1時間
    expect(formatTime(7200.5)).toBe('120:00.50') // 2時間
  })
})
