import { format, getDay, parse } from 'date-fns'
import ExcelJS from 'exceljs'

// Excel行データの型定義
export interface ExcelRow {
  date: string // YYYY-MM-DD形式
  dayOfWeek: string // 曜日（自動計算）
  type: '練習' | '大会' | ''
  place: string
  note: string
  competitionName: string // 種別が「大会」の場合のみ
  poolType: '25m' | '50m' | '' // 種別が「大会」の場合のみ
}

// パース済みデータの型定義
export interface ParsedBulkData {
  practices: Array<{
    date: string
    place: string
    note: string | null
  }>
  competitions: Array<{
    title: string
    date: string
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
 * 曜日名を取得（日本語）
 */
function getDayOfWeekName(date: Date): string {
  const dayNames = ['日', '月', '火', '水', '木', '金', '土']
  return dayNames[getDay(date)]
}

/**
 * UTC日付をISO形式の文字列に変換（YYYY-MM-DD形式）
 * ExcelJSに日付として認識させるために使用
 */
function dateToISOString(utcDate: Date): string {
  const year = utcDate.getUTCFullYear()
  const month = String(utcDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(utcDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * シートの書式設定を適用
 */
function applySheetFormatting(worksheet: ExcelJS.Worksheet) {
  // 列幅の設定
  worksheet.getColumn(1).width = 12 // 日付
  worksheet.getColumn(2).width = 8  // 曜日
  worksheet.getColumn(3).width = 12 // 種別
  worksheet.getColumn(4).width = 20 // 場所
  worksheet.getColumn(5).width = 30 // 備考
  worksheet.getColumn(6).width = 25 // 大会名
  worksheet.getColumn(7).width = 25 // プール種別

  // ヘッダー行の書式設定（A-G列のみ）
  const headerRow = worksheet.getRow(1)
  headerRow.height = 40 // 改行対応のため高さを増やす
  
  // A-G列のヘッダー書式設定
  for (let col = 1; col <= 7; col++) {
    const headerCell = headerRow.getCell(col)
    headerCell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    headerCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' } // 青色
    }
    // F列とG列は改行対応のためwrapTextを有効化
    const isMultiLine = col === 6 || col === 7
    headerCell.alignment = { 
      vertical: 'middle', 
      horizontal: 'center',
      wrapText: isMultiLine
    }
    headerCell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  }
  
  // H列以降は書式を設定しない

  // データ行の書式設定
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return // ヘッダー行はスキップ

    // 日付セルから日付を取得して曜日を判定
    const dateCell = row.getCell(1)
    let dayOfWeek: number | null = null
    
    // 日付セルの値から日付を取得
    if (dateCell.value instanceof Date) {
      // Dateオブジェクトの場合（推奨）
      dayOfWeek = dateCell.value.getDay()
    } else if (typeof dateCell.value === 'number') {
      // Excelの日付シリアル値の場合
      // Excelシリアル値は1900年1月1日を1とする
      // UTCで計算してタイムゾーン問題を回避
      const excelEpoch = new Date(Date.UTC(1899, 11, 30)) // 1900年1月1日の前日
      const excelDate = new Date(excelEpoch.getTime() + (dateCell.value - 1) * 86400 * 1000)
      dayOfWeek = excelDate.getUTCDay()
    } else if (typeof dateCell.value === 'string') {
      // 文字列の場合（「1月15日」形式など）
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

    // 曜日に応じた背景色を決定（A-G列用）
    let rowBackgroundColor: string | null = null
    if (dayOfWeek === 6) {
      // 土曜日: 薄いブルー
      rowBackgroundColor = 'FFE6F3FF'
    } else if (dayOfWeek === 0) {
      // 日曜日: 薄いレッド
      rowBackgroundColor = 'FFFFE6E6'
    }

    // 日付列（A列）の書式設定（値は変更しない）
    // 日付セルの値が既に設定されている場合は、書式のみを適用
    if (dateCell.value === null || dateCell.value === undefined) {
      // 値が設定されていない場合のみ、デフォルト値を設定（通常は発生しない）
      dateCell.numFmt = 'M"月"D"日"'
    } else {
      // 値が既に設定されている場合は、書式のみを適用
      dateCell.numFmt = 'M"月"D"日"'
    }
    dateCell.alignment = { vertical: 'middle', horizontal: 'center' }
    if (rowBackgroundColor) {
      dateCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowBackgroundColor }
      }
    }
    dateCell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
    }

    // 曜日列（B列）の書式設定
    const dayCell = row.getCell(2)
    dayCell.alignment = { vertical: 'middle', horizontal: 'center' }
    dayCell.font = { color: { argb: 'FF666666' } } // グレー
    if (rowBackgroundColor) {
      dayCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowBackgroundColor }
      }
    }
    dayCell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
    }

    // 種別列（C列）の書式設定とプルダウン
    const typeCell = row.getCell(3)
    typeCell.dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"練習,大会"']
    }
    typeCell.alignment = { vertical: 'middle', horizontal: 'center' }
    // 背景色は曜日による色を優先、なければ薄いグレー
    typeCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: rowBackgroundColor || 'FFF2F2F2' }
    }
    typeCell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
    }

    // 場所列（D列）の書式設定
    const placeCell = row.getCell(4)
    placeCell.alignment = { vertical: 'middle', horizontal: 'left' }
    // 背景色は曜日による色を優先、なければ薄いオレンジ
    placeCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: rowBackgroundColor || 'FFFFF4E6' }
    }
    placeCell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
    }

    // 備考列（E列）の書式設定
    const noteCell = row.getCell(5)
    noteCell.alignment = { vertical: 'middle', horizontal: 'left' }
    if (rowBackgroundColor) {
      noteCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowBackgroundColor }
      }
    }
    noteCell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
    }

    // 大会名列（F列）の書式設定
    const competitionCell = row.getCell(6)
    competitionCell.alignment = { vertical: 'middle', horizontal: 'left' }
    if (rowBackgroundColor) {
      competitionCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowBackgroundColor }
      }
    }
    competitionCell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
    }

    // プール種別列（G列）の書式設定とプルダウン
    const poolTypeCell = row.getCell(7)
    poolTypeCell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"25m,50m"']
    }
    poolTypeCell.alignment = { vertical: 'middle', horizontal: 'center' }
    if (rowBackgroundColor) {
      poolTypeCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowBackgroundColor }
      }
    }
    poolTypeCell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
    }
  })
}

/**
 * 指定年のExcelテンプレートを生成
 */
export async function generateExcelTemplate(year: number): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()

  // サンプルシートを作成
  const sampleSheet = workbook.addWorksheet('サンプル')
  
  // ヘッダー行を追加
  const sampleHeaderRow = sampleSheet.addRow(['日付', '曜日', '種別', '場所', '備考', '大会名\n(種別が大会の時のみ入力)', 'プール種別\n(種別が大会の時のみ入力)'])
  // F列とG列のセルに改行コードを設定
  sampleHeaderRow.getCell(6).value = '大会名\n(種別が大会の時のみ入力)'
  sampleHeaderRow.getCell(7).value = 'プール種別\n(種別が大会の時のみ入力)'

  // サンプルデータを追加（日付は文字列として設定、UTCで統一）
  const sampleDate1UTC = new Date(Date.UTC(year, 0, 15, 0, 0, 0, 0)) // 1月15日、UTC
  const sampleDate2UTC = new Date(Date.UTC(year, 1, 20, 0, 0, 0, 0)) // 2月20日、UTC
  const sampleDate1 = new Date(year, 0, 15) // ローカル日付（表示用）
  const sampleDate2 = new Date(year, 1, 20) // ローカル日付（表示用）
  
  const sampleRow1 = sampleSheet.addRow([
    dateToISOString(sampleDate1UTC), // ISO形式の文字列として設定
    getDayOfWeekName(sampleDate1), // ローカル日付で曜日を取得
    '練習',
    '市民プール',
    '通常練習',
    '',
    ''
  ])
  // 日付セルに書式を適用（ExcelJSが自動的に日付として認識）
  const sampleDateCell1 = sampleRow1.getCell(1)
  sampleDateCell1.value = new Date(sampleDate1UTC.getTime()) // Dateオブジェクトとして設定
  sampleDateCell1.numFmt = 'M"月"D"日"'

  const sampleRow2 = sampleSheet.addRow([
    dateToISOString(sampleDate2UTC), // ISO形式の文字列として設定
    getDayOfWeekName(sampleDate2), // ローカル日付で曜日を取得
    '大会',
    '県立プール',
    '春季大会',
    '春季水泳大会',
    '50m'
  ])
  // 日付セルに書式を適用（ExcelJSが自動的に日付として認識）
  const sampleDateCell2 = sampleRow2.getCell(1)
  sampleDateCell2.value = new Date(sampleDate2UTC.getTime()) // Dateオブジェクトとして設定
  sampleDateCell2.numFmt = 'M"月"D"日"'

  // 書式設定を適用
  applySheetFormatting(sampleSheet)

  // 1月〜12月のシートを作成
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  
  for (let month = 0; month < 12; month++) {
    const worksheet = workbook.addWorksheet(monthNames[month])
    
    // ヘッダー行を追加
    const headerRow = worksheet.addRow(['日付', '曜日', '種別', '場所', '備考', '大会名\n(種別が大会の時のみ入力)', 'プール種別\n(種別が大会の時のみ入力)'])
    // F列とG列のセルに改行コードを設定
    headerRow.getCell(6).value = '大会名\n(種別が大会の時のみ入力)'
    headerRow.getCell(7).value = 'プール種別\n(種別が大会の時のみ入力)'

    // 各月の日付データを追加（UTCで統一してタイムゾーン問題を回避）
    // UTCでその月の最後の日を取得（次の月の0日 = その月の最後の日）
    const lastDayUTC = new Date(Date.UTC(year, month + 1, 0, 0, 0, 0, 0))
    const lastDayOfMonth = lastDayUTC.getUTCDate() // その月の最後の日の日付（28, 29, 30, 31のいずれか）
    
    // 1日からその月の最後の日までをUTCで生成
    for (let day = 1; day <= lastDayOfMonth; day++) {
      // UTCで日付を作成（時刻は00:00:00に設定）
      const dateUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
      
      // ローカル日付として曜日を取得（表示用）
      const localDate = new Date(year, month, day)
      const dayOfWeek = getDayOfWeekName(localDate)
      
      const row = worksheet.addRow([
        dateToISOString(dateUTC), // ISO形式の文字列として設定（一時的）
        dayOfWeek,
        '',
        '',
        '',
        '',
        ''
      ])
      // 日付セルにDateオブジェクトとして設定（ExcelJSが自動的に日付として認識）
      const dateCell = row.getCell(1)
      // UTC日付をローカル日付として扱う（ExcelJSはローカルタイムゾーンで解釈するため）
      // UTC日付の年月日を取得して、ローカル日付として作成
      const localDateForExcel = new Date(
        dateUTC.getUTCFullYear(),
        dateUTC.getUTCMonth(),
        dateUTC.getUTCDate(),
        12, 0, 0, 0 // 正午に設定してタイムゾーン問題を回避
      )
      dateCell.value = localDateForExcel
      dateCell.numFmt = 'M"月"D"日"'
    }

    // 書式設定を適用
    applySheetFormatting(worksheet)
  }

  return workbook
}

/**
 * Excelファイルをダウンロード
 */
export async function downloadExcelTemplate(year: number): Promise<void> {
  const workbook = await generateExcelTemplate(year)
  const buffer = await workbook.xlsx.writeBuffer()
  
  // Blobを作成してダウンロード
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `一括登録テンプレート_${year}年.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * Excelファイルを読み込んでパース
 */
export function parseExcelFile(file: File): Promise<ParsedBulkData> {
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

        const result: ParsedBulkData = {
          practices: [],
          competitions: [],
          errors: []
        }

        // 各シートを処理（サンプルシートは除外）
        workbook.worksheets.forEach((worksheet) => {
          if (worksheet.name === 'サンプル') return

          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return // ヘッダー行をスキップ

            // セルの値を取得
            const dateCell = row.getCell(1)
            const typeCell = row.getCell(3)
            const placeCell = row.getCell(4)
            const noteCell = row.getCell(5)
            const competitionNameCell = row.getCell(6)
            const poolTypeCell = row.getCell(7)

            // 値を取得（数値の場合は日付として処理）
            let dateValue: string = ''
            if (dateCell.value instanceof Date) {
              dateValue = format(dateCell.value, 'yyyy-MM-dd')
            } else if (typeof dateCell.value === 'number') {
              // Excelの日付シリアル値の場合
              const excelDate = new Date((dateCell.value - 25569) * 86400 * 1000)
              dateValue = format(excelDate, 'yyyy-MM-dd')
            } else if (typeof dateCell.value === 'string') {
              // 文字列の場合（「1月15日」形式など）
              const dateStr = dateCell.value.trim()
              try {
                // 「M月d日」形式をパース（2025年を基準に試行）
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
                // パースに失敗した場合は、YYYY-MM-DD形式の可能性
                if (!dateValue) {
                  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
                  if (dateRegex.test(dateStr)) {
                    dateValue = dateStr
                  } else {
                    dateValue = dateStr
                  }
                }
              } catch {
                dateValue = dateStr
              }
            } else {
              dateValue = String(dateCell.value || '')
            }

            const type = String(typeCell.value || '').trim()
            const place = String(placeCell.value || '').trim()
            const note = String(noteCell.value || '').trim()
            const competitionName = String(competitionNameCell.value || '').trim()
            const poolType = String(poolTypeCell.value || '').trim()

            // 種別が入力されていない行は処理対象外（スキップ）
            if (!type) {
              return
            }

            // 種別が入力されている行のみ処理対象
            // バリデーション
            const errors: string[] = []

            // 種別の値チェック
            if (type !== '練習' && type !== '大会') {
              errors.push('種別は「練習」または「大会」のみ選択可能です')
            }

            // 日付の必須チェック
            if (!dateValue) {
              errors.push('日付は必須です')
            } else {
              // 日付形式のチェック
              const dateRegex = /^\d{4}-\d{2}-\d{2}$/
              if (!dateRegex.test(dateValue)) {
                errors.push('日付は正しい形式で入力してください')
              } else {
                // 有効な日付かチェック
                const date = new Date(dateValue)
                if (isNaN(date.getTime())) {
                  errors.push('有効な日付を入力してください')
                }
              }
            }

            // 場所の必須チェック
            if (!place) {
              errors.push('場所は必須です')
            }

            // 種別が「大会」の場合の必須チェック
            if (type === '大会') {
              if (!competitionName) {
                errors.push('種別が「大会」の場合、大会名は必須です')
              }
              if (!poolType) {
                errors.push('種別が「大会」の場合、プール種別は必須です')
              } else if (poolType !== '25m' && poolType !== '50m') {
                errors.push('プール種別は「25m」または「50m」のみ選択可能です')
              }
            }

            // エラーがある場合は記録してスキップ
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

            // データを追加
            if (type === '練習') {
              result.practices.push({
                date: dateValue,
                place: place,
                note: note || null
              })
            } else if (type === '大会') {
              result.competitions.push({
                title: competitionName,
                date: dateValue,
                place: place,
                pool_type: poolType === '25m' ? 0 : 1,
                note: note || null
              })
            }
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
