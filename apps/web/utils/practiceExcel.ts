import { format, getDay, parse } from 'date-fns'
import type { Worksheet, Row, Workbook } from 'exceljs'

// =============================================================================
// 練習一括登録用Excel処理
// =============================================================================

// パース済みデータの型定義
export interface ParsedPracticeData {
  practices: Array<{
    date: string
    title?: string | null
    place?: string | null
    note?: string | null
  }>
  errors: Array<{
    row: number
    sheet: string
    message: string
  }>
}

/**
 * 曜日名を取得（日本語）
 */
function getDayOfWeekName(date: Date): string {
  const dayNames = ['日', '月', '火', '水', '木', '金', '土']
  return dayNames[getDay(date)]
}

/**
 * シートの書式設定を適用（練習用）
 */
export function applyPracticeSheetFormatting(worksheet: Worksheet) {
  // 列幅の設定
  worksheet.getColumn(1).width = 12 // 日付
  worksheet.getColumn(2).width = 8  // 曜日
  worksheet.getColumn(3).width = 25 // タイトル
  worksheet.getColumn(4).width = 25 // 場所
  worksheet.getColumn(5).width = 35 // 備考

  // ヘッダー行の書式設定
  const headerRow = worksheet.getRow(1)
  headerRow.height = 30

  for (let col = 1; col <= 5; col++) {
    const headerCell = headerRow.getCell(col)
    headerCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    headerCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4CAF50' } // 緑色（練習）
    }
    headerCell.alignment = { vertical: 'middle', horizontal: 'center' }
    headerCell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  }

  // データ行の書式設定
  worksheet.eachRow((row: Row, rowNumber: number) => {
    if (rowNumber === 1) return // ヘッダー行はスキップ

    // 日付セルから曜日を判定
    const dateCell = row.getCell(1)
    let dayOfWeek: number | null = null
    
    if (dateCell.value instanceof Date) {
      dayOfWeek = dateCell.value.getDay()
    } else if (typeof dateCell.value === 'number') {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30))
      const excelDate = new Date(excelEpoch.getTime() + (dateCell.value - 1) * 86400 * 1000)
      dayOfWeek = excelDate.getUTCDay()
    } else if (typeof dateCell.value === 'string') {
      try {
        const dateStr = dateCell.value.trim()
        for (const year of [2025, 2026, 2027, new Date().getFullYear()]) {
          try {
            const parsedDate = parse(dateStr, 'M月d日', new Date(year, 0, 1))
            if (!isNaN(parsedDate.getTime())) {
              dayOfWeek = parsedDate.getDay()
              break
            }
          } catch {
            // 次の年で試行
          }
        }
      } catch {
        // パース失敗
      }
    }

    // 曜日に応じた背景色
    let rowBackgroundColor: string | null = null
    if (dayOfWeek === 6) {
      rowBackgroundColor = 'FFE6F3FF' // 土曜日: 薄いブルー
    } else if (dayOfWeek === 0) {
      rowBackgroundColor = 'FFFFE6E6' // 日曜日: 薄いレッド
    }

    // 各列の書式設定
    for (let col = 1; col <= 5; col++) {
      const cell = row.getCell(col)
      cell.alignment = { vertical: 'middle', horizontal: col <= 2 ? 'center' : 'left' }
      if (rowBackgroundColor) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBackgroundColor }
        }
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
      }
    }

    // 日付セルに書式を適用
    dateCell.numFmt = 'M"月"D"日"'
    
    // 曜日セルの色をグレーに
    const dayCell = row.getCell(2)
    dayCell.font = { color: { argb: 'FF666666' } }
  })
}

/**
 * 練習一括登録用Excelテンプレートを生成
 */
export async function generatePracticeExcelTemplate(year: number): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()

  // サンプルシートを作成
  const sampleSheet = workbook.addWorksheet('サンプル')
  sampleSheet.addRow(['日付', '曜日', 'タイトル', '場所', '備考'])

  // サンプルデータ
  const sampleDate1 = new Date(year, 0, 15)
  const sampleDate2 = new Date(year, 0, 22)

  const row1 = sampleSheet.addRow([
    new Date(year, 0, 15, 12, 0, 0),
    getDayOfWeekName(sampleDate1),
    '通常練習',
    '市民プール',
    ''
  ])
  row1.getCell(1).numFmt = 'M"月"D"日"'

  const row2 = sampleSheet.addRow([
    new Date(year, 0, 22, 12, 0, 0),
    getDayOfWeekName(sampleDate2),
    '強化練習',
    '県立プール',
    'コーチ指導あり'
  ])
  row2.getCell(1).numFmt = 'M"月"D"日"'

  applyPracticeSheetFormatting(sampleSheet)

  // 月別シートを作成
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  
  for (let month = 0; month < 12; month++) {
    const worksheet = workbook.addWorksheet(monthNames[month])
    worksheet.addRow(['日付', '曜日', 'タイトル', '場所', '備考'])

    // 各月の日付データを追加
    const lastDayUTC = new Date(Date.UTC(year, month + 1, 0, 0, 0, 0, 0))
    const lastDayOfMonth = lastDayUTC.getUTCDate()

    for (let day = 1; day <= lastDayOfMonth; day++) {
      const localDate = new Date(year, month, day)
      const dayOfWeek = getDayOfWeekName(localDate)

      const row = worksheet.addRow([
        new Date(year, month, day, 12, 0, 0),
        dayOfWeek,
        '',
        '',
        ''
      ])
      row.getCell(1).numFmt = 'M"月"D"日"'
    }

    applyPracticeSheetFormatting(worksheet)
  }

  return workbook
}

/**
 * 練習Excelテンプレートをダウンロード
 */
export async function downloadPracticeExcelTemplate(year: number): Promise<void> {
  const workbook = await generatePracticeExcelTemplate(year)
  const buffer = await workbook.xlsx.writeBuffer()
  
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `練習一括登録_${year}年.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * 練習Excelファイルをパース
 */
export function parsePracticeExcelFile(file: File): Promise<ParsedPracticeData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async (e) => {
      try {
        const data = e.target?.result
        if (!data) {
          reject(new Error('ファイルの読み込みに失敗しました'))
          return
        }

        const ExcelJS = (await import('exceljs')).default
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(data as ArrayBuffer)

        const result: ParsedPracticeData = {
          practices: [],
          errors: []
        }

        // 各シートを処理（サンプルシートは除外）
        workbook.worksheets.forEach((worksheet) => {
          if (worksheet.name === 'サンプル') return

          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return // ヘッダー行をスキップ

            const dateCell = row.getCell(1)
            const titleCell = row.getCell(3)
            const placeCell = row.getCell(4)
            const noteCell = row.getCell(5)

            // 日付の取得
            let dateValue: string = ''
            if (dateCell.value instanceof Date) {
              dateValue = format(dateCell.value, 'yyyy-MM-dd')
            } else if (typeof dateCell.value === 'number') {
              const excelDate = new Date((dateCell.value - 25569) * 86400 * 1000)
              dateValue = format(excelDate, 'yyyy-MM-dd')
            } else if (typeof dateCell.value === 'string') {
              const dateStr = dateCell.value.trim()
              for (const year of [2025, 2026, 2027, new Date().getFullYear()]) {
                try {
                  const parsedDate = parse(dateStr, 'M月d日', new Date(year, 0, 1))
                  if (!isNaN(parsedDate.getTime())) {
                    dateValue = format(parsedDate, 'yyyy-MM-dd')
                    break
                  }
                } catch {
                  // 次の年で試行
                }
              }
              if (!dateValue) {
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/
                if (dateRegex.test(dateStr)) {
                  dateValue = dateStr
                }
              }
            }

            const title = String(titleCell.value || '').trim()
            const place = String(placeCell.value || '').trim()
            const note = String(noteCell.value || '').trim()

            // タイトル・場所・備考のいずれも入力されていない行はスキップ
            if (!title && !place && !note) {
              return
            }

            // バリデーション（dateは必須）
            const errors: string[] = []

            if (!dateValue) {
              errors.push('日付は必須です')
            } else {
              const dateRegex = /^\d{4}-\d{2}-\d{2}$/
              if (!dateRegex.test(dateValue)) {
                errors.push('日付は正しい形式で入力してください')
              }
            }

            if (errors.length > 0) {
              errors.forEach(error => {
                result.errors.push({
                  row: rowNumber,
                  sheet: worksheet.name,
                  message: error
                })
              })
              return
            }

            result.practices.push({
              date: dateValue,
              title: title || null,
              place: place || null,
              note: note || null
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

