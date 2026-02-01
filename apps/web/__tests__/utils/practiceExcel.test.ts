import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { Worksheet, Row, Cell, Column, Workbook, CellValue, Fill } from 'exceljs'

// =============================================================================
// Mock用のヘルパー関数・クラス
// =============================================================================

function createMockCell(value: CellValue = ''): Partial<Cell> {
  return {
    value,
    font: {},
    fill: undefined as Fill | undefined,
    alignment: {},
    border: {},
    numFmt: '',
  }
}

interface MockRow {
  height: number
  getCell: (col: number) => Partial<Cell>
}

function createMockRow(cells: Partial<Cell>[], _rowNumber: number): MockRow {
  const cellMap = new Map<number, Partial<Cell>>()
  cells.forEach((cell, index) => {
    cellMap.set(index + 1, cell)
  })

  return {
    height: 0,
    getCell: (col: number) => {
      if (!cellMap.has(col)) {
        cellMap.set(col, createMockCell())
      }
      return cellMap.get(col)!
    },
  }
}

function createMockColumn(): Partial<Column> {
  return {
    width: 0,
  }
}

interface MockWorksheet {
  getColumn: (col: number) => Partial<Column>
  getRow: (rowNum: number) => MockRow
  eachRow: (callback: (row: Row, rowNumber: number) => void) => void
  addRow: () => void
  name: string
  _columns: Map<number, Partial<Column>>
  _rows: Map<number, MockRow>
}

function createMockWorksheet(rows: Array<{ cells: Partial<Cell>[], rowNumber: number }>): MockWorksheet {
  const columns = new Map<number, Partial<Column>>()
  const rowMap = new Map<number, MockRow>()

  rows.forEach(({ cells, rowNumber }) => {
    rowMap.set(rowNumber, createMockRow(cells, rowNumber))
  })

  const worksheet: MockWorksheet = {
    _columns: columns,
    _rows: rowMap,
    getColumn: vi.fn((col: number) => {
      if (!columns.has(col)) {
        columns.set(col, createMockColumn())
      }
      return columns.get(col)!
    }),
    getRow: vi.fn((rowNum: number) => {
      if (!rowMap.has(rowNum)) {
        rowMap.set(rowNum, createMockRow([], rowNum))
      }
      return rowMap.get(rowNum)!
    }),
    eachRow: vi.fn((callback: (row: Row, rowNumber: number) => void) => {
      rowMap.forEach((row, rowNumber) => {
        callback(row as unknown as Row, rowNumber)
      })
    }),
    addRow: vi.fn(),
    name: 'TestSheet',
  }

  return worksheet
}

// =============================================================================
// テスト
// =============================================================================

describe('applyPracticeSheetFormatting', () => {
  let applyPracticeSheetFormatting: (worksheet: Worksheet) => void

  beforeEach(async () => {
    const module = await import('../../utils/practiceExcel')
    applyPracticeSheetFormatting = module.applyPracticeSheetFormatting
  })

  it('列幅が正しく設定される', () => {
    const worksheet = createMockWorksheet([
      { cells: [createMockCell('日付'), createMockCell('曜日'), createMockCell('タイトル'), createMockCell('場所'), createMockCell('備考')], rowNumber: 1 },
    ])

    applyPracticeSheetFormatting(worksheet as unknown as Worksheet)

    expect(worksheet.getColumn).toHaveBeenCalledWith(1)
    expect(worksheet.getColumn).toHaveBeenCalledWith(2)
    expect(worksheet.getColumn).toHaveBeenCalledWith(3)
    expect(worksheet.getColumn).toHaveBeenCalledWith(4)
    expect(worksheet.getColumn).toHaveBeenCalledWith(5)

    const col1 = worksheet._columns.get(1)
    const col2 = worksheet._columns.get(2)
    const col3 = worksheet._columns.get(3)
    const col4 = worksheet._columns.get(4)
    const col5 = worksheet._columns.get(5)

    expect(col1?.width).toBe(12)
    expect(col2?.width).toBe(8)
    expect(col3?.width).toBe(25)
    expect(col4?.width).toBe(25)
    expect(col5?.width).toBe(35)
  })

  it('ヘッダー行に書式が適用される', () => {
    const headerCells = [
      createMockCell('日付'),
      createMockCell('曜日'),
      createMockCell('タイトル'),
      createMockCell('場所'),
      createMockCell('備考'),
    ]
    const worksheet = createMockWorksheet([
      { cells: headerCells, rowNumber: 1 },
    ])

    applyPracticeSheetFormatting(worksheet as unknown as Worksheet)

    const headerRow = worksheet.getRow(1)
    expect(headerRow.height).toBe(30)

    // ヘッダーセルのフォント設定を確認
    const headerCell = headerRow.getCell(1)
    expect(headerCell.font).toEqual({ bold: true, size: 11, color: { argb: 'FFFFFFFF' } })
    expect(headerCell.fill).toEqual({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4CAF50' },
    })
    expect(headerCell.alignment).toEqual({ vertical: 'middle', horizontal: 'center' })
    expect(headerCell.border).toEqual({
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    })
  })

  it('土曜日の行に薄いブルーの背景色が適用される', () => {
    // 2025年1月18日は土曜日
    const saturdayDate = new Date(2025, 0, 18)
    const worksheet = createMockWorksheet([
      { cells: [createMockCell('日付'), createMockCell('曜日'), createMockCell('タイトル'), createMockCell('場所'), createMockCell('備考')], rowNumber: 1 },
      { cells: [createMockCell(saturdayDate), createMockCell('土'), createMockCell(''), createMockCell(''), createMockCell('')], rowNumber: 2 },
    ])

    applyPracticeSheetFormatting(worksheet as unknown as Worksheet)

    const dataRow = worksheet.getRow(2)
    const cell = dataRow.getCell(1)
    expect(cell.fill).toEqual({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F3FF' },
    })
  })

  it('日曜日の行に薄いレッドの背景色が適用される', () => {
    // 2025年1月19日は日曜日
    const sundayDate = new Date(2025, 0, 19)
    const worksheet = createMockWorksheet([
      { cells: [createMockCell('日付'), createMockCell('曜日'), createMockCell('タイトル'), createMockCell('場所'), createMockCell('備考')], rowNumber: 1 },
      { cells: [createMockCell(sundayDate), createMockCell('日'), createMockCell(''), createMockCell(''), createMockCell('')], rowNumber: 2 },
    ])

    applyPracticeSheetFormatting(worksheet as unknown as Worksheet)

    const dataRow = worksheet.getRow(2)
    const cell = dataRow.getCell(1)
    expect(cell.fill).toEqual({
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFE6E6' },
    })
  })

  it('平日の行には特別な背景色が適用されない', () => {
    // 2025年1月20日は月曜日
    const mondayDate = new Date(2025, 0, 20)
    const worksheet = createMockWorksheet([
      { cells: [createMockCell('日付'), createMockCell('曜日'), createMockCell('タイトル'), createMockCell('場所'), createMockCell('備考')], rowNumber: 1 },
      { cells: [createMockCell(mondayDate), createMockCell('月'), createMockCell(''), createMockCell(''), createMockCell('')], rowNumber: 2 },
    ])

    applyPracticeSheetFormatting(worksheet as unknown as Worksheet)

    const dataRow = worksheet.getRow(2)
    const cell = dataRow.getCell(1)
    // 平日は背景色が設定されない（fillがundefinedまたはfgColorプロパティがない）
    const fill = cell.fill as { fgColor?: unknown } | undefined
    expect(fill?.fgColor).toBeUndefined()
  })

  it('日付セルにExcel数値形式が処理される', () => {
    // Excelのシリアル日付（2025年1月18日 = 45675）
    const excelSerialDate = 45675
    const worksheet = createMockWorksheet([
      { cells: [createMockCell('日付'), createMockCell('曜日'), createMockCell('タイトル'), createMockCell('場所'), createMockCell('備考')], rowNumber: 1 },
      { cells: [createMockCell(excelSerialDate), createMockCell('土'), createMockCell(''), createMockCell(''), createMockCell('')], rowNumber: 2 },
    ])

    applyPracticeSheetFormatting(worksheet as unknown as Worksheet)

    const dataRow = worksheet.getRow(2)
    const dateCell = dataRow.getCell(1)
    expect(dateCell.numFmt).toBe('M"月"D"日"')
  })

  it('文字列形式の日付も処理される', () => {
    const worksheet = createMockWorksheet([
      { cells: [createMockCell('日付'), createMockCell('曜日'), createMockCell('タイトル'), createMockCell('場所'), createMockCell('備考')], rowNumber: 1 },
      { cells: [createMockCell('1月18日'), createMockCell('土'), createMockCell(''), createMockCell(''), createMockCell('')], rowNumber: 2 },
    ])

    applyPracticeSheetFormatting(worksheet as unknown as Worksheet)

    // エラーなく処理が完了すること
    expect(worksheet.eachRow).toHaveBeenCalled()
  })

  it('曜日セルのフォントがグレーに設定される', () => {
    const worksheet = createMockWorksheet([
      { cells: [createMockCell('日付'), createMockCell('曜日'), createMockCell('タイトル'), createMockCell('場所'), createMockCell('備考')], rowNumber: 1 },
      { cells: [createMockCell(new Date(2025, 0, 15)), createMockCell('水'), createMockCell(''), createMockCell(''), createMockCell('')], rowNumber: 2 },
    ])

    applyPracticeSheetFormatting(worksheet as unknown as Worksheet)

    const dataRow = worksheet.getRow(2)
    const dayCell = dataRow.getCell(2)
    expect(dayCell.font).toEqual({ color: { argb: 'FF666666' } })
  })
})

describe('generatePracticeExcelTemplate', () => {
  let generatePracticeExcelTemplate: (year: number) => Promise<Workbook>

  beforeEach(async () => {
    const module = await import('../../utils/practiceExcel')
    generatePracticeExcelTemplate = module.generatePracticeExcelTemplate
  })

  it('ワークブックが生成される', async () => {
    const workbook = await generatePracticeExcelTemplate(2025)
    expect(workbook).toBeDefined()
  })

  it('サンプルシートが作成される', async () => {
    const workbook = await generatePracticeExcelTemplate(2025)
    const sampleSheet = workbook.getWorksheet('サンプル')
    expect(sampleSheet).toBeDefined()
  })

  it('12ヶ月分のシートが作成される', async () => {
    const workbook = await generatePracticeExcelTemplate(2025)
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

    monthNames.forEach((monthName) => {
      const sheet = workbook.getWorksheet(monthName)
      expect(sheet).toBeDefined()
    })
  })

  it('サンプルシートにヘッダー行が含まれる', async () => {
    const workbook = await generatePracticeExcelTemplate(2025)
    const sampleSheet = workbook.getWorksheet('サンプル')!
    const headerRow = sampleSheet.getRow(1)

    expect(headerRow.getCell(1).value).toBe('日付')
    expect(headerRow.getCell(2).value).toBe('曜日')
    expect(headerRow.getCell(3).value).toBe('タイトル')
    expect(headerRow.getCell(4).value).toBe('場所')
    expect(headerRow.getCell(5).value).toBe('備考')
  })

  it('サンプルシートにサンプルデータが含まれる', async () => {
    const workbook = await generatePracticeExcelTemplate(2025)
    const sampleSheet = workbook.getWorksheet('サンプル')!
    const row2 = sampleSheet.getRow(2)
    const row3 = sampleSheet.getRow(3)

    // サンプルデータのタイトル、場所、備考を確認
    expect(row2.getCell(3).value).toBe('通常練習')
    expect(row2.getCell(4).value).toBe('市民プール')
    expect(row3.getCell(3).value).toBe('強化練習')
    expect(row3.getCell(4).value).toBe('県立プール')
    expect(row3.getCell(5).value).toBe('コーチ指導あり')
  })

  it('月別シートに正しい日数分のデータ行がある', async () => {
    const workbook = await generatePracticeExcelTemplate(2025)

    // 1月は31日
    const jan = workbook.getWorksheet('1月')!
    expect(jan.rowCount).toBe(32) // ヘッダー + 31日

    // 2月は28日（2025年は平年）
    const feb = workbook.getWorksheet('2月')!
    expect(feb.rowCount).toBe(29) // ヘッダー + 28日

    // 4月は30日
    const apr = workbook.getWorksheet('4月')!
    expect(apr.rowCount).toBe(31) // ヘッダー + 30日
  })

  it('うるう年の2月は29日分のデータ行がある', async () => {
    const workbook = await generatePracticeExcelTemplate(2024) // 2024はうるう年
    const feb = workbook.getWorksheet('2月')!
    expect(feb.rowCount).toBe(30) // ヘッダー + 29日
  })

  it('月別シートの各行に曜日が設定されている', async () => {
    const workbook = await generatePracticeExcelTemplate(2025)
    const jan = workbook.getWorksheet('1月')!

    // 2025年1月1日は水曜日
    const row2 = jan.getRow(2)
    expect(row2.getCell(2).value).toBe('水')

    // 2025年1月4日は土曜日
    const row5 = jan.getRow(5)
    expect(row5.getCell(2).value).toBe('土')
  })

  it('合計13シート（サンプル + 12ヶ月）が作成される', async () => {
    const workbook = await generatePracticeExcelTemplate(2025)
    expect(workbook.worksheets.length).toBe(13)
  })
})

describe('parsePracticeExcelFile', () => {
  let parsePracticeExcelFile: (file: File) => Promise<{ practices: Array<{ date: string; title?: string | null; place?: string | null; note?: string | null }>; errors: Array<{ row: number; sheet: string; message: string }> }>

  beforeEach(async () => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('generatePracticeExcelTemplateで生成したワークブックをパースできる', async () => {
    // 実際のexceljsを使ってテンプレートを生成してパースする統合テスト
    const { generatePracticeExcelTemplate, parsePracticeExcelFile: parse } = await import('../../utils/practiceExcel')
    parsePracticeExcelFile = parse

    const workbook = await generatePracticeExcelTemplate(2025)
    const buffer = await workbook.xlsx.writeBuffer()

    // ArrayBufferからFileを作成
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const result = await parsePracticeExcelFile(file)

    // サンプルシートは除外されるので、12ヶ月分のデータがパースされる
    // 2025年の1年分 = 365日
    expect(result.practices.length).toBe(365)
    expect(result.errors.length).toBe(0)
  })

  it('日付が正しくパースされる', async () => {
    const { generatePracticeExcelTemplate, parsePracticeExcelFile: parse } = await import('../../utils/practiceExcel')
    parsePracticeExcelFile = parse

    const workbook = await generatePracticeExcelTemplate(2025)
    const buffer = await workbook.xlsx.writeBuffer()
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const result = await parsePracticeExcelFile(file)

    // 最初のエントリは1月1日
    expect(result.practices[0].date).toBe('2025-01-01')

    // 最後のエントリは12月31日
    expect(result.practices[result.practices.length - 1].date).toBe('2025-12-31')
  })

  it('空のセルが正しく処理される', async () => {
    const { generatePracticeExcelTemplate, parsePracticeExcelFile: parse } = await import('../../utils/practiceExcel')
    parsePracticeExcelFile = parse

    const workbook = await generatePracticeExcelTemplate(2025)
    const buffer = await workbook.xlsx.writeBuffer()
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const result = await parsePracticeExcelFile(file)

    // 月別シートのデータは場所と備考が空
    const monthlyEntry = result.practices.find(p => p.date === '2025-01-01')
    expect(monthlyEntry?.place).toBeNull()
    expect(monthlyEntry?.note).toBeNull()
  })

  it('サンプルシートがスキップされる', async () => {
    const { generatePracticeExcelTemplate, parsePracticeExcelFile: parse } = await import('../../utils/practiceExcel')
    parsePracticeExcelFile = parse

    const workbook = await generatePracticeExcelTemplate(2025)
    const buffer = await workbook.xlsx.writeBuffer()
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const result = await parsePracticeExcelFile(file)

    // サンプルシートのデータ（市民プール、県立プール）が含まれないことを確認
    const sampleData = result.practices.filter(p => p.place === '市民プール' || p.place === '県立プール')
    expect(sampleData.length).toBe(0)
  })

  it('場所と備考が含まれるデータが正しくパースされる', async () => {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('1月')

    sheet.addRow(['日付', '曜日', 'タイトル', '場所', '備考'])
    const dataRow = sheet.addRow([new Date(2025, 0, 15), '水', '', '市民プール', 'テスト練習'])
    dataRow.getCell(1).numFmt = 'M"月"D"日"'

    const buffer = await workbook.xlsx.writeBuffer()
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const { parsePracticeExcelFile: parse } = await import('../../utils/practiceExcel')
    const result = await parse(file)

    expect(result.practices.length).toBe(1)
    expect(result.practices[0]).toEqual({
      date: '2025-01-15',
      title: null,
      place: '市民プール',
      note: 'テスト練習',
    })
  })

  it('日付がない行はエラーになる', async () => {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('1月')

    sheet.addRow(['日付', '曜日', 'タイトル', '場所', '備考'])
    sheet.addRow(['', '水', '', '市民プール', 'テスト練習']) // 日付なし

    const buffer = await workbook.xlsx.writeBuffer()
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const { parsePracticeExcelFile: parse } = await import('../../utils/practiceExcel')
    const result = await parse(file)

    expect(result.practices.length).toBe(0)
    expect(result.errors.length).toBe(1)
    expect(result.errors[0]).toEqual({
      row: 2,
      sheet: '1月',
      message: '日付は必須です',
    })
  })

  it('複数行のエラーが正しく報告される', async () => {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('1月')

    sheet.addRow(['日付', '曜日', 'タイトル', '場所', '備考'])
    sheet.addRow(['', '水', '', '市民プール', 'テスト1']) // 日付なし
    sheet.addRow([new Date(2025, 0, 15), '水', '', '市民プール', 'テスト2']) // 正常
    sheet.addRow(['invalid', '木', '', '県立プール', 'テスト3']) // 無効な日付形式

    const buffer = await workbook.xlsx.writeBuffer()
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const { parsePracticeExcelFile: parse } = await import('../../utils/practiceExcel')
    const result = await parse(file)

    expect(result.practices.length).toBe(1)
    expect(result.errors.length).toBe(2)
    expect(result.errors[0].row).toBe(2)
    expect(result.errors[1].row).toBe(4)
  })

  it('ISO形式の日付文字列が正しくパースされる', async () => {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('1月')

    sheet.addRow(['日付', '曜日', 'タイトル', '場所', '備考'])
    sheet.addRow(['2025-01-20', '月', '', '市民プール', 'テスト'])

    const buffer = await workbook.xlsx.writeBuffer()
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const { parsePracticeExcelFile: parse } = await import('../../utils/practiceExcel')
    const result = await parse(file)

    expect(result.practices.length).toBe(1)
    expect(result.practices[0].date).toBe('2025-01-20')
  })

  it('日本語形式の日付文字列が正しくパースされる', async () => {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('1月')

    sheet.addRow(['日付', '曜日', 'タイトル', '場所', '備考'])
    sheet.addRow(['1月20日', '月', '', '市民プール', 'テスト'])

    const buffer = await workbook.xlsx.writeBuffer()
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const { parsePracticeExcelFile: parse } = await import('../../utils/practiceExcel')
    const result = await parse(file)

    expect(result.practices.length).toBe(1)
    // 年は現在年または近い年で推測される
    expect(result.practices[0].date).toMatch(/^\d{4}-01-20$/)
  })

  it('Excelシリアル日付形式が正しくパースされる', async () => {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('1月')

    sheet.addRow(['日付', '曜日', 'タイトル', '場所', '備考'])
    // Excelシリアル日付: 2025-01-15 ≈ 45672
    sheet.addRow([45672, '水', '', '市民プール', 'テスト'])

    const buffer = await workbook.xlsx.writeBuffer()
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const { parsePracticeExcelFile: parse } = await import('../../utils/practiceExcel')
    const result = await parse(file)

    expect(result.practices.length).toBe(1)
    expect(result.practices[0].date).toBe('2025-01-15') // シリアル日付の計算結果
  })

  it('複数シートのデータが統合される', async () => {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()

    const sheet1 = workbook.addWorksheet('1月')
    sheet1.addRow(['日付', '曜日', 'タイトル', '場所', '備考'])
    sheet1.addRow([new Date(2025, 0, 15), '水', '', 'プールA', 'メモ1'])

    const sheet2 = workbook.addWorksheet('2月')
    sheet2.addRow(['日付', '曜日', 'タイトル', '場所', '備考'])
    sheet2.addRow([new Date(2025, 1, 10), '月', '', 'プールB', 'メモ2'])

    const buffer = await workbook.xlsx.writeBuffer()
    const file = new File([buffer], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const { parsePracticeExcelFile: parse } = await import('../../utils/practiceExcel')
    const result = await parse(file)

    expect(result.practices.length).toBe(2)
    expect(result.practices.some(p => p.date === '2025-01-15')).toBe(true)
    expect(result.practices.some(p => p.date === '2025-02-10')).toBe(true)
  })
})
