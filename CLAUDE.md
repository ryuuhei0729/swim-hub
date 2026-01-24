# CLAUDE.md - プロジェクト固有のルール

## コーディングルール

### 1. `'use client'` を忘れない
- `useState`, `useCallback`, `useEffect` 等のReact hooksを使うファイルには必ず先頭に追加
- カスタムフック (`hooks/*.ts`) も同様

### 2. 日付フォーマットは date-fns で統一
```ts
// ❌ NG
new Date(str).toLocaleDateString('ja-JP')

// ✅ OK
import { format, parseISO, isValid } from 'date-fns'
import { ja } from 'date-fns/locale'
format(parseISO(str), 'yyyy年MM月dd日', { locale: ja })
```

### 3. 日付の format() 前に isValid() チェック
```ts
// ❌ NG
format(new Date(dateStr), 'yyyy年MM月dd日', { locale: ja })

// ✅ OK
isValid(new Date(dateStr))
  ? format(new Date(dateStr), 'yyyy年MM月dd日', { locale: ja })
  : '-'
```

### 4. クリック可能な要素のアクセシビリティ
`<tr>` や `<div>` にonClickを付ける場合、以下も必須：
- `tabIndex={0}`
- `role="button"`
- `aria-label="説明"`
- `onKeyDown` (Enter/Spaceで同じ動作)

### 5. require() は使わない
```ts
// ❌ NG
const { formatTime } = require('@/utils/formatters')

// ✅ OK
import { formatTime } from '@/utils/formatters'
```

## 作業スタイル

### 確認なしで進める
- ユーザーに「Yes/No」や「進めてもいいですか？」などの確認を求めない
- 指示されたタスクは確認なしで実行する
- 不明点がある場合のみ質問する（実装方針の確認は不要）

## データモデル注意点

### TeamMember の id フィールド
- `TeamMember.id` = `user_id`（ユーザーID）
- `membership_id` ではないので注意
- team_memberships テーブルの user_id から取得される
