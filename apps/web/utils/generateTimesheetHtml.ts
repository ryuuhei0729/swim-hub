/**
 * チーム記録表（タイムシート）のHTML生成ユーティリティ
 * 印刷用のHTMLを生成し、新しいウィンドウで開く
 */

/**
 * 印刷用タイムシートHTMLを生成し、新しいウィンドウで表示
 */
export function openTimesheetPrintWindow(): void {
  const html = generateTimesheetHtml()
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(html)
  printWindow.document.close()
}

/** データ行数 */
const DATA_ROWS = 16
/** 番号列数 */
const NUM_COLUMNS = 20
/** ヘッダー行を再表示する間隔 */
const HEADER_REPEAT_INTERVAL = 8

/** 7セグメント3桁 "888" のSVG Data URI を生成 */
function sevenSegDataUri(): string {
  const digit = (ox: number) =>
    `<rect x='${ox + 2}' y='0' width='6' height='1.5' rx='.4'/>` +
    `<rect x='${ox}' y='2' width='1.5' height='5.5' rx='.4'/>` +
    `<rect x='${ox + 8.5}' y='2' width='1.5' height='5.5' rx='.4'/>` +
    `<rect x='${ox + 2}' y='8.25' width='6' height='1.5' rx='.4'/>` +
    `<rect x='${ox}' y='10' width='1.5' height='5.5' rx='.4'/>` +
    `<rect x='${ox + 8.5}' y='10' width='1.5' height='5.5' rx='.4'/>` +
    `<rect x='${ox + 2}' y='16.5' width='6' height='1.5' rx='.4'/>`
  const svg = [0, 14, 28].map(digit).join('')
  return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 38 18' fill='%23ddd'>${svg}</svg>`
}

function generateTimesheetHtml(): string {
  const table = buildTableHtml()
  const segUri = sevenSegDataUri()

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>チーム記録表</title>
<style>
  @page {
    size: A4 landscape;
    margin: 8mm;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
    font-size: 11px;
    color: #222;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    padding: 4mm;
  }

  /* ヘッダー */
  .header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 6px;
    border-bottom: 2px solid #333;
    padding-bottom: 4px;
  }
  .header-title {
    font-size: 16px;
    font-weight: bold;
    white-space: nowrap;
  }
  .header-fields {
    display: flex;
    flex: 1;
    gap: 6px;
    font-size: 11px;
    white-space: nowrap;
  }
  .header-field {
    display: inline-flex;
    align-items: baseline;
    gap: 2px;
  }
  .header-field .label {
    font-weight: 600;
  }
  .header-field .value {
    display: inline-block;
    border-bottom: 1px solid #999;
    padding: 0 4px;
  }
  .header-field .value.wide { min-width: 120px; }
  .header-field .value.narrow { min-width: 50px; }
  .header-field .value.short { min-width: 25px; }
  .header-field .value.date-field { min-width: 100px; }

  /* テーブル */
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th, td {
    border: 1px solid #555;
    text-align: center;
    padding: 1px 2px;
    font-size: 10px;
    overflow: hidden;
  }
  th {
    background: #e8e8e8;
    font-weight: 600;
    font-size: 10px;
    height: 18px;
  }
  .col-name {
    width: 80px;
    background: #f5f5f5;
    font-weight: 600;
  }
  .col-style {
    width: 34px;
    background: #f5f5f5;
    font-weight: 600;
  }
  td.cell {
    background: #fff url("${segUri}") center center no-repeat;
    background-size: calc(100% - 10px) calc(100% - 10px);
    height: 32px;
    padding: 4;
  }
  td.cell-spacer {
    background: #fafafa;
    height: 6px;
    border-left: none;
    border-right: none;
  }

  @media print {
    .no-print { display: none !important; }
  }
  .print-btn-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: #2563eb;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 10px;
    z-index: 100;
    box-shadow: 0 2px 8px rgba(0,0,0,.15);
  }
  .print-btn-bar button {
    background: #fff;
    color: #2563eb;
    border: none;
    border-radius: 6px;
    padding: 8px 24px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .print-btn-bar button:hover { background: #e0e7ff; }
  body { padding-top: 52px; }
  @media print { body { padding-top: 0; } }
</style>
</head>
<body>
<div class="print-btn-bar no-print">
  <span style="font-size:14px;font-weight:600;">チーム記録表プレビュー</span>
  <button onclick="window.print()">印刷する</button>
</div>
<div class="page">
  <div class="header">
    <div class="header-title">チーム記録表</div>
    <div class="header-fields">
      <div class="header-field"><span class="value narrow">&nbsp;</span><span class="label">m</span></div>
      <div class="header-field"><span class="value narrow">&nbsp;</span><span class="label">本</span></div>
      <div class="header-field"><span class="value narrow">&nbsp;</span><span class="label">セット</span></div>
      <div class="header-field"><span class="value short">&nbsp;</span><span class="label">'</span><span class="value short">&nbsp;</span><span class="label">"</span><span class="label" style="margin-left:2px;">サークル</span></div>
      <div class="header-field" style="margin-left:auto;"><span class="label">日付</span><span class="value date-field">&nbsp;</span></div>
    </div>
  </div>
  ${table}
</div>
</body>
</html>`
}

/**
 * テーブルHTMLを生成
 */
function buildTableHtml(): string {
  // ヘッダー行
  const thCells = Array.from({ length: NUM_COLUMNS }, (_, i) =>
    `<th>${i + 1}</th>`
  ).join('')

  const headerRow = `<tr><th class="col-name">名前</th><th class="col-style">種目</th>${thCells}</tr>`

  // データ行（記入行とスペーサー行を交互に、一定間隔でヘッダー行を再表示）
  const rows: string[] = []
  for (let i = 0; i < DATA_ROWS; i++) {
    // ヘッダー行を再表示（直前にスペーサーを挿入）
    if (i > 0 && i % HEADER_REPEAT_INTERVAL === 0) {
      const spacerCells = Array.from({ length: NUM_COLUMNS }, () => `<td class="cell-spacer"></td>`).join('')
      rows.push(`<tr><td class="cell-spacer"></td><td class="cell-spacer"></td>${spacerCells}</tr>`)
      rows.push(headerRow)
    }

    const mainCells = Array.from({ length: NUM_COLUMNS }, () => `<td class="cell"></td>`).join('')
    rows.push(`<tr><td class="col-name"></td><td class="col-style"></td>${mainCells}</tr>`)

    // 最後の行以外はスペーサー行を追加
    if (i < DATA_ROWS - 1 && (i + 1) % HEADER_REPEAT_INTERVAL !== 0) {
      const spacerCells = Array.from({ length: NUM_COLUMNS }, () => `<td class="cell-spacer"></td>`).join('')
      rows.push(`<tr><td class="cell-spacer"></td><td class="cell-spacer"></td>${spacerCells}</tr>`)
    }
  }

  return `
<table>
  <thead>
    ${headerRow}
  </thead>
  <tbody>
    ${rows.join('\n')}
  </tbody>
</table>`
}
