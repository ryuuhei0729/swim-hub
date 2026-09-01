/**
 * Lap-Time計算ユーティリティ（mobile 複製）
 * split-timeからlap-timeを計算する関数群。
 * web apps/web/utils/lapTimeCalculator.ts の挙動を mobile に複製したもの（shared 統合はしない）。
 */

export interface SplitTime {
  distance: number;
  splitTime: number;
}

export interface LapTime {
  fromDistance: number;
  toDistance: number;
  lapTime: number;
}

/**
 * 全てのsplit-time間のlap-timeを計算
 * @param splitTimes 距離とタイムのペア配列
 * @returns lap-timeの配列
 */
export function calculateAllLapTimes(splitTimes: SplitTime[]): LapTime[] {
  if (splitTimes.length === 0) return [];

  const sorted = [...splitTimes].sort((a, b) => a.distance - b.distance);

  const lapTimes: LapTime[] = [];

  // 最初のsplit-timeは0mからのlap-time
  const firstSplit = sorted[0];
  if (firstSplit && firstSplit.distance > 0) {
    lapTimes.push({
      fromDistance: 0,
      toDistance: firstSplit.distance,
      lapTime: firstSplit.splitTime,
    });
  }

  // 連続するsplit-time間のlap-timeを計算
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!prev || !curr) continue; // i>=1 かつ i<sorted.length なので理論上 undefined にならないが、
                                   // sorted は呼び出し元由来の可変長配列のため防御的に扱う

    if (prev.distance < curr.distance && prev.splitTime > 0 && curr.splitTime > 0) {
      lapTimes.push({
        fromDistance: prev.distance,
        toDistance: curr.distance,
        lapTime: curr.splitTime - prev.splitTime,
      });
    }
  }

  return lapTimes;
}

/**
 * 種目の距離に応じたlap間隔を取得
 * @param raceDistance 種目の距離（m）
 * @returns lap間隔の配列（m）（種目の距離と同じ間隔は除外）
 */
export function getLapIntervalsForRace(raceDistance: number): number[] {
  const intervals: number[] = [];

  if (raceDistance >= 25 && raceDistance !== 25) intervals.push(25);
  if (raceDistance >= 50 && raceDistance !== 50) intervals.push(50);
  if (raceDistance >= 100 && raceDistance !== 100) intervals.push(100);
  if (raceDistance >= 200 && raceDistance !== 200) intervals.push(200);
  if (raceDistance >= 400 && raceDistance !== 400) intervals.push(400);

  // 1500mの場合は100mまで
  if (raceDistance === 1500) {
    return [25, 50, 100];
  }

  return intervals;
}

/**
 * 種目別のlap-timeを表形式で計算
 * @param splitTimes 距離とタイムのペア配列
 * @param raceDistance 種目の距離（m）
 * @returns 表形式のデータ（各行は距離、Split Time、各間隔のLap Time）
 */
export function calculateRaceLapTimesTable(
  splitTimes: SplitTime[],
  raceDistance: number,
): Array<{
  distance: number;
  splitTime: number | null;
  lapTimes: Record<number, number | null>; // 間隔をキーとしたlap-time
}> {
  if (splitTimes.length === 0) return [];

  const intervals = getLapIntervalsForRace(raceDistance);

  const sorted = [...splitTimes].sort((a, b) => a.distance - b.distance);

  // 25mの倍数の距離のみをフィルタリング
  const filteredSorted = sorted.filter((split) => split.distance % 25 === 0 && split.splitTime > 0);

  const table: Array<{
    distance: number;
    splitTime: number | null;
    lapTimes: Record<number, number | null>;
  }> = [];

  for (const split of filteredSorted) {
    const lapTimes: Record<number, number | null> = {};

    for (const interval of intervals) {
      if (split.distance % interval === 0) {
        if (split.distance === interval) {
          // 最初の間隔の場合は0mからのlap-time
          lapTimes[interval] = split.splitTime;
        } else {
          const prevDistance = split.distance - interval;
          const prevSplit = filteredSorted.find((st) => st.distance === prevDistance);

          if (prevSplit && prevSplit.splitTime > 0) {
            lapTimes[interval] = split.splitTime - prevSplit.splitTime;
          } else if (prevDistance === 0) {
            lapTimes[interval] = split.splitTime;
          } else {
            lapTimes[interval] = null;
          }
        }
      } else {
        // 間隔の倍数でない場合は「-」を表示
        lapTimes[interval] = null;
      }
    }

    table.push({
      distance: split.distance,
      splitTime: split.splitTime,
      lapTimes,
    });
  }

  return table;
}
