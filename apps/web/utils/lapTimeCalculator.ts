/**
 * Lap-Time計算ユーティリティ
 * split-timeからlap-timeを計算する関数群
 */

export interface SplitTime {
  distance: number
  splitTime: number
}

export interface LapTime {
  fromDistance: number
  toDistance: number
  lapTime: number
}

/**
 * 全てのsplit-time間のlap-timeを計算
 * @param splitTimes 距離とタイムのペア配列（距離順にソート済み）
 * @returns lap-timeの配列
 */
export function calculateAllLapTimes(splitTimes: SplitTime[]): LapTime[] {
  if (splitTimes.length === 0) return []

  // 距離でソート
  const sorted = [...splitTimes].sort((a, b) => a.distance - b.distance)
  
  const lapTimes: LapTime[] = []
  
  // 最初のsplit-timeは0mからのlap-time
  if (sorted.length > 0 && sorted[0].distance > 0) {
    lapTimes.push({
      fromDistance: 0,
      toDistance: sorted[0].distance,
      lapTime: sorted[0].splitTime
    })
  }
  
  // 連続するsplit-time間のlap-timeを計算
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const curr = sorted[i]
    
    if (prev.distance < curr.distance && prev.splitTime > 0 && curr.splitTime > 0) {
      lapTimes.push({
        fromDistance: prev.distance,
        toDistance: curr.distance,
        lapTime: curr.splitTime - prev.splitTime
      })
    }
  }
  
  return lapTimes
}

/**
 * 種目の距離に応じたlap間隔を取得
 * @param raceDistance 種目の距離（m）
 * @returns lap間隔の配列（m）（種目の距離と同じ間隔は除外）
 */
export function getLapIntervalsForRace(raceDistance: number): number[] {
  const intervals: number[] = []
  
  if (raceDistance >= 25 && raceDistance !== 25) intervals.push(25)
  if (raceDistance >= 50 && raceDistance !== 50) intervals.push(50)
  if (raceDistance >= 100 && raceDistance !== 100) intervals.push(100)
  if (raceDistance >= 200 && raceDistance !== 200) intervals.push(200)
  if (raceDistance >= 400 && raceDistance !== 400) intervals.push(400)
  
  // 1500mの場合は100mまで
  if (raceDistance === 1500) {
    return [25, 50, 100]
  }
  
  return intervals
}

/**
 * 特定の間隔でのlap-timeを計算
 * @param splitTimes 距離とタイムのペア配列
 * @param interval ラップ間隔（m）
 * @returns 各間隔でのlap-timeの配列
 */
export function calculateLapTimesForInterval(
  splitTimes: SplitTime[],
  interval: number
): Array<{ distance: number; lapTime: number | null }> {
  if (splitTimes.length === 0) return []

  // 距離でソート
  const sorted = [...splitTimes].sort((a, b) => a.distance - b.distance)
  
  const results: Array<{ distance: number; lapTime: number | null }> = []
  
  // 間隔の倍数の距離でのlap-timeを計算
  for (let distance = interval; distance <= sorted[sorted.length - 1].distance; distance += interval) {
    // 該当する距離のsplit-timeを探す
    const exactMatch = sorted.find(st => st.distance === distance)
    
    if (exactMatch && exactMatch.splitTime > 0) {
      // 前の間隔の距離を探す
      const prevDistance = distance - interval
      const prevMatch = sorted.find(st => st.distance === prevDistance)
      
      if (prevMatch && prevMatch.splitTime > 0) {
        results.push({
          distance,
          lapTime: exactMatch.splitTime - prevMatch.splitTime
        })
      } else if (prevDistance === 0) {
        // 最初の間隔の場合は0mからのlap-time
        results.push({
          distance,
          lapTime: exactMatch.splitTime
        })
      } else {
        // 前の間隔のsplit-timeがない場合は計算不可
        results.push({
          distance,
          lapTime: null
        })
      }
    } else {
      // 該当する距離のsplit-timeがない場合は計算不可
      results.push({
        distance,
        lapTime: null
      })
    }
  }
  
  return results
}

/**
 * 種目別のlap-timeを表形式で計算
 * @param splitTimes 距離とタイムのペア配列
 * @param raceDistance 種目の距離（m）
 * @returns 表形式のデータ（各行は距離、Split Time、各間隔のLap Time）
 */
export function calculateRaceLapTimesTable(
  splitTimes: SplitTime[],
  raceDistance: number
): Array<{
  distance: number
  splitTime: number | null
  lapTimes: Record<number, number | null> // 間隔をキーとしたlap-time
}> {
  if (splitTimes.length === 0) return []

  const intervals = getLapIntervalsForRace(raceDistance)
  
  // 距離でソート
  const sorted = [...splitTimes].sort((a, b) => a.distance - b.distance)
  
  // 25mの倍数の距離のみをフィルタリング
  const filteredSorted = sorted.filter(split => split.distance % 25 === 0 && split.splitTime > 0)
  
  const table: Array<{
    distance: number
    splitTime: number | null
    lapTimes: Record<number, number | null>
  }> = []
  
  // 各split-timeについて行を作成
  for (const split of filteredSorted) {
    
    const lapTimes: Record<number, number | null> = {}
    
    // 各間隔についてlap-timeを計算
    for (const interval of intervals) {
      // この距離が間隔の倍数かチェック
      if (split.distance % interval === 0) {
        // 間隔の倍数の場合のみlap-timeを計算
        if (split.distance === interval) {
          // 最初の間隔の場合は0mからのlap-time
          lapTimes[interval] = split.splitTime
        } else {
          // 前の間隔の距離のsplit-timeを探す
          const prevDistance = split.distance - interval
          const prevSplit = filteredSorted.find(st => st.distance === prevDistance)
          
          if (prevSplit && prevSplit.splitTime > 0) {
            lapTimes[interval] = split.splitTime - prevSplit.splitTime
          } else if (prevDistance === 0) {
            // 前の間隔が0mの場合
            lapTimes[interval] = split.splitTime
          } else {
            // 前の間隔のsplit-timeがない場合は計算不可
            lapTimes[interval] = null
          }
        }
      } else {
        // 間隔の倍数でない場合は「-」を表示
        lapTimes[interval] = null
      }
    }
    
    table.push({
      distance: split.distance,
      splitTime: split.splitTime,
      lapTimes
    })
  }
  
  return table
}

