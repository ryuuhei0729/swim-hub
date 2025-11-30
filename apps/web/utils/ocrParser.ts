/**
 * OCR結果を構造化JSONに変換するパーサー
 */

import { TimeEntry } from '@apps/shared/types/ui'

export interface ParsedMenu {
  style: string
  distance: number
  reps: number
  sets: number
  circleTime: number | null
  times: TimeEntry[]
}

export interface ParsedOcrResult {
  menus: ParsedMenu[]
}

/**
 * タイム文字列を秒数に変換
 * @param timeStr タイム文字列（例: "14-0", "17-5", "1-40-1", "2-05-5"）
 * @param distance 距離（m）（タイム形式の推測に使用）
 * @returns 秒数
 */
function parseTimeString(timeStr: string, distance?: number): number {
  if (!timeStr || timeStr.trim() === '') return 0

  const trimmed = timeStr.trim().replace(/\.$/, '') // 末尾のピリオドを削除

  // X-XX-YY形式（分:秒.ミリ秒）例: 1-40-1 → 1:40.10
  const threePartMatch = trimmed.match(/^(\d+)-(\d{2})-(\d)$/)
  if (threePartMatch) {
    const [, minutes, seconds, tenths] = threePartMatch
    return parseInt(minutes) * 60 + parseInt(seconds) + parseInt(tenths) / 10
  }

  // XX-YYY-Z形式（結合されたタイムの可能性）例: 17-125-4
  // これを17-1と25-4に分割する可能性を検出
  const combinedMatch = trimmed.match(/^(\d+)-(\d{3,})-(\d)$/)
  if (combinedMatch) {
    const [, first, middle, last] = combinedMatch
    // 中間部分が3桁以上の場合、適切な位置で分割を試みる
    // 例: 17-125-4 → 17-1 と 25-4
    if (middle.length >= 3) {
      // 最初の2桁と残りに分割
      const firstPart = middle.substring(0, 2)
      const secondPart = middle.substring(2)
      // 2つのタイムとして解釈（最初のタイムのみ返す）
      // 実際には呼び出し側で分割処理を行う
      return parseTimeString(`${first}-${firstPart}`, distance)
    }
  }

  // XX-YY形式（秒.ミリ秒）例: 14-0 → 14.00秒、17-5 → 17.50秒
  const twoPartMatch = trimmed.match(/^(\d+)-(\d+)$/)
  if (twoPartMatch) {
    const [, seconds, tenths] = twoPartMatch
    const totalSeconds = parseInt(seconds) + parseInt(tenths) / 10

    // 距離に応じた一般的なタイム範囲を考慮
    if (distance) {
      if (distance === 50 && totalSeconds >= 60) {
        // 50mで60秒以上 → 1分以上として解釈（分:秒形式）
        const minutes = Math.floor(totalSeconds / 60)
        const remainingSeconds = totalSeconds % 60
        return minutes * 60 + remainingSeconds
      } else if (distance === 100 && totalSeconds >= 120) {
        // 100mで120秒以上 → 2分以上として解釈
        const minutes = Math.floor(totalSeconds / 60)
        const remainingSeconds = totalSeconds % 60
        return minutes * 60 + remainingSeconds
      }
    }

    return totalSeconds
  }

  // 単純な数値（秒数として解釈）
  const numericMatch = trimmed.match(/^\d+$/)
  if (numericMatch) {
    return parseFloat(trimmed)
  }

  return 0
}

/**
 * 結合されたタイム文字列を分割
 * @param timeStr 結合されたタイム文字列（例: "17-125-4"）
 * @returns 分割されたタイム文字列の配列（例: ["17-1", "25-4"]）
 */
function splitCombinedTime(timeStr: string): string[] {
  const trimmed = timeStr.trim()
  
  // XX-YYY-Z形式（例: 17-125-4）を検出
  const combinedMatch = trimmed.match(/^(\d+)-(\d{3,})-(\d)$/)
  if (combinedMatch) {
    const [, first, middle, last] = combinedMatch
    if (middle.length >= 3) {
      // 中間部分を2桁ずつに分割して、2つのタイムとして解釈
      // 例: 17-125-4 → 17-1 と 25-4
      const firstPart = middle.substring(0, 2)
      const secondPart = middle.substring(2)
      
      // 2つのタイムを返す
      return [`${first}-${firstPart}`, `${secondPart}-${last}`]
    }
  }
  
  // 分割できない場合はそのまま返す
  return [trimmed]
}

/**
 * メニュー情報を抽出（例: "100 x 5", "100x 4 (2'30")", "25x4"）
 */
function extractMenuInfo(text: string): {
  distance: number | null
  reps: number | null
  circleTime: number | null
} {
  let distance: number | null = null
  let reps: number | null = null
  let circleTime: number | null = null

  // "100 x 5" または "100x5" 形式
  const menuMatch = text.match(/(\d+)\s*x\s*(\d+)/i)
  if (menuMatch) {
    distance = parseInt(menuMatch[1])
    reps = parseInt(menuMatch[2])
  }

  // "25x4" 形式（スペースなし）
  if (!distance && !reps) {
    const compactMatch = text.match(/(\d+)x(\d+)/i)
    if (compactMatch) {
      distance = parseInt(compactMatch[1])
      reps = parseInt(compactMatch[2])
    }
  }

  // サークルタイム抽出（例: "(2'30")", "(2:30)"）
  const circleMatch = text.match(/\((\d+)[':](\d+)\)/)
  if (circleMatch) {
    const minutes = parseInt(circleMatch[1])
    const seconds = parseInt(circleMatch[2])
    circleTime = minutes * 60 + seconds
  }

  return { distance, reps, circleTime }
}

/**
 * 種目を抽出（Fr, Ba, Br, Fly, IM）
 */
function extractStyle(text: string): string {
  const upperText = text.toUpperCase()
  if (upperText.includes('FR') || upperText.includes('フリー') || upperText.includes('FREE')) {
    return 'Fr'
  }
  if (upperText.includes('BA') || upperText.includes('バック') || upperText.includes('BACK')) {
    return 'Ba'
  }
  if (upperText.includes('BR') || upperText.includes('ブレスト') || upperText.includes('BREAST')) {
    return 'Br'
  }
  if (upperText.includes('FLY') || upperText.includes('バタフライ') || upperText.includes('BUTTERFLY')) {
    return 'Fly'
  }
  if (upperText.includes('IM') || upperText.includes('メドレー') || upperText.includes('MEDLEY')) {
    return 'IM'
  }
  return 'Fr' // デフォルト
}

/**
 * OCRテキストを行ごとに分割し、セットを識別
 */
function identifySets(text: string): string[] {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  const sets: string[] = []
  let currentSet: string[] = []

  for (const line of lines) {
    // 横線やセパレーターでセットを分割
    if (line.match(/^[-_=]{3,}$/)) {
      if (currentSet.length > 0) {
        sets.push(currentSet.join('\n'))
        currentSet = []
      }
      continue
    }

    // メニューヘッダー（例: "100 x 5", "25x4"）でセットを識別
    if (line.match(/\d+\s*x\s*\d+/i) || line.match(/\d+x\d+/i)) {
      if (currentSet.length > 0) {
        sets.push(currentSet.join('\n'))
        currentSet = []
      }
    }

    currentSet.push(line)
  }

  if (currentSet.length > 0) {
    sets.push(currentSet.join('\n'))
  }

  return sets
}

/**
 * セットテキストからタイムエントリーを抽出
 */
function extractTimes(setText: string, distance?: number): TimeEntry[] {
  const lines = setText.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  const times: TimeEntry[] = []
  let setNumber = 1
  let repNumber = 1

  for (const line of lines) {
    // 行番号をスキップ（例: "1", "2", "3"）
    if (line.match(/^\d+$/)) {
      continue
    }

    // タイム文字列を抽出（数字とハイフンを含む）
    const timeMatches = line.match(/(\d+-\d+(?:-\d+)?)/g)
    if (timeMatches) {
      for (const timeMatch of timeMatches) {
        // 結合されたタイムを分割
        const splitTimes = splitCombinedTime(timeMatch)
        for (const timeStr of splitTimes) {
          const seconds = parseTimeString(timeStr, distance)
          if (seconds > 0) {
            times.push({
              setNumber,
              repNumber,
              time: seconds
            })
            repNumber++
          }
        }
      }
      setNumber++
      repNumber = 1
    }
  }

  return times
}

/**
 * OCRテキストを構造化JSONに変換
 */
export function parseOcrText(text: string): ParsedOcrResult {
  const sets = identifySets(text)
  const menus: ParsedMenu[] = []

  for (const setText of sets) {
    const menuInfo = extractMenuInfo(setText)
    const style = extractStyle(setText)
    const times = extractTimes(setText, menuInfo.distance || undefined)

    if (menuInfo.distance && menuInfo.reps && times.length > 0) {
      // セット数を自動判定（タイムエントリーから）
      const maxSetNumber = Math.max(...times.map(t => t.setNumber), 1)
      const repsPerSet = menuInfo.reps

      menus.push({
        style,
        distance: menuInfo.distance,
        reps: repsPerSet,
        sets: maxSetNumber,
        circleTime: menuInfo.circleTime,
        times
      })
    }
  }

  return { menus }
}

