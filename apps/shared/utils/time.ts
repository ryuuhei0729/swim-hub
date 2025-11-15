// =============================================================================
// タイム計算ユーティリティ - Swim Hub共通パッケージ
// =============================================================================

import { TimeEntry } from '../types/ui'

export function calcFastest(times: TimeEntry[]): number | null {
  const valid = times.map(t => t.time).filter(t => typeof t === 'number' && t > 0)
  if (valid.length === 0) return null
  return Math.min(...valid)
}

export function calcAverage(times: TimeEntry[]): number | null {
  const valid = times.map(t => t.time).filter(t => typeof t === 'number' && t > 0)
  if (valid.length === 0) return null
  return valid.reduce((sum, t) => sum + t, 0) / valid.length
}

export function calcSum(times: TimeEntry[]): number {
  return times.map(t => t.time).filter(t => typeof t === 'number' && t > 0)
    .reduce((sum, t) => sum + t, 0)
}


