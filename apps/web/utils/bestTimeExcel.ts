import ExcelJS from 'exceljs'

// =============================================================================
// 型定義
// =============================================================================

// パース済みデータの型定義
export interface ParsedBestTimeData {
  records: Array<{
    styleId: number
    styleName: string
    time: number // 秒単位
    isRelaying: boolean
    poolType: 0 | 1 // 0: 短水路(25m), 1: 長水路(50m)
    note: string | null
  }>
  errors: Array<{
    row: number
    sheet: string
    message: string
  }>
}

// 種目定義
interface StyleDefinition {
  id: number
  nameJp: string
  name: string
  style: 'fr' | 'br' | 'ba' | 'fly' | 'im'
  distance: number
}

// =============================================================================
// 定数定義
// =============================================================================

// 種目マスターデータ（stylesテーブルと同期）
const STYLES: StyleDefinition[] = [
  { id: 1, nameJp: '25m自由形', name: '25Fr', style: 'fr', distance: 25 },
  { id: 2, nameJp: '50m自由形', name: '50Fr', style: 'fr', distance: 50 },
  { id: 3, nameJp: '100m自由形', name: '100Fr', style: 'fr', distance: 100 },
  { id: 4, nameJp: '200m自由形', name: '200Fr', style: 'fr', distance: 200 },
  { id: 5, nameJp: '400m自由形', name: '400Fr', style: 'fr', distance: 400 },
  { id: 6, nameJp: '800m自由形', name: '800Fr', style: 'fr', distance: 800 },
  { id: 7, nameJp: '1500m自由形', name: '1500Fr', style: 'fr', distance: 1500 },
  { id: 8, nameJp: '25m平泳ぎ', name: '25Br', style: 'br', distance: 25 },
  { id: 9, nameJp: '50m平泳ぎ', name: '50Br', style: 'br', distance: 50 },
  { id: 10, nameJp: '100m平泳ぎ', name: '100Br', style: 'br', distance: 100 },
  { id: 11, nameJp: '200m平泳ぎ', name: '200Br', style: 'br', distance: 200 },
  { id: 12, nameJp: '25m背泳ぎ', name: '25Ba', style: 'ba', distance: 25 },
  { id: 13, nameJp: '50m背泳ぎ', name: '50Ba', style: 'ba', distance: 50 },
  { id: 14, nameJp: '100m背泳ぎ', name: '100Ba', style: 'ba', distance: 100 },
  { id: 15, nameJp: '200m背泳ぎ', name: '200Ba', style: 'ba', distance: 200 },
  { id: 16, nameJp: '25mバタフライ', name: '25Fly', style: 'fly', distance: 25 },
  { id: 17, nameJp: '50mバタフライ', name: '50Fly', style: 'fly', distance: 50 },
  { id: 18, nameJp: '100mバタフライ', name: '100Fly', style: 'fly', distance: 100 },
  { id: 19, nameJp: '200mバタフライ', name: '200Fly', style: 'fly', distance: 200 },
  { id: 20, nameJp: '100m個人メドレー', name: '100IM', style: 'im', distance: 100 },
  { id: 21, nameJp: '200m個人メドレー', name: '200IM', style: 'im', distance: 200 },
  { id: 22, nameJp: '400m個人メドレー', name: '400IM', style: 'im', distance: 400 },
]

// 泳法名（日本語）
const STYLE_NAMES = ['自由形', '平泳ぎ', '背泳ぎ', 'バタフライ', '個人メドレー']

// 泳法名（引き継ぎ有シート用）
const RELAY_STYLE_NAMES = ['自由形', '平泳ぎ', 'バタフライ']

// 距離（短水路用）
const SHORT_COURSE_DISTANCES = [25, 50, 100, 200, 400, 800, 1500]

// 距離（長水路用）- 25mなし
const LONG_COURSE_DISTANCES = [50, 100, 200, 400, 800, 1500]

// 距離（引き継ぎ有シート用 - 短水路）
const SHORT_RELAY_DISTANCES = [25, 50, 100, 200]

// 距離（引き継ぎ有シート用 - 長水路）- 25mなし
const LONG_RELAY_DISTANCES = [50, 100, 200]

// 泳法コードマッピング
const STYLE_CODE_MAP: Record<string, 'fr' | 'br' | 'ba' | 'fly' | 'im'> = {
  '自由形': 'fr',
  '平泳ぎ': 'br',
  '背泳ぎ': 'ba',
  'バタフライ': 'fly',
  '個人メドレー': 'im',
}

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * 種目/距離の組み合わせが有効かどうかを判定
 * @param styleCode 泳法コード
 * @param distance 距離
 * @param isRelay 引き継ぎ有りかどうか
 * @param isLongCourse 長水路かどうか（デフォルト: false）
 */
function isValidCombination(
  styleCode: string, 
  distance: number, 
  isRelay: boolean,
  isLongCourse: boolean = false
): boolean {
  // 引き継ぎ有シートの場合
  if (isRelay) {
    // 200mはFrのみ
    if (distance === 200 && styleCode !== 'fr') return false
    // Ba（背泳ぎ）とIM（個人メドレー）は引き継ぎなし
    if (styleCode === 'ba' || styleCode === 'im') return false
    return true
  }
  
  // 通常シートの場合
  // 長水路の100m個人メドレーは存在しない
  if (isLongCourse && styleCode === 'im' && distance === 100) return false
  
  // 個人メドレーは100m, 200m, 400mのみ（短水路のみ100mあり）
  if (styleCode === 'im' && ![100, 200, 400].includes(distance)) return false
  
  // 平泳ぎ、背泳ぎ、バタフライは25m, 50m, 100m, 200mのみ
  if (['br', 'ba', 'fly'].includes(styleCode) && ![25, 50, 100, 200].includes(distance)) return false
  
  return true
}

/**
 * style_idを取得
 */
function getStyleId(styleCode: string, distance: number): number | null {
  const style = STYLES.find(s => s.style === styleCode && s.distance === distance)
  return style ? style.id : null
}

/**
 * タイム文字列を秒数に変換
 * 対応形式:
 * - 分:秒形式（2桁分）: 00:00.00, 00:00.0, 00:00
 * - 分:秒形式（1桁分）: 0:00.00, 0:00.0, 0:00
 * - 秒のみ形式: 00.00, 00.0, 00
 */
function parseTimeToSeconds(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null
  
  const cleanStr = timeStr.trim()
  if (!cleanStr) return null
  
  // 形式1: m:ss.00 または mm:ss.00（1-2桁分:2桁秒.2桁）
  const colonFormat2Decimal = /^(\d{1,2}):(\d{2})\.(\d{2})$/
  const colonMatch2Decimal = cleanStr.match(colonFormat2Decimal)
  if (colonMatch2Decimal) {
    const minutes = parseInt(colonMatch2Decimal[1], 10)
    const seconds = parseInt(colonMatch2Decimal[2], 10)
    const centiseconds = parseInt(colonMatch2Decimal[3], 10)
    if (seconds >= 60) return null // 秒が60以上は無効
    return minutes * 60 + seconds + centiseconds / 100
  }
  
  // 形式2: m:ss.0 または mm:ss.0（1-2桁分:2桁秒.1桁）
  const colonFormat1Decimal = /^(\d{1,2}):(\d{2})\.(\d{1})$/
  const colonMatch1Decimal = cleanStr.match(colonFormat1Decimal)
  if (colonMatch1Decimal) {
    const minutes = parseInt(colonMatch1Decimal[1], 10)
    const seconds = parseInt(colonMatch1Decimal[2], 10)
    const deciseconds = parseInt(colonMatch1Decimal[3], 10)
    if (seconds >= 60) return null // 秒が60以上は無効
    return minutes * 60 + seconds + deciseconds / 10
  }
  
  // 形式3: m:ss または mm:ss（1-2桁分:2桁秒、小数なし）
  const colonFormatNoDecimal = /^(\d{1,2}):(\d{2})$/
  const colonMatchNoDecimal = cleanStr.match(colonFormatNoDecimal)
  if (colonMatchNoDecimal) {
    const minutes = parseInt(colonMatchNoDecimal[1], 10)
    const seconds = parseInt(colonMatchNoDecimal[2], 10)
    if (seconds >= 60) return null // 秒が60以上は無効
    return minutes * 60 + seconds
  }
  
  // 形式4: ss.00（2桁秒.2桁）
  const simpleFormat2Decimal = /^(\d{1,2})\.(\d{2})$/
  const simpleMatch2Decimal = cleanStr.match(simpleFormat2Decimal)
  if (simpleMatch2Decimal) {
    const totalSeconds = parseInt(simpleMatch2Decimal[1], 10)
    const centiseconds = parseInt(simpleMatch2Decimal[2], 10)
    return totalSeconds + centiseconds / 100
  }
  
  // 形式5: ss.0（2桁秒.1桁）
  const simpleFormat1Decimal = /^(\d{1,2})\.(\d{1})$/
  const simpleMatch1Decimal = cleanStr.match(simpleFormat1Decimal)
  if (simpleMatch1Decimal) {
    const totalSeconds = parseInt(simpleMatch1Decimal[1], 10)
    const deciseconds = parseInt(simpleMatch1Decimal[2], 10)
    return totalSeconds + deciseconds / 10
  }
  
  // 形式6: ss（2桁秒、小数なし）
  const simpleFormatNoDecimal = /^(\d{1,2})$/
  const simpleMatchNoDecimal = cleanStr.match(simpleFormatNoDecimal)
  if (simpleMatchNoDecimal) {
    const totalSeconds = parseInt(simpleMatchNoDecimal[1], 10)
    return totalSeconds
  }
  
  return null
}

/**
 * 許可されるタイム形式の説明文
 */
export const ALLOWED_TIME_FORMATS = '対応形式: 00:00.00, 00:00.0, 00:00, 0:00.00, 0:00.0, 0:00, 00.00, 00.0, 00'

/**
 * 秒数をタイム文字列に変換（表示用）
 */
export function formatTimeFromSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const centiseconds = Math.round((seconds % 1) * 100)
  
  if (minutes > 0) {
    return `${minutes}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`
  }
  return `${secs}.${centiseconds.toString().padStart(2, '0')}`
}

// =============================================================================
// シート書式設定
// =============================================================================

/**
 * シートのスタイルカラー
 */
const STYLE_COLORS: Record<string, { header: string; cell: string }> = {
  '自由形': { header: 'FFFFF2CC', cell: 'FFFFFBE6' },      // 黄色系
  '平泳ぎ': { header: 'FFD5E8D4', cell: 'FFE8F5E6' },      // 緑系
  '背泳ぎ': { header: 'FFF8CECC', cell: 'FFFCE4E4' },      // 赤系
  'バタフライ': { header: 'FFDAE8FC', cell: 'FFEDF4FE' },  // 青系
  '個人メドレー': { header: 'FFE1D5E7', cell: 'FFF3EDF7' }, // 紫系
}

/**
 * シートの書式設定を適用（通常シート）
 */
function applyNormalSheetFormatting(
  worksheet: ExcelJS.Worksheet,
  distances: number[],
  styleNames: string[],
  isLongCourse: boolean = false
) {
  // 列幅の設定
  worksheet.getColumn(1).width = 10 // 距離
  
  let colIndex = 2
  styleNames.forEach(() => {
    worksheet.getColumn(colIndex).width = 20 // タイム
    worksheet.getColumn(colIndex + 1).width = 20 // 備考
    colIndex += 2
  })
  
  // ヘッダー行の書式設定
  const headerRow = worksheet.getRow(1)
  headerRow.height = 30
  
  // 距離ヘッダー
  const distanceHeader = headerRow.getCell(1)
  distanceHeader.value = '距離'
  distanceHeader.font = { bold: true, size: 11 }
  distanceHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  }
  distanceHeader.alignment = { vertical: 'middle', horizontal: 'center' }
  distanceHeader.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  }
  
  // 種目ヘッダー
  colIndex = 2
  styleNames.forEach((styleName) => {
    const colors = STYLE_COLORS[styleName]
    
    // タイムヘッダー
    const timeHeader = headerRow.getCell(colIndex)
    timeHeader.value = styleName
    timeHeader.font = { bold: true, size: 11 }
    timeHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.header }
    }
    timeHeader.alignment = { vertical: 'middle', horizontal: 'center' }
    timeHeader.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
    
    // 備考ヘッダー
    const noteHeader = headerRow.getCell(colIndex + 1)
    noteHeader.value = '備考'
    noteHeader.font = { bold: true, size: 10 }
    noteHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.header }
    }
    noteHeader.alignment = { vertical: 'middle', horizontal: 'center' }
    noteHeader.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
    
    colIndex += 2
  })
  
  // データ行の書式設定
  distances.forEach((distance, rowIdx) => {
    const row = worksheet.getRow(rowIdx + 2)
    row.height = 28
    
    // 距離セル
    const distanceCell = row.getCell(1)
    distanceCell.value = `${distance}m`
    distanceCell.font = { bold: true, size: 11 }
    distanceCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF5F5F5' }
    }
    distanceCell.alignment = { vertical: 'middle', horizontal: 'center' }
    distanceCell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
    
    // 種目セル
    colIndex = 2
    styleNames.forEach((styleName) => {
      const styleCode = STYLE_CODE_MAP[styleName]
      const isValid = isValidCombination(styleCode, distance, false, isLongCourse)
      const colors = STYLE_COLORS[styleName]
      
      // タイムセル
      const timeCell = row.getCell(colIndex)
      timeCell.alignment = { vertical: 'middle', horizontal: 'center' }
      timeCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      }
      // テキスト形式に設定（Excelが時間として自動変換しないように）
      timeCell.numFmt = '@'
      
      if (isValid) {
        timeCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: colors.cell }
        }
      } else {
        timeCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD0D0D0' }
        }
        timeCell.value = '━'
        timeCell.font = { color: { argb: 'FF808080' } }
      }
      
      // 備考セル
      const noteCell = row.getCell(colIndex + 1)
      noteCell.alignment = { vertical: 'middle', horizontal: 'left' }
      noteCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      }
      
      if (isValid) {
        noteCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: colors.cell }
        }
      } else {
        noteCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD0D0D0' }
        }
        noteCell.value = '━'
        noteCell.font = { color: { argb: 'FF808080' } }
      }
      
      colIndex += 2
    })
  })
}

/**
 * シートの書式設定を適用（引き継ぎ有シート）
 */
function applyRelaySheetFormatting(
  worksheet: ExcelJS.Worksheet,
  distances: number[],
  styleNames: string[]
) {
  // 列幅の設定
  worksheet.getColumn(1).width = 10 // 距離
  
  let colIndex = 2
  styleNames.forEach(() => {
    worksheet.getColumn(colIndex).width = 20 // タイム
    worksheet.getColumn(colIndex + 1).width = 20 // 備考
    colIndex += 2
  })
  
  // ヘッダー行の書式設定
  const headerRow = worksheet.getRow(1)
  headerRow.height = 30
  
  // 距離ヘッダー
  const distanceHeader = headerRow.getCell(1)
  distanceHeader.value = '距離'
  distanceHeader.font = { bold: true, size: 11 }
  distanceHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  }
  distanceHeader.alignment = { vertical: 'middle', horizontal: 'center' }
  distanceHeader.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  }
  
  // 種目ヘッダー
  colIndex = 2
  styleNames.forEach((styleName) => {
    const colors = STYLE_COLORS[styleName]
    
    // タイムヘッダー
    const timeHeader = headerRow.getCell(colIndex)
    timeHeader.value = styleName
    timeHeader.font = { bold: true, size: 11 }
    timeHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.header }
    }
    timeHeader.alignment = { vertical: 'middle', horizontal: 'center' }
    timeHeader.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
    
    // 備考ヘッダー
    const noteHeader = headerRow.getCell(colIndex + 1)
    noteHeader.value = '備考'
    noteHeader.font = { bold: true, size: 10 }
    noteHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: colors.header }
    }
    noteHeader.alignment = { vertical: 'middle', horizontal: 'center' }
    noteHeader.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
    
    colIndex += 2
  })
  
  // データ行の書式設定
  distances.forEach((distance, rowIdx) => {
    const row = worksheet.getRow(rowIdx + 2)
    row.height = 28
    
    // 距離セル
    const distanceCell = row.getCell(1)
    distanceCell.value = `${distance}m`
    distanceCell.font = { bold: true, size: 11 }
    distanceCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF5F5F5' }
    }
    distanceCell.alignment = { vertical: 'middle', horizontal: 'center' }
    distanceCell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
    
    // 種目セル
    colIndex = 2
    styleNames.forEach((styleName) => {
      const styleCode = STYLE_CODE_MAP[styleName]
      const isValid = isValidCombination(styleCode, distance, true)
      const colors = STYLE_COLORS[styleName]
      
      // タイムセル
      const timeCell = row.getCell(colIndex)
      timeCell.alignment = { vertical: 'middle', horizontal: 'center' }
      timeCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      }
      // テキスト形式に設定（Excelが時間として自動変換しないように）
      timeCell.numFmt = '@'
      
      if (isValid) {
        timeCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: colors.cell }
        }
      } else {
        timeCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD0D0D0' }
        }
        timeCell.value = '━'
        timeCell.font = { color: { argb: 'FF808080' } }
      }
      
      // 備考セル
      const noteCell = row.getCell(colIndex + 1)
      noteCell.alignment = { vertical: 'middle', horizontal: 'left' }
      noteCell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      }
      
      if (isValid) {
        noteCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: colors.cell }
        }
      } else {
        noteCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD0D0D0' }
        }
        noteCell.value = '━'
        noteCell.font = { color: { argb: 'FF808080' } }
      }
      
      colIndex += 2
    })
  })
}

// =============================================================================
// メイン関数
// =============================================================================

/**
 * ベストタイム一括入力用Excelテンプレートを生成
 */
export async function generateBestTimeTemplate(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  
  // シート1: 短水路
  const shortCourseSheet = workbook.addWorksheet('短水路')
  applyNormalSheetFormatting(shortCourseSheet, SHORT_COURSE_DISTANCES, STYLE_NAMES, false)
  
  // シート2: 短水路（引き継ぎ有）
  const shortRelaySheet = workbook.addWorksheet('短水路（引き継ぎ有）')
  applyRelaySheetFormatting(shortRelaySheet, SHORT_RELAY_DISTANCES, RELAY_STYLE_NAMES)
  
  // シート3: 長水路（25mなし、100m個人メドレーなし）
  const longCourseSheet = workbook.addWorksheet('長水路')
  applyNormalSheetFormatting(longCourseSheet, LONG_COURSE_DISTANCES, STYLE_NAMES, true)
  
  // シート4: 長水路（引き継ぎ有）（25mなし）
  const longRelaySheet = workbook.addWorksheet('長水路（引き継ぎ有）')
  applyRelaySheetFormatting(longRelaySheet, LONG_RELAY_DISTANCES, RELAY_STYLE_NAMES)
  
  return workbook
}

/**
 * ベストタイムテンプレートをダウンロード
 */
export async function downloadBestTimeTemplate(): Promise<void> {
  const workbook = await generateBestTimeTemplate()
  const buffer = await workbook.xlsx.writeBuffer()
  
  // Blobを作成してダウンロード
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'ベストタイム一括入力テンプレート.xlsx'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * Excelファイルを読み込んでパース
 */
export function parseBestTimeExcel(file: File): Promise<ParsedBestTimeData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = async (e) => {
      try {
        const data = e.target?.result
        if (!data) {
          reject(new Error('ファイルの読み込みに失敗しました'))
          return
        }
        
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(data as ArrayBuffer)
        
        const result: ParsedBestTimeData = {
          records: [],
          errors: []
        }
        
        // シートごとに処理
        const sheetConfigs = [
          { name: '短水路', poolType: 0 as const, isRelay: false, isLongCourse: false, distances: SHORT_COURSE_DISTANCES, styles: STYLE_NAMES },
          { name: '短水路（引き継ぎ有）', poolType: 0 as const, isRelay: true, isLongCourse: false, distances: SHORT_RELAY_DISTANCES, styles: RELAY_STYLE_NAMES },
          { name: '長水路', poolType: 1 as const, isRelay: false, isLongCourse: true, distances: LONG_COURSE_DISTANCES, styles: STYLE_NAMES },
          { name: '長水路（引き継ぎ有）', poolType: 1 as const, isRelay: true, isLongCourse: true, distances: LONG_RELAY_DISTANCES, styles: RELAY_STYLE_NAMES },
        ]
        
        sheetConfigs.forEach((config) => {
          const worksheet = workbook.getWorksheet(config.name)
          if (!worksheet) return
          
          config.distances.forEach((distance, rowIdx) => {
            const row = worksheet.getRow(rowIdx + 2) // ヘッダー行をスキップ
            
            let colIndex = 2
            config.styles.forEach((styleName) => {
              const styleCode = STYLE_CODE_MAP[styleName]
              
              // 有効な組み合わせかチェック（長水路の100m個人メドレーなど）
              if (!isValidCombination(styleCode, distance, config.isRelay, config.isLongCourse)) {
                colIndex += 2
                return
              }
              
              // タイムセルの値を取得
              const timeCell = row.getCell(colIndex)
              const noteCell = row.getCell(colIndex + 1)
              
              const timeValue = timeCell.value
              const noteValue = noteCell.value
              
              // 空セルはスキップ
              if (!timeValue || timeValue === '━') {
                colIndex += 2
                return
              }
              
              // タイム値をパース（Excelが時間として認識した場合も考慮）
              let timeInSeconds: number | null = null
              
              if (timeValue instanceof Date) {
                // Excelが時間として認識しDate型になった場合
                // Date型から時間部分を抽出して秒に変換
                const hours = timeValue.getHours()
                const minutes = timeValue.getMinutes()
                const seconds = timeValue.getSeconds()
                const ms = timeValue.getMilliseconds()
                timeInSeconds = hours * 3600 + minutes * 60 + seconds + ms / 1000
              } else if (typeof timeValue === 'number') {
                // Excelのシリアル値として認識された場合
                // 1日 = 1 なので、86400を掛けて秒に変換
                // ただし、1以上の場合は日付として認識されている可能性があるため、
                // 時間部分のみを取得（小数部分）
                const timePart = timeValue % 1
                timeInSeconds = timePart * 86400
              } else {
                // 文字列の場合
                const timeStr = String(timeValue).trim()
                timeInSeconds = parseTimeToSeconds(timeStr)
              }
              
              if (timeInSeconds === null || timeInSeconds <= 0) {
                const displayValue = timeValue instanceof Date 
                  ? timeValue.toISOString() 
                  : String(timeValue)
                result.errors.push({
                  row: rowIdx + 2,
                  sheet: config.name,
                  message: `${distance}m${styleName}のタイム形式が不正です: "${displayValue}"（${ALLOWED_TIME_FORMATS}）`
                })
                colIndex += 2
                return
              }
              
              // style_idを取得
              const styleId = getStyleId(styleCode, distance)
              if (styleId === null) {
                result.errors.push({
                  row: rowIdx + 2,
                  sheet: config.name,
                  message: `${distance}m${styleName}の種目が見つかりません`
                })
                colIndex += 2
                return
              }
              
              // 記録を追加
              result.records.push({
                styleId,
                styleName: `${distance}m${styleName}`,
                time: timeInSeconds,
                isRelaying: config.isRelay,
                poolType: config.poolType,
                note: noteValue && noteValue !== '━' ? String(noteValue).trim() : null
              })
              
              colIndex += 2
            })
          })
        })
        
        resolve(result)
      } catch (error) {
        reject(error)
      }
    }
    
    reader.onerror = () => {
      reject(new Error('ファイルの読み込みに失敗しました'))
    }
    
    reader.readAsArrayBuffer(file)
  })
}

