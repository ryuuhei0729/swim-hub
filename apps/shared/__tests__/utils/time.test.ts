import { describe, expect, it } from 'vitest'

import {
  calcAverage,
  calcFastest,
  calcSum,
  calculatePace,
  formatTime,
  formatTimeDiff,
  formatTimeFull,
  formatTimeShort,
  parseTime,
  parseTimeStrict,
  type TimeEntryLike
} from '../../utils/time'

describe('time utilities', () => {
  // =============================================================================
  // 集計関数
  // =============================================================================
  describe('calcFastest', () => {
    describe('正常系', () => {
      it('最速タイムを返す', () => {
        const times: TimeEntryLike[] = [
          { time: 30.0 },
          { time: 28.5 },
          { time: 32.0 }
        ]
        expect(calcFastest(times)).toBe(28.5)
      })

      it('1件のタイムはそのまま返す', () => {
        const times: TimeEntryLike[] = [{ time: 30.0 }]
        expect(calcFastest(times)).toBe(30.0)
      })

      it('小数点を含むタイムを正しく比較する', () => {
        const times: TimeEntryLike[] = [
          { time: 30.01 },
          { time: 30.00 },
          { time: 30.02 }
        ]
        expect(calcFastest(times)).toBe(30.00)
      })
    })

    describe('異常系', () => {
      it('空の配列はnullを返す', () => {
        expect(calcFastest([])).toBeNull()
      })

      it('タイムが0以下のエントリは無視する', () => {
        const times: TimeEntryLike[] = [
          { time: 0 },
          { time: -1 },
          { time: 30.0 }
        ]
        expect(calcFastest(times)).toBe(30.0)
      })

      it('すべてのタイムが無効な場合はnullを返す', () => {
        const times: TimeEntryLike[] = [
          { time: 0 },
          { time: -1 },
          { time: null as unknown as number }
        ]
        expect(calcFastest(times)).toBeNull()
      })
    })
  })

  describe('calcAverage', () => {
    describe('正常系', () => {
      it('平均タイムを返す', () => {
        const times: TimeEntryLike[] = [
          { time: 30.0 },
          { time: 32.0 },
          { time: 34.0 }
        ]
        expect(calcAverage(times)).toBe(32.0)
      })

      it('1件のタイムはそのまま返す', () => {
        const times: TimeEntryLike[] = [{ time: 30.0 }]
        expect(calcAverage(times)).toBe(30.0)
      })

      it('小数点を含む平均を計算する', () => {
        const times: TimeEntryLike[] = [
          { time: 30.0 },
          { time: 31.0 }
        ]
        expect(calcAverage(times)).toBe(30.5)
      })
    })

    describe('異常系', () => {
      it('空の配列はnullを返す', () => {
        expect(calcAverage([])).toBeNull()
      })

      it('タイムが0以下のエントリは無視する', () => {
        const times: TimeEntryLike[] = [
          { time: 0 },
          { time: 30.0 },
          { time: 32.0 }
        ]
        expect(calcAverage(times)).toBe(31.0)
      })

      it('すべてのタイムが無効な場合はnullを返す', () => {
        const times: TimeEntryLike[] = [
          { time: 0 },
          { time: -1 }
        ]
        expect(calcAverage(times)).toBeNull()
      })
    })
  })

  describe('calcSum', () => {
    describe('正常系', () => {
      it('合計タイムを返す', () => {
        const times: TimeEntryLike[] = [
          { time: 30.0 },
          { time: 32.0 },
          { time: 33.0 }
        ]
        expect(calcSum(times)).toBe(95.0)
      })

      it('1件のタイムはそのまま返す', () => {
        const times: TimeEntryLike[] = [{ time: 30.0 }]
        expect(calcSum(times)).toBe(30.0)
      })
    })

    describe('異常系', () => {
      it('空の配列は0を返す', () => {
        expect(calcSum([])).toBe(0)
      })

      it('タイムが0以下のエントリは無視する', () => {
        const times: TimeEntryLike[] = [
          { time: 0 },
          { time: 30.0 },
          { time: -10 }
        ]
        expect(calcSum(times)).toBe(30.0)
      })
    })
  })

  // =============================================================================
  // フォーマット関数
  // =============================================================================
  describe('formatTime', () => {
    describe('正常系', () => {
      it('0秒は"0.0"を返す', () => {
        expect(formatTime(0)).toBe('0.0')
      })

      it('1分未満の秒数はSS.m形式を返す', () => {
        expect(formatTime(30.5)).toBe('30.5')
        expect(formatTime(59.94)).toBe('59.9')
      })

      it('59.99秒は60.0秒に丸まるため1:00.0形式を返す', () => {
        expect(formatTime(59.99)).toBe('1:00.0')
      })

      it('1分以上の秒数はM:SS.m形式を返す', () => {
        expect(formatTime(60)).toBe('1:00.0')
        expect(formatTime(65.42)).toBe('1:05.4')
        expect(formatTime(125.5)).toBe('2:05.5')
      })

      it('10分以上の秒数も正しくフォーマットする', () => {
        expect(formatTime(600)).toBe('10:00.0')
        expect(formatTime(3599.99)).toBe('60:00.0')
      })
    })

    describe('異常系', () => {
      it('負の秒数は"0.0"を返す', () => {
        expect(formatTime(-1)).toBe('0.0')
        expect(formatTime(-100)).toBe('0.0')
      })

      it('Infinityは"0.0"を返す', () => {
        expect(formatTime(Infinity)).toBe('0.0')
        expect(formatTime(-Infinity)).toBe('0.0')
      })

      it('NaNは"0.0"を返す', () => {
        expect(formatTime(NaN)).toBe('0.0')
      })
    })
  })

  describe('formatTimeShort', () => {
    describe('正常系', () => {
      it('0秒は空文字を返す', () => {
        expect(formatTimeShort(0)).toBe('')
      })

      it('1分未満の秒数はSS.m形式を返す', () => {
        expect(formatTimeShort(30.5)).toBe('30.5')
        expect(formatTimeShort(59.94)).toBe('59.9')
      })

      it('59.99秒は60.0秒に丸まるため1:00.0形式を返す', () => {
        expect(formatTimeShort(59.99)).toBe('1:00.0')
      })

      it('1分以上の秒数はM:SS.m形式を返す', () => {
        expect(formatTimeShort(60)).toBe('1:00.0')
        expect(formatTimeShort(65.42)).toBe('1:05.4')
      })
    })

    describe('異常系', () => {
      it('負の秒数は空文字を返す', () => {
        expect(formatTimeShort(-1)).toBe('')
      })

      it('Infinityは空文字を返す', () => {
        expect(formatTimeShort(Infinity)).toBe('')
      })

      it('NaNは空文字を返す', () => {
        expect(formatTimeShort(NaN)).toBe('')
      })
    })
  })

  describe('formatTimeFull', () => {
    describe('正常系', () => {
      it('0秒は"0:00.0"を返す', () => {
        expect(formatTimeFull(0)).toBe('0:00.0')
      })

      it('1分未満でも分を表示する', () => {
        expect(formatTimeFull(30.5)).toBe('0:30.5')
        expect(formatTimeFull(59.99)).toBe('1:00.0')
      })

      it('1分以上の秒数を正しくフォーマットする', () => {
        expect(formatTimeFull(60)).toBe('1:00.0')
        expect(formatTimeFull(65.42)).toBe('1:05.4')
      })
    })

    describe('異常系', () => {
      it('負の秒数は"0:00.0"を返す', () => {
        expect(formatTimeFull(-1)).toBe('0:00.0')
      })

      it('Infinityは"0:00.0"を返す', () => {
        expect(formatTimeFull(Infinity)).toBe('0:00.0')
      })

      it('NaNは"0:00.0"を返す', () => {
        expect(formatTimeFull(NaN)).toBe('0:00.0')
      })
    })
  })

  describe('formatTimeDiff', () => {
    describe('正常系', () => {
      it('正の差は+を付ける', () => {
        expect(formatTimeDiff(65.42, 64.00)).toBe('+1.42')
      })

      it('負の差は-を付ける', () => {
        expect(formatTimeDiff(64.00, 65.42)).toBe('-1.42')
      })

      it('差が0の場合は+0.00を返す', () => {
        expect(formatTimeDiff(60.00, 60.00)).toBe('+0.00')
      })

      it('小数点以下2桁で四捨五入する', () => {
        expect(formatTimeDiff(60.456, 60.00)).toBe('+0.46')
        expect(formatTimeDiff(60.454, 60.00)).toBe('+0.45')
      })
    })
  })

  // =============================================================================
  // パース関数
  // =============================================================================
  describe('parseTime', () => {
    describe('正常系', () => {
      it('MM:SS.ms形式をパースできる', () => {
        expect(parseTime('1:23.45')).toBe(83.45)
        expect(parseTime('2:05.50')).toBe(125.5)
        expect(parseTime('0:30.00')).toBe(30.0)
      })

      it('SS.ms形式をパースできる', () => {
        expect(parseTime('23.45')).toBe(23.45)
        expect(parseTime('59.99')).toBe(59.99)
      })

      it('前後の空白をトリムする', () => {
        expect(parseTime('  1:23.45  ')).toBe(83.45)
      })

      it('末尾のsをトリミングできる', () => {
        expect(parseTime('23.45s')).toBe(23.45)
        expect(parseTime('30s')).toBe(30)
      })

      it('整数もパースできる', () => {
        expect(parseTime('30')).toBe(30)
        expect(parseTime('1:30')).toBe(90)
      })
    })

    describe('異常系', () => {
      it('空文字列は0を返す', () => {
        expect(parseTime('')).toBe(0)
        expect(parseTime('   ')).toBe(0)
      })

      it('無効な文字列は0を返す', () => {
        expect(parseTime('abc')).toBe(0)
        expect(parseTime('invalid')).toBe(0)
      })

      it('負の値は0を返す', () => {
        expect(parseTime('-1:23.45')).toBe(0)
        expect(parseTime('-23.45')).toBe(0)
      })
    })

    describe('柔軟な区切り文字', () => {
      it('ハイフン区切りをパースできる（2パーツ: SS-ms）', () => {
        expect(parseTime('31-2')).toBe(31.20)
        expect(parseTime('31-20')).toBe(31.20)
        expect(parseTime('59-99')).toBe(59.99)
      })

      it('3パーツ形式をパースできる（M-SS-ms）', () => {
        expect(parseTime('1-05-3')).toBe(65.30)
        expect(parseTime('1-05-30')).toBe(65.30)
        expect(parseTime('2-30-50')).toBe(150.50)
      })

      it('全角文字を区切りとして認識する', () => {
        expect(parseTime('1：05。30')).toBe(65.30)
        expect(parseTime('31ー2')).toBe(31.20)
      })

      it('従来形式との互換性', () => {
        expect(parseTime('1:23.45')).toBe(83.45)
        expect(parseTime('23.45')).toBe(23.45)
        expect(parseTime('30')).toBe(30)
      })

      it('混合区切り文字をパースできる', () => {
        expect(parseTime('1:05-3')).toBe(65.30)
        expect(parseTime('1-05.3')).toBe(65.30)
      })
    })
  })

  describe('parseTimeStrict', () => {
    describe('正常系', () => {
      it('MM:SS.ms形式をパースできる', () => {
        expect(parseTimeStrict('1:23.45')).toBe(83.45)
        expect(parseTimeStrict('2:05.50')).toBe(125.5)
      })

      it('SS.ms形式をパースできる', () => {
        expect(parseTimeStrict('23.45')).toBe(23.45)
      })

      it('前後の空白をトリムする', () => {
        expect(parseTimeStrict('  1:23.45  ')).toBe(83.45)
      })
    })

    describe('異常系', () => {
      it('空文字列はnullを返す', () => {
        expect(parseTimeStrict('')).toBeNull()
        expect(parseTimeStrict('   ')).toBeNull()
      })

      it('無効な文字列はnullを返す', () => {
        expect(parseTimeStrict('abc')).toBeNull()
        expect(parseTimeStrict('invalid')).toBeNull()
      })

      it('コロンが2つ以上ある場合はnullを返す', () => {
        expect(parseTimeStrict('1:2:3')).toBeNull()
        expect(parseTimeStrict('1:2:3.45')).toBeNull()
      })

      it('負の値はnullを返す', () => {
        expect(parseTimeStrict('-1:23.45')).toBeNull()
        expect(parseTimeStrict('-23.45')).toBeNull()
      })

      it('NaNを含む場合はnullを返す', () => {
        expect(parseTimeStrict('NaN')).toBeNull()
        expect(parseTimeStrict('NaN:30.00')).toBeNull()
      })

      it('Infinityを含む場合はnullを返す', () => {
        expect(parseTimeStrict('Infinity')).toBeNull()
      })
    })
  })

  // =============================================================================
  // ペース計算
  // =============================================================================
  describe('calculatePace', () => {
    describe('正常系', () => {
      it('100mあたりのペースを計算する', () => {
        // 200mを120秒 → 100mあたり60秒
        expect(calculatePace(120, 200)).toBe(60)
      })

      it('50mのペースを計算する', () => {
        // 50mを30秒 → 100mあたり60秒
        expect(calculatePace(30, 50)).toBe(60)
      })

      it('400mのペースを計算する', () => {
        // 400mを240秒 → 100mあたり60秒
        expect(calculatePace(240, 400)).toBe(60)
      })

      it('小数点を含むペースを計算する', () => {
        // 100mを55.5秒 → 100mあたり55.5秒
        expect(calculatePace(55.5, 100)).toBeCloseTo(55.5)
      })
    })

    describe('異常系', () => {
      it('距離が0の場合は0を返す', () => {
        expect(calculatePace(60, 0)).toBe(0)
      })

      it('距離が負の場合は0を返す', () => {
        expect(calculatePace(60, -100)).toBe(0)
      })
    })
  })

  // =============================================================================
  // 実際のユースケース
  // =============================================================================
  describe('実際の水泳タイムのユースケース', () => {
    it('100m自由形のタイムを処理する', () => {
      const timeStr = '55.42'
      const seconds = parseTime(timeStr)
      expect(seconds).toBe(55.42)
      expect(formatTime(seconds)).toBe('55.4')
    })

    it('200m個人メドレーのタイムを処理する', () => {
      const timeStr = '2:15.30'
      const seconds = parseTime(timeStr)
      expect(seconds).toBe(135.3)
      expect(formatTime(seconds)).toBe('2:15.3')
    })

    it('1500m自由形のタイムを処理する', () => {
      const timeStr = '16:30.00'
      const seconds = parseTime(timeStr)
      expect(seconds).toBe(990)
      expect(formatTime(seconds)).toBe('16:30.0')
    })

    it('複数のタイムから最速と平均を計算する', () => {
      const times: TimeEntryLike[] = [
        { time: 55.42 },
        { time: 56.10 },
        { time: 54.80 }
      ]

      expect(calcFastest(times)).toBe(54.80)
      expect(calcAverage(times)).toBeCloseTo(55.44, 2)
      expect(calcSum(times)).toBeCloseTo(166.32, 2)
    })

    it('ベストタイムとの差を計算する', () => {
      const currentTime = 56.10
      const bestTime = 55.42
      const diff = formatTimeDiff(currentTime, bestTime)
      expect(diff).toBe('+0.68')
    })
  })
})
