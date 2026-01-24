// =============================================================================
// シェアカード用ユーティリティ - Swim Hub
// タイムフォーマット、画像生成等のヘルパー関数
// =============================================================================

/**
 * 秒数をMM:SS.ss形式にフォーマット
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const wholeSecs = Math.floor(secs)
  const hundredths = Math.round((secs - wholeSecs) * 100)

  if (mins > 0) {
    return `${mins}:${wholeSecs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`
  }
  return `${wholeSecs}.${hundredths.toString().padStart(2, '0')}`
}

/**
 * リアクションタイムをフォーマット（0.XX形式）
 */
export function formatReactionTime(seconds: number): string {
  return seconds.toFixed(2)
}

/**
 * ラップタイムを計算（スプリットタイムから）
 */
export function calculateLapTimes(
  splitTimes: Array<{ distance: number; split_time: number }>
): Array<{ distance: number; lapTime: number; splitTime: number }> {
  const sorted = [...splitTimes].sort((a, b) => a.distance - b.distance)

  return sorted.map((split, index) => {
    const previousSplit = index > 0 ? sorted[index - 1].split_time : 0
    return {
      distance: split.distance,
      lapTime: split.split_time - previousSplit,
      splitTime: split.split_time,
    }
  })
}

/**
 * 距離をフォーマット（1000m以上はkm表記）
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000
    return km % 1 === 0 ? `${km}km` : `${km.toFixed(1)}km`
  }
  return `${meters}m`
}

/**
 * サークルタイムをフォーマット（MM:SS形式）
 */
export function formatCircle(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60

  if (mins > 0) {
    return `${mins}'${secs.toString().padStart(2, '0')}"`
  }
  return `${secs}"`
}

/**
 * 自己ベスト更新幅を計算
 */
export function calculateImprovement(
  newTime: number,
  previousBest: number
): { seconds: number; percentage: number } {
  const diff = previousBest - newTime
  const percentage = (diff / previousBest) * 100

  return {
    seconds: diff,
    percentage,
  }
}

/**
 * HTML要素を画像に変換
 * html-to-imageを使用（lab/oklch等のモダンなCSSカラー関数をサポート）
 */
export async function elementToImage(
  element: HTMLElement,
  scale: number = 2
): Promise<string> {
  const { toPng } = await import('html-to-image')

  return toPng(element, {
    pixelRatio: scale,
    cacheBust: true,
  })
}

/**
 * 画像をダウンロード
 */
export function downloadImage(dataUrl: string, filename: string): void {
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}

/**
 * 種目の短縮名を日本語に変換
 */
export function getStyleNameJp(shortName: string): string {
  const styleMap: Record<string, string> = {
    Fr: '自由形',
    Ba: '背泳ぎ',
    Br: '平泳ぎ',
    Fly: 'バタフライ',
    IM: '個人メドレー',
    MR: 'メドレーリレー',
    FR: 'フリーリレー',
  }
  return styleMap[shortName] || shortName
}

/**
 * カテゴリの日本語名を取得
 */
export function getCategoryNameJp(category: string): string {
  const categoryMap: Record<string, string> = {
    Swim: 'スイム',
    Pull: 'プル',
    Kick: 'キック',
  }
  return categoryMap[category] || category
}
