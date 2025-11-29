import { format, parse } from 'date-fns'
import ExcelJS from 'exceljs'

// =============================================================================
// 大会一括登録用Excel処理
// =============================================================================

// パース済みデータの型定義
export interface ParsedCompetitionData {
  competitions: Array<{
    title: string
    date: string
    end_date: string | null // 終了日（複数日開催の場合）
    place: string
    pool_type: number // 0: 25m, 1: 50m
    note: string | null
  }>
  errors: Array<{
    row: number
    sheet: string
    message: string
  }>
}

/**
 * シートの書式設定を適用（大会用）
 */
function applyCompetitionSheetFormatting(worksheet: ExcelJS.Worksheet) {
  // 列幅の設定
  worksheet.getColumn(1).width = 12 // 開始日
  worksheet.getColumn(2).width = 12 // 終了日
  worksheet.getColumn(3).width = 30 // 大会名
  worksheet.getColumn(4).width = 25 // 場所
  worksheet.getColumn(5).width = 12 // プール種別
  worksheet.getColumn(6).width = 35 // 備考

  // ヘッダー行の書式設定
  const headerRow = worksheet.getRow(1)
  headerRow.height = 35
  
  for (let col = 1; col <= 6; col++) {
    const headerCell = headerRow.getCell(col)
    headerCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    headerCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2196F3' } // 青色（大会）
    }
    headerCell.alignment = { 
      vertical: 'middle', 
      horizontal: 'center',
      wrapText: col === 2 // 終了日列は改行対応
    }
    headerCell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  }

  // データ行の書式設定
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return // ヘッダー行はスキップ

    for (let col = 1; col <= 6; col++) {
      const cell = row.getCell(col)
      cell.alignment = { 
        vertical: 'middle', 
        horizontal: col <= 2 || col === 5 ? 'center' : 'left' 
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
      }
    }

    // 日付セルに書式を適用
    row.getCell(1).numFmt = 'M"月"D"日"'
    row.getCell(2).numFmt = 'M"月"D"日"'

    // プール種別のプルダウン
    const poolTypeCell = row.getCell(5)
    poolTypeCell.dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"25m,50m"']
    }
  })
}

/**
 * 大会一括登録用Excelテンプレートを生成
 */
export async function generateCompetitionExcelTemplate(year: number): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()

  // ==============================================
  // 1つ目のシート：サンプル（見本）
  // ==============================================
  const sampleSheet = workbook.addWorksheet('サンプル')
  
  // ヘッダー行
  const sampleHeaderRow = sampleSheet.addRow([
    '開始日',
    '終了日\n(複数日の場合)',
    '大会名',
    '場所',
    'プール種別',
    '備考'
  ])
  sampleHeaderRow.getCell(2).value = '終了日\n(複数日の場合)'

  // サンプルデータ（複数行）- 選択された年を使用
  const sampleData = [
    {
      startDate: new Date(year, 3, 15, 12, 0, 0), // 4月15日
      endDate: null,
      title: '春季水泳大会',
      place: '市民プール',
      poolType: '25m',
      note: '午前中開催'
    },
    {
      startDate: new Date(year, 6, 20, 12, 0, 0), // 7月20日
      endDate: new Date(year, 6, 21, 12, 0, 0), // 7月21日（2日間開催）
      title: '県選手権大会',
      place: '県立総合プール',
      poolType: '50m',
      note: '2日間開催'
    },
    {
      startDate: new Date(year, 7, 10, 12, 0, 0), // 8月10日
      endDate: new Date(year, 7, 12, 12, 0, 0), // 8月12日（3日間開催）
      title: '全国中学校水泳競技大会',
      place: 'オリンピックプール',
      poolType: '50m',
      note: '3日間開催'
    },
    {
      startDate: new Date(year, 10, 3, 12, 0, 0), // 11月3日
      endDate: null,
      title: '秋季記録会',
      place: '市民プール',
      poolType: '25m',
      note: ''
    }
  ]

  for (const data of sampleData) {
    const row = sampleSheet.addRow([
      data.startDate,
      data.endDate,
      data.title,
      data.place,
      data.poolType,
      data.note
    ])
    row.getCell(1).numFmt = 'M"月"D"日"'
    if (data.endDate) {
      row.getCell(2).numFmt = 'M"月"D"日"'
    }
  }

  // サンプルシートに書式を適用
  applyCompetitionSheetFormatting(sampleSheet)

  // サンプルシートに説明を追加
  const noteRow2 = sampleSheet.addRow(['※このシートは見本です。「大会登録」シートにデータを入力してください。'])
  noteRow2.getCell(1).font = { color: { argb: 'FFFF0000' }, italic: true }
  sampleSheet.mergeCells(`A${noteRow2.number}:F${noteRow2.number}`)

  // ==============================================
  // 2つ目のシート：大会登録（入力用）
  // ==============================================
  const inputSheet = workbook.addWorksheet('大会登録')
  
  // ヘッダー行
  const inputHeaderRow = inputSheet.addRow([
    '開始日',
    '終了日\n(複数日の場合)',
    '大会名',
    '場所',
    'プール種別',
    '備考'
  ])
  inputHeaderRow.getCell(2).value = '終了日\n(複数日の場合)'

  // 空行を追加（ユーザー入力用）
  for (let i = 0; i < 30; i++) {
    const row = inputSheet.addRow(['', '', '', '', '', ''])
    row.getCell(1).numFmt = 'M"月"D"日"'
    row.getCell(2).numFmt = 'M"月"D"日"'
  }

  // 入力シートに書式を適用
  applyCompetitionSheetFormatting(inputSheet)

  return workbook
}

/**
 * 大会Excelテンプレートをダウンロード
 */
export async function downloadCompetitionExcelTemplate(year: number): Promise<void> {
  const workbook = await generateCompetitionExcelTemplate(year)
  const buffer = await workbook.xlsx.writeBuffer()
  
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `大会一括登録_${year}年.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * 日付セルの値をYYYY-MM-DD形式に変換
 */
function parseDateCell(cellValue: unknown): string {
  if (cellValue instanceof Date) {
    return format(cellValue, 'yyyy-MM-dd')
  } else if (typeof cellValue === 'number') {
    // Excelの日付シリアル値の場合
    const excelDate = new Date((cellValue - 25569) * 86400 * 1000)
    return format(excelDate, 'yyyy-MM-dd')
  } else if (typeof cellValue === 'string') {
    const dateStr = cellValue.trim()
    if (!dateStr) return ''
    
    // YYYY-MM-DD形式のチェック
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (dateRegex.test(dateStr)) {
      return dateStr
    }
    
    // 「M月d日」形式をパース
    for (const year of [2025, 2026, 2027, new Date().getFullYear()]) {
      try {
        const parsedDate = parse(dateStr, 'M月d日', new Date(year, 0, 1))
        if (!isNaN(parsedDate.getTime())) {
          return format(parsedDate, 'yyyy-MM-dd')
        }
      } catch {
        // 次の年で試行
      }
    }
  }
  return ''
}

/**
 * 大会Excelファイルをパース
 */
export function parseCompetitionExcelFile(file: File): Promise<ParsedCompetitionData> {
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

        const result: ParsedCompetitionData = {
          competitions: [],
          errors: []
        }

        // 「大会登録」シートのみを処理（サンプルシートは無視）
        const worksheet = workbook.getWorksheet('大会登録')
        if (!worksheet) {
          // シートが見つからない場合は最初のシートを使用（互換性のため）
          const firstSheet = workbook.worksheets[0]
          if (!firstSheet) {
            reject(new Error('シートが見つかりません'))
            return
          }
          firstSheet.eachRow((row, rowNumber) => {
            processCompetitionRow(row, rowNumber, firstSheet.name, result)
          })
        } else {
          worksheet.eachRow((row, rowNumber) => {
            processCompetitionRow(row, rowNumber, worksheet.name, result)
          })
        }

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

/**
 * 大会の行をパースする共通処理
 */
function processCompetitionRow(
  row: ExcelJS.Row,
  rowNumber: number,
  sheetName: string,
  result: ParsedCompetitionData
) {
  if (rowNumber === 1) return // ヘッダー行をスキップ

  const startDateCell = row.getCell(1)
  const endDateCell = row.getCell(2)
  const titleCell = row.getCell(3)
  const placeCell = row.getCell(4)
  const poolTypeCell = row.getCell(5)
  const noteCell = row.getCell(6)

  // 値を取得
  const startDate = parseDateCell(startDateCell.value)
  const endDate = parseDateCell(endDateCell.value)
  const title = String(titleCell.value || '').trim()
  const place = String(placeCell.value || '').trim()
  const poolType = String(poolTypeCell.value || '').trim()
  const note = String(noteCell.value || '').trim()

  // 大会名が入力されていない行はスキップ
  if (!title) {
    return
  }

  // バリデーション
  const errors: string[] = []

  if (!startDate) {
    errors.push('開始日は必須です')
  } else {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(startDate)) {
      errors.push('開始日は正しい形式で入力してください')
    }
  }

  // 終了日のバリデーション（入力がある場合のみ）
  if (endDate) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(endDate)) {
      errors.push('終了日は正しい形式で入力してください')
    } else if (startDate && endDate < startDate) {
      errors.push('終了日は開始日以降の日付を指定してください')
    }
  }

  if (!place) {
    errors.push('場所は必須です')
  }

  if (!poolType) {
    errors.push('プール種別は必須です')
  } else if (poolType !== '25m' && poolType !== '50m') {
    errors.push('プール種別は「25m」または「50m」のみ選択可能です')
  }

  if (errors.length > 0) {
    errors.forEach(error => {
      result.errors.push({
        row: rowNumber,
        sheet: sheetName,
        message: error
      })
    })
    return
  }

  result.competitions.push({
    title: title,
    date: startDate,
    end_date: endDate || null,
    place: place,
    pool_type: poolType === '25m' ? 0 : 1,
    note: note || null
  })
}

