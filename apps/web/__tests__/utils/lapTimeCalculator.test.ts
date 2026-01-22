import { describe, expect, it } from 'vitest'

import {
  calculateAllLapTimes,
  calculateLapTimesForInterval,
  calculateRaceLapTimesTable,
  getLapIntervalsForRace,
  type SplitTime
} from '../../utils/lapTimeCalculator'

describe('lapTimeCalculator', () => {
  describe('calculateAllLapTimes', () => {
    describe('正常系', () => {
      it('空の配列は空の配列を返す', () => {
        const result = calculateAllLapTimes([])
        expect(result).toEqual([])
      })

      it('1つのsplit-timeは0mからのlap-timeを返す', () => {
        const splitTimes: SplitTime[] = [{ distance: 50, splitTime: 30.5 }]
        const result = calculateAllLapTimes(splitTimes)

        expect(result).toEqual([
          { fromDistance: 0, toDistance: 50, lapTime: 30.5 }
        ])
      })

      it('複数のsplit-timeから連続するlap-timeを計算する', () => {
        const splitTimes: SplitTime[] = [
          { distance: 50, splitTime: 30.0 },
          { distance: 100, splitTime: 62.0 }
        ]
        const result = calculateAllLapTimes(splitTimes)

        expect(result).toEqual([
          { fromDistance: 0, toDistance: 50, lapTime: 30.0 },
          { fromDistance: 50, toDistance: 100, lapTime: 32.0 }
        ])
      })

      it('100m自由形の典型的なsplit-timeを計算する', () => {
        const splitTimes: SplitTime[] = [
          { distance: 25, splitTime: 12.5 },
          { distance: 50, splitTime: 26.0 },
          { distance: 75, splitTime: 40.0 },
          { distance: 100, splitTime: 55.0 }
        ]
        const result = calculateAllLapTimes(splitTimes)

        expect(result).toEqual([
          { fromDistance: 0, toDistance: 25, lapTime: 12.5 },
          { fromDistance: 25, toDistance: 50, lapTime: 13.5 },
          { fromDistance: 50, toDistance: 75, lapTime: 14.0 },
          { fromDistance: 75, toDistance: 100, lapTime: 15.0 }
        ])
      })

      it('ソートされていないsplit-timeも正しく処理する', () => {
        const splitTimes: SplitTime[] = [
          { distance: 100, splitTime: 62.0 },
          { distance: 50, splitTime: 30.0 }
        ]
        const result = calculateAllLapTimes(splitTimes)

        expect(result).toEqual([
          { fromDistance: 0, toDistance: 50, lapTime: 30.0 },
          { fromDistance: 50, toDistance: 100, lapTime: 32.0 }
        ])
      })
    })

    describe('異常系', () => {
      it('split-timeが0の場合はそのlap-timeを計算しない', () => {
        const splitTimes: SplitTime[] = [
          { distance: 50, splitTime: 30.0 },
          { distance: 100, splitTime: 0 },
          { distance: 150, splitTime: 95.0 }
        ]
        const result = calculateAllLapTimes(splitTimes)

        // 100mのsplit-timeが0なので、50-100mと100-150mのlap-timeは計算されない
        expect(result).toEqual([
          { fromDistance: 0, toDistance: 50, lapTime: 30.0 }
        ])
      })

      it('0mから始まるsplit-timeがある場合の挙動', () => {
        const splitTimes: SplitTime[] = [
          { distance: 0, splitTime: 0 },
          { distance: 50, splitTime: 30.0 }
        ]
        const result = calculateAllLapTimes(splitTimes)

        // 実装では、sorted[0].distance > 0 の条件があるため
        // 0mのsplit-timeがある場合、最初のlap-timeは生成されない
        // また、0-50m間のlap-timeも prev.splitTime > 0 の条件で除外される
        expect(result).toEqual([])
      })
    })

    describe('200m個人メドレーのユースケース', () => {
      it('200m個人メドレーの全ラップを計算する', () => {
        const splitTimes: SplitTime[] = [
          { distance: 50, splitTime: 28.0 },   // バタフライ
          { distance: 100, splitTime: 62.0 },  // 背泳ぎ
          { distance: 150, splitTime: 100.0 }, // 平泳ぎ
          { distance: 200, splitTime: 130.0 }  // 自由形
        ]
        const result = calculateAllLapTimes(splitTimes)

        expect(result).toHaveLength(4)
        expect(result[0]).toEqual({ fromDistance: 0, toDistance: 50, lapTime: 28.0 })
        expect(result[1]).toEqual({ fromDistance: 50, toDistance: 100, lapTime: 34.0 })
        expect(result[2]).toEqual({ fromDistance: 100, toDistance: 150, lapTime: 38.0 })
        expect(result[3]).toEqual({ fromDistance: 150, toDistance: 200, lapTime: 30.0 })
      })
    })
  })

  describe('getLapIntervalsForRace', () => {
    describe('正常系', () => {
      it('25m種目は空の配列を返す', () => {
        const result = getLapIntervalsForRace(25)
        expect(result).toEqual([])
      })

      it('50m種目は25mのみを返す', () => {
        const result = getLapIntervalsForRace(50)
        expect(result).toEqual([25])
      })

      it('100m種目は25m, 50mを返す', () => {
        const result = getLapIntervalsForRace(100)
        expect(result).toEqual([25, 50])
      })

      it('200m種目は25m, 50m, 100mを返す', () => {
        const result = getLapIntervalsForRace(200)
        expect(result).toEqual([25, 50, 100])
      })

      it('400m種目は25m, 50m, 100m, 200mを返す', () => {
        const result = getLapIntervalsForRace(400)
        expect(result).toEqual([25, 50, 100, 200])
      })

      it('800m種目は25m, 50m, 100m, 200m, 400mを返す', () => {
        const result = getLapIntervalsForRace(800)
        expect(result).toEqual([25, 50, 100, 200, 400])
      })

      it('1500m種目は25m, 50m, 100mのみを返す（特殊ケース）', () => {
        const result = getLapIntervalsForRace(1500)
        expect(result).toEqual([25, 50, 100])
      })
    })

    describe('境界値', () => {
      it('24m（25m未満）は空の配列を返す', () => {
        const result = getLapIntervalsForRace(24)
        expect(result).toEqual([])
      })

      it('26m（25mより大きい）は25mを含む', () => {
        const result = getLapIntervalsForRace(26)
        expect(result).toContain(25)
      })
    })
  })

  describe('calculateLapTimesForInterval', () => {
    describe('正常系', () => {
      it('空の配列は空の配列を返す', () => {
        const result = calculateLapTimesForInterval([], 50)
        expect(result).toEqual([])
      })

      it('50m間隔で100mのlap-timeを計算する', () => {
        const splitTimes: SplitTime[] = [
          { distance: 50, splitTime: 30.0 },
          { distance: 100, splitTime: 62.0 }
        ]
        const result = calculateLapTimesForInterval(splitTimes, 50)

        expect(result).toEqual([
          { distance: 50, lapTime: 30.0 },
          { distance: 100, lapTime: 32.0 }
        ])
      })

      it('25m間隔で100mのlap-timeを計算する', () => {
        const splitTimes: SplitTime[] = [
          { distance: 25, splitTime: 14.0 },
          { distance: 50, splitTime: 29.0 },
          { distance: 75, splitTime: 45.0 },
          { distance: 100, splitTime: 62.0 }
        ]
        const result = calculateLapTimesForInterval(splitTimes, 25)

        expect(result).toEqual([
          { distance: 25, lapTime: 14.0 },
          { distance: 50, lapTime: 15.0 },
          { distance: 75, lapTime: 16.0 },
          { distance: 100, lapTime: 17.0 }
        ])
      })

      it('100m間隔で200mのlap-timeを計算する', () => {
        const splitTimes: SplitTime[] = [
          { distance: 50, splitTime: 30.0 },
          { distance: 100, splitTime: 62.0 },
          { distance: 150, splitTime: 95.0 },
          { distance: 200, splitTime: 130.0 }
        ]
        const result = calculateLapTimesForInterval(splitTimes, 100)

        expect(result).toEqual([
          { distance: 100, lapTime: 62.0 },
          { distance: 200, lapTime: 68.0 }
        ])
      })
    })

    describe('欠損データの処理', () => {
      it('中間のsplit-timeが欠損している場合はnullを返す', () => {
        const splitTimes: SplitTime[] = [
          { distance: 50, splitTime: 30.0 },
          // 100mが欠損
          { distance: 150, splitTime: 95.0 }
        ]
        const result = calculateLapTimesForInterval(splitTimes, 50)

        expect(result).toEqual([
          { distance: 50, lapTime: 30.0 },
          { distance: 100, lapTime: null },
          { distance: 150, lapTime: null }
        ])
      })

      it('split-timeが0の場合はnullを返す', () => {
        const splitTimes: SplitTime[] = [
          { distance: 50, splitTime: 30.0 },
          { distance: 100, splitTime: 0 }
        ]
        const result = calculateLapTimesForInterval(splitTimes, 50)

        expect(result).toEqual([
          { distance: 50, lapTime: 30.0 },
          { distance: 100, lapTime: null }
        ])
      })
    })
  })

  describe('calculateRaceLapTimesTable', () => {
    describe('正常系', () => {
      it('空の配列は空の配列を返す', () => {
        const result = calculateRaceLapTimesTable([], 100)
        expect(result).toEqual([])
      })

      it('100m自由形のテーブルを生成する', () => {
        const splitTimes: SplitTime[] = [
          { distance: 25, splitTime: 12.5 },
          { distance: 50, splitTime: 26.0 },
          { distance: 75, splitTime: 40.0 },
          { distance: 100, splitTime: 55.0 }
        ]
        const result = calculateRaceLapTimesTable(splitTimes, 100)

        expect(result).toHaveLength(4)

        // 25m
        expect(result[0].distance).toBe(25)
        expect(result[0].splitTime).toBe(12.5)
        expect(result[0].lapTimes[25]).toBe(12.5)
        expect(result[0].lapTimes[50]).toBeNull() // 25mは50mの倍数ではない

        // 50m
        expect(result[1].distance).toBe(50)
        expect(result[1].splitTime).toBe(26.0)
        expect(result[1].lapTimes[25]).toBe(13.5)
        expect(result[1].lapTimes[50]).toBe(26.0)

        // 75m
        expect(result[2].distance).toBe(75)
        expect(result[2].splitTime).toBe(40.0)
        expect(result[2].lapTimes[25]).toBe(14.0)
        expect(result[2].lapTimes[50]).toBeNull()

        // 100m
        expect(result[3].distance).toBe(100)
        expect(result[3].splitTime).toBe(55.0)
        expect(result[3].lapTimes[25]).toBe(15.0)
        expect(result[3].lapTimes[50]).toBe(29.0)
      })

      it('200m種目のテーブルを生成する', () => {
        const splitTimes: SplitTime[] = [
          { distance: 50, splitTime: 28.0 },
          { distance: 100, splitTime: 60.0 },
          { distance: 150, splitTime: 95.0 },
          { distance: 200, splitTime: 130.0 }
        ]
        const result = calculateRaceLapTimesTable(splitTimes, 200)

        expect(result).toHaveLength(4)

        // 100m
        expect(result[1].lapTimes[50]).toBe(32.0)
        expect(result[1].lapTimes[100]).toBe(60.0)

        // 200m
        expect(result[3].lapTimes[50]).toBe(35.0)
        expect(result[3].lapTimes[100]).toBe(70.0)
      })
    })

    describe('25mの倍数でないsplit-timeの処理', () => {
      it('25mの倍数でない距離はフィルタリングされる', () => {
        const splitTimes: SplitTime[] = [
          { distance: 25, splitTime: 12.5 },
          { distance: 30, splitTime: 15.0 }, // 25mの倍数でない
          { distance: 50, splitTime: 26.0 }
        ]
        const result = calculateRaceLapTimesTable(splitTimes, 100)

        expect(result).toHaveLength(2)
        expect(result[0].distance).toBe(25)
        expect(result[1].distance).toBe(50)
      })
    })

    describe('split-timeが0の処理', () => {
      it('split-timeが0の距離はフィルタリングされる', () => {
        const splitTimes: SplitTime[] = [
          { distance: 25, splitTime: 12.5 },
          { distance: 50, splitTime: 0 },
          { distance: 75, splitTime: 40.0 }
        ]
        const result = calculateRaceLapTimesTable(splitTimes, 100)

        expect(result).toHaveLength(2)
        expect(result[0].distance).toBe(25)
        expect(result[1].distance).toBe(75)
      })
    })
  })

  describe('実際のレース分析ユースケース', () => {
    it('世界記録レベルの100m自由形を分析する', () => {
      // 男子100m自由形 46秒台のペース
      const splitTimes: SplitTime[] = [
        { distance: 25, splitTime: 10.5 },
        { distance: 50, splitTime: 22.0 },
        { distance: 75, splitTime: 34.5 },
        { distance: 100, splitTime: 47.0 }
      ]

      const lapTimes = calculateAllLapTimes(splitTimes)
      expect(lapTimes).toHaveLength(4)

      // 前半50mと後半50mの比較
      const first50 = lapTimes[0].lapTime + lapTimes[1].lapTime
      const second50 = lapTimes[2].lapTime + lapTimes[3].lapTime
      expect(first50).toBeCloseTo(22.0)
      expect(second50).toBeCloseTo(25.0)
    })

    it('400m個人メドレーを分析する', () => {
      const splitTimes: SplitTime[] = [
        { distance: 50, splitTime: 27.0 },
        { distance: 100, splitTime: 58.0 },
        { distance: 150, splitTime: 92.0 },
        { distance: 200, splitTime: 128.0 },
        { distance: 250, splitTime: 170.0 },
        { distance: 300, splitTime: 215.0 },
        { distance: 350, splitTime: 255.0 },
        { distance: 400, splitTime: 290.0 }
      ]

      const intervals = getLapIntervalsForRace(400)
      expect(intervals).toEqual([25, 50, 100, 200])

      const table = calculateRaceLapTimesTable(splitTimes, 400)
      expect(table).toHaveLength(8)

      // 100mごとのタイムを確認
      const lap100m = calculateLapTimesForInterval(splitTimes, 100)
      expect(lap100m).toHaveLength(4)
      expect(lap100m[0]).toEqual({ distance: 100, lapTime: 58.0 })   // バタフライ
      expect(lap100m[1]).toEqual({ distance: 200, lapTime: 70.0 })   // 背泳ぎ
      expect(lap100m[2]).toEqual({ distance: 300, lapTime: 87.0 })   // 平泳ぎ
      expect(lap100m[3]).toEqual({ distance: 400, lapTime: 75.0 })   // 自由形
    })
  })
})
