# モバイルUI問題点調査レポート

スマートフォン（WEB）から見たときのUI問題を調査しました。

---

## 🔴 高優先度（UXが著しく低下）

### 1. AnnouncementForm - ボタンが改行される問題
**ファイル**: `apps/web/components/team/AnnouncementForm.tsx:262-287`

**問題**: ボタン3つ（下書き保存、キャンセル、公開して作成）が `flex items-center gap-3` で横並びのまま。モバイルでボタンテキストが改行されるか、画面をはみ出す。

```tsx
// 現在
<div className="flex items-center gap-3 pt-4">

// 改善案
<div className="flex flex-col sm:flex-row items-center gap-3 pt-4">
```

---

### 2. TimeInputModal - モーダル外側のpadding不足
**ファイル**: `apps/web/components/forms/TimeInputModal.tsx:234`

**問題**: `px-0` でモバイル時パディングなし。モーダルが画面端に接する。

```tsx
// 現在
<div className="... px-0 ...">

// 改善案
<div className="... px-4 sm:px-0 ...">
```

---

### 3. RecordSetItem - リアクションタイム入力欄の固定幅
**ファイル**: `apps/web/components/forms/record/components/RecordSetItem.tsx:144`

**問題**: `w-36`（144px）の固定幅がモバイルでレイアウトを破壊する。

```tsx
// 現在
<div className="w-36">

// 改善案
<div className="w-full sm:w-36">
```

---

### 4. DatePicker - ポップアップが画面外にはみ出す
**ファイル**: `apps/web/components/ui/DatePicker.tsx:266-278`

**問題**: `absolute` 位置指定だが left/right の制約がなく、モーダル端でカレンダーが画面外に出る。

```tsx
// 現在
<div className={cn(
  'absolute z-50 p-4 bg-white ...',
  popupPosition === 'top' ? '...' : 'mt-1 ...'
)}>

// 改善案: left-0 を追加し、maxWidthも考慮
<div className={cn(
  'absolute z-50 p-4 bg-white left-0 max-w-[calc(100vw-2rem)] ...',
  ...
)}>
```

---

### 5. TeamCompetitionEntryModal - select要素の固定幅
**ファイル**: `apps/web/components/team/TeamCompetitionEntryModal.tsx:251`

**問題**: `w-64`（256px）がモバイルで画面を超える。

```tsx
// 現在
<select className="block w-64 px-3 py-2 ...">

// 改善案
<select className="block w-full sm:w-64 px-3 py-2 ...">
```

---

## 🟡 中優先度（改善すべき問題）

### 6. RecordForm - モーダルpadding不足
**ファイル**: `apps/web/components/forms/record/RecordForm.tsx:114-125`

**問題**: `p-3 sm:p-6` でモバイル時12pxのみ。コンテンツがエッジに接近しすぎ。

```tsx
// 改善案
<div className="p-4 sm:p-6">
```

---

### 7. TeamCompetitionForm - モーダルpadding
**ファイル**: `apps/web/components/team/TeamCompetitionForm.tsx:110-138`

**問題**: 外側div `px-0` でパディングなし。

---

### 8. TimeInputModal - フッターボタン配置
**ファイル**: `apps/web/components/forms/TimeInputModal.tsx:322-337`

**問題**: モバイルでボタンが無理やり横並びになる。

```tsx
// 改善案
<div className="flex flex-col sm:flex-row-reverse gap-2 sm:gap-3">
```

---

### 9. BestTimesTable - セル幅の固定指定
**ファイル**: `apps/web/components/profile/BestTimesTable.tsx:267, 273, 283, 291`

**問題**: モバイルでも `min-w-[48px]`, `w-[56px]` 等の固定幅でテーブルが横スクロール必須に。

---

### 10. TimeInputModal - グリッドの細分化
**ファイル**: `apps/web/components/forms/TimeInputModal.tsx:282`

**問題**: `grid-cols-2` でモバイル時、セットのヘッダーや「本目」ラベルが折り返される。

---

## 🟢 低優先度（微調整）

### 11. Header - ユーザー名の表示
**ファイル**: `apps/web/components/layout/Header.tsx:94-119`

**問題**: `truncate max-w-32` でカット。モバイルではさらに見えにくい可能性。

```tsx
// 改善案
<span className="truncate max-w-24 sm:max-w-32">
```

---

### 12. RecordBasicInfo - グリッドのgap
**ファイル**: `apps/web/components/forms/record/components/RecordBasicInfo.tsx:25-34`

**問題**: `gap-2`（8px）でモバイル時狭い。`gap-3` への変更を検討。

---

### 13. datetime-local入力の高さ
**ファイル**: `apps/web/components/team/AnnouncementForm.tsx:224, 242`

**問題**: ブラウザネイティブのUIが狭い場合がある。

```tsx
// 改善案
<input type="datetime-local" className="... py-3 sm:py-2 ...">
```

---

## 📋 対応チェックリスト

| # | ファイル | 問題 | 優先度 | 対応 |
|---|----------|------|--------|------|
| 1 | AnnouncementForm.tsx:262 | ボタン横並び | 🔴高 | [x] |
| 2 | TimeInputModal.tsx:234 | px-0 | 🔴高 | [x] |
| 3 | RecordSetItem.tsx:144 | w-36固定 | 🔴高 | [x] |
| 4 | DatePicker.tsx:266 | absolute位置 | 🔴高 | [x] |
| 5 | TeamCompetitionEntryModal.tsx:251 | w-64固定 | 🔴高 | [x] |
| 6 | RecordForm.tsx:114 | p-3 padding | 🟡中 | [x] |
| 7 | TeamCompetitionForm.tsx:110 | px-0 | 🟡中 | [x] |
| 8 | TimeInputModal.tsx:322 | フッターボタン | 🟡中 | [x] |
| 9 | BestTimesTable.tsx:267 | 固定幅 | 🟡中 | [x] |
| 10 | TimeInputModal.tsx:282 | grid-cols-2 | 🟡中 | [x] |
| 11 | Header.tsx:94 | max-w-32 | 🟢低 | [x] |
| 12 | RecordBasicInfo.tsx:25 | gap-2 | 🟢低 | [x] |
| 13 | AnnouncementForm.tsx:224 | datetime-local | 🟢低 | [x] |

---

## 共通パターンの問題

### モーダル全般で `px-0` が使われている
以下のファイルで同様の問題：
- `TeamCompetitionForm.tsx:110`
- `TeamCompetitionEntryModal.tsx:197`
- `RecordForm.tsx:115`
- `TimeInputModal.tsx:234`

**一括修正案**: `px-0 sm:px-0` → `px-4 sm:px-0`

### 固定幅 (`w-XX`) がレスポンシブ未対応
- `w-36`, `w-64` などは `w-full sm:w-XX` に変更すべき
