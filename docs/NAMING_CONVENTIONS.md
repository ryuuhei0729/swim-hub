# 命名規則

このドキュメントでは、Swim Hubプロジェクトの命名規則について説明します。

## 基本ルール

### 1. データベース層（snake_case）

データベースカラム名、テーブル名、データベース型定義のプロパティは**snake_case**を使用します。

**例:**
- データベースカラム名: `user_id`, `competition_id`, `practice_id`, `place`, `entry_time`, `split_time`, `pool_type`, `name_jp`
- データベーステーブル名: `practices`, `competitions`, `records`, `entries`
- データベース型定義（`apps/shared/types/database.ts`）のプロパティ
- Supabase型定義（`apps/web/lib/supabase.ts`）のプロパティ

### 2. UI層・アプリケーション層（camelCase）

TypeScript変数名、関数パラメータ名、UI型定義のプロパティは**camelCase**を使用します。

**例:**
- TypeScript変数名: `userId`, `competitionId`, `practiceId`, `styleId`
- 関数パラメータ名: `userId: string`, `competitionId: string`
- UI型定義（`apps/shared/types/ui.ts`）のプロパティ
- フォーム型定義（`apps/web/stores/types.ts`）のプロパティ
- コンポーネントPropsのプロパティ名

### 3. 場所を示すフィールド: `place`に統一

**重要**: 場所を示すフィールドは`location`ではなく、**`place`**を使用します。

- データベース層: `place` (snake_case)
- UI層: `place` (camelCase)
- 例: `CalendarItem.place`, `Practice.place`, `Competition.place`

`location`は使用しないでください。

## データベース型とUI型の変換

データベースから取得したデータをUI層で使用する際は、必要に応じて`camelCase`に変換します：

```typescript
// ✅ データベースから取得（snake_case）
const { data: entry } = await supabase.from('entries').select('*').single()

// ✅ UI型に変換（camelCase）
const entryWithStyle: EntryWithStyle = {
  id: entry.id,
  competitionId: entry.competition_id,  // snake_case → camelCase
  userId: entry.user_id,                // snake_case → camelCase
  styleId: entry.style_id,              // snake_case → camelCase
  entryTime: entry.entry_time,          // snake_case → camelCase
  teamId: entry.team_id,                 // snake_case → camelCase
  place: entry.place                     // snake_case → camelCase（場所はplace）
}
```

## よくある間違い

### ❌ 間違い: 変数名でsnake_caseを使用

```typescript
const user_id = user.id
const competition_id = data.competition_id
```

### ✅ 正しい: camelCaseを使用

```typescript
const userId = user.id
const competitionId = data.competitionId
```

### ❌ 間違い: UI型でsnake_caseを使用

```typescript
export interface EditingData {
  competition_id?: string | null
  practice_id?: string
}
```

### ✅ 正しい: camelCaseを使用

```typescript
export interface EditingData {
  competitionId?: string | null
  practiceId?: string
}
```

### ❌ 間違い: locationを使用

```typescript
export interface CalendarItem {
  location?: string
}
```

### ✅ 正しい: placeを使用

```typescript
export interface CalendarItem {
  place?: string
}
```

## 命名規則のチェックリスト

コードを書く際は、以下のチェックリストを確認してください：

- [ ] データベースカラム名は`snake_case`か？
- [ ] データベース型定義のプロパティは`snake_case`か？
- [ ] UI型定義のプロパティは`camelCase`か？
- [ ] TypeScript変数名は`camelCase`か？
- [ ] 場所を示すフィールドは`place`を使用しているか？（`location`ではない）
- [ ] データベースから取得したデータをUI型に変換する際、`snake_case` → `camelCase`の変換を行っているか？

## 関連ドキュメント

- `.cursor/rules/03-coding-rules.mdc` - コーディング規約の詳細
- `apps/shared/types/database.ts` - データベース型定義
- `apps/shared/types/ui.ts` - UI型定義

