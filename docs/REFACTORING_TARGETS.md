# リファクタリング対象一覧

## 概要

システム全体の構造を分析し、リファクタリングが必要な箇所を特定しました。
優先度は **High（高）/ Medium（中）/ Low（低）** で分類しています。

---

## 1. 巨大コンポーネントの分割 【High】

以下のコンポーネントが大きすぎるため、分割が必要です。


| ファイル                                                                     | 行数         | 推奨アクション         |
| ------------------------------------------------------------------------ | ---------- | --------------- |
| `apps/mobile/components/calendar/DayDetailModal.tsx`                     | **2,787行** | 機能ごとにサブコンポーネント化 |
| `apps/web/app/(authenticated)/dashboard/_components/DayDetailModal.tsx`  | **2,326行** | 同上（Web版）        |
| `apps/web/app/(authenticated)/practice/_client/PracticeClient.tsx`       | 944行       | ロジックをカスタムフックに抽出 |
| `apps/web/app/(authenticated)/competition/_client/CompetitionClient.tsx` | 884行       | 同上              |
| `apps/web/app/(authenticated)/dashboard/_hooks/useDashboardHandlers.ts`  | 849行       | ハンドラーを機能別に分割    |


### DayDetailModalの分割案

```
DayDetailModal/
├── components/
│   ├── PracticeSection.tsx      # 練習表示セクション
│   ├── CompetitionSection.tsx   # 大会表示セクション
│   ├── AttendanceSection.tsx    # 出欠セクション
│   └── AnnouncementSection.tsx  # お知らせセクション
├── hooks/
│   ├── usePracticeHandlers.ts
│   ├── useCompetitionHandlers.ts
│   └── useAttendanceHandlers.ts
└── DayDetailModal.tsx           # メインコンポーネント（200行以下に）
```

---

## 2. console.log の削除 【High】

本番コードに17箇所のconsole.logが残っています。

### Mobile App


| ファイル                                                  | 行番号                |
| ----------------------------------------------------- | ------------------ |
| `apps/mobile/lib/supabase.ts`                         | 12-14              |
| `apps/mobile/screens/ResetPasswordScreen.tsx`         | 28                 |
| `apps/mobile/screens/LoginScreen.tsx`                 | 37                 |
| `apps/mobile/screens/UpdatePasswordScreen.tsx`        | 34                 |
| `apps/mobile/components/profile/ProfileEditModal.tsx` | 170, 179, 200, 222 |
| `apps/mobile/screens/CompetitionBasicFormScreen.tsx`  | 86, 93, 102        |
| `apps/mobile/screens/SignupScreen.tsx`                | 28                 |
| `apps/mobile/components/auth/LoginForm.tsx`           | 175                |


### Shared


| ファイル                                     | 行番号           |
| ---------------------------------------- | ------------- |
| `apps/shared/hooks/queries/practices.ts` | 414, 432, 442 |
| `apps/shared/hooks/queries/records.ts`   | 387, 405, 415 |


### Web App


| ファイル                                                                    | 行番号      |
| ----------------------------------------------------------------------- | -------- |
| `apps/web/app/(unauthenticated)/contact/page.tsx`                       | 30       |
| `apps/web/app/api/auth/callback/route.ts`                               | 83       |
| `apps/web/app/(authenticated)/dashboard/_hooks/useDashboardHandlers.ts` | 211, 542 |


### 推奨対応

```typescript
// 開発時のみログ出力するユーティリティを作成
export const devLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args)
  }
}
```

---

## 3. TypeScript any型の修正 【High】

15箇所で `any` 型が使用されています。

### API層（優先）


| ファイル                           | 行番号      | 内容                    |
| ------------------------------ | -------- | --------------------- |
| `apps/shared/api/goals.ts`     | 150, 444 | `.map((item: any) =>` |
| `apps/shared/api/practices.ts` | 374      | `const config: any =` |
| `apps/shared/api/records.ts`   | 562, 589 | `const config: any =` |


### ユーティリティ


| ファイル                                 | 行番号         | 内容         |
| ------------------------------------ | ----------- | ---------- |
| `apps/web/utils/practiceExcel.ts`    | 33, 62      | Excelデータ処理 |
| `apps/web/utils/competitionExcel.ts` | 27, 62, 319 | Excelデータ処理 |


### 型ガード（許容可）


| ファイル                          | 行番号                | 備考         |
| ----------------------------- | ------------------ | ---------- |
| `apps/shared/types/common.ts` | 70, 74, 78, 82, 86 | 型ガード関数では妥当 |


---

## 4. N+1クエリの最適化 【High】

### 4.1 TeamAttendancesAPI.listByTeam()

**場所:** `apps/shared/api/teams/attendances.ts` (48-93行)

**問題:** 4回のクエリを実行

```typescript
// 現状: 4回のクエリ
1. practices テーブルからIDを取得
2. competitions テーブルからIDを取得
3. team_attendance から練習分を取得
4. team_attendance から大会分を取得
```

**修正案:**

```typescript
// 1回のクエリに統合
const { data } = await this.supabase
  .from('team_attendance')
  .select(`
    *,
    practice:practices(id, title, date, team_id),
    competition:competitions(id, title, date, team_id)
  `)
  .or(`practice.team_id.eq.${teamId},competition.team_id.eq.${teamId}`)
```

### 4.2 RecordAPI.getBestTimes()

**場所:** `apps/shared/api/records.ts` (215-412行)

**問題:**

- 全レコードをフェッチしてメモリ内で処理
- 2つのMapオブジェクトで重複排除

**修正案:**

```sql
-- データベース側でグルーピング
SELECT DISTINCT ON (style_id, distance, pool_type)
  *
FROM records
WHERE user_id = $1
ORDER BY style_id, distance, pool_type, time ASC
```

### 4.3 TeamMembersAPI の管理者チェック重複

**場所:** `apps/shared/api/teams/members.ts`

**問題:** 同じ管理者チェックが4箇所で重複

- `listPending()` (186-196行)
- `countPending()` (217-227行)
- `approve()` (260-270行)
- `reject()` (310行付近)

**修正案:** 既存の `requireTeamAdmin()` メソッドを活用

### 4.4 useUserQuery の二重フェッチ

**問題:** `useUserQuery()` と `useTeamsQuery()` がチーム情報を重複フェッチ

**修正案:** `useUserQuery()` にチーム情報を統合し、`useTeamsQuery()` は `useUserQuery` のデータを参照

---

## 5. TODO/FIXMEコメントの対応 【Medium】

10箇所の未実装TODOが残っています。

### Mobile App


| ファイル                                            | 行番号 | 内容                          |
| ----------------------------------------------- | --- | --------------------------- |
| `apps/mobile/screens/PracticeLogFormScreen.tsx` | 348 | タグの更新処理を実装                  |
| `apps/mobile/screens/PracticeLogFormScreen.tsx` | 364 | タグの作成処理を実装                  |
| `apps/mobile/screens/DashboardScreen.tsx`       | 99  | CompetitionDetail画面を実装したら追加 |


### Web App


| ファイル                                                                     | 行番号     | 内容                 |
| ------------------------------------------------------------------------ | ------- | ------------------ |
| `apps/web/components/members/MembersList.tsx`                            | 10      | 実装予定               |
| `apps/web/components/team/TeamScheduleManager.tsx`                       | 9       | Supabase直接アクセスで実装  |
| `apps/web/components/team/TeamCompetitionManager.tsx`                    | 9       | 同上                 |
| `apps/web/components/team/TeamPracticeManager.tsx`                       | 9       | 同上                 |
| `apps/web/app/(authenticated)/practice/_client/PracticeClient.tsx`       | 316     | ユーザー名を取得           |
| `apps/web/app/(authenticated)/competition/_client/CompetitionClient.tsx` | 875-876 | ベストタイム判定 / ユーザー名取得 |


---

## 6. 日付フォーマットの統一 【Medium】 ✅ 完了

~~CLAUDE.mdで規定された `date-fns` 統一ルールに違反している箇所があります。~~

### 実装済みの共通関数

`apps/shared/utils/date.ts` に以下の関数を実装：


| 関数                                 | 用途                 |
| ---------------------------------- | ------------------ |
| `formatDate(date, style)`          | 日付をフォーマット          |
| `formatDateTime(date, style)`      | 日時をフォーマット（時刻含む）    |
| `toISODateString(date)`            | `yyyy-MM-dd` 形式に変換 |
| `addMonthsImmutable(date, months)` | 月を加算（ミューテーションなし）   |


### DateStyle オプション


| スタイル                 | 出力例             |
| -------------------- | --------------- |
| `'short'`            | `1月29日`         |
| `'shortWithWeekday'` | `1月29日(水)`      |
| `'long'`             | `2026年1月29日`    |
| `'longWithWeekday'`  | `2026年1月29日(水)` |
| `'numeric'`          | `2026/01/29`    |
| `'iso'`              | `2026-01-29`    |


### 使用例

```typescript
import { formatDate, formatDateTime, toISODateString, addMonthsImmutable } from '@apps/shared/utils/date'

formatDate('2026-01-29', 'short')           // → "1月29日"
formatDate(new Date(), 'longWithWeekday')   // → "2026年1月29日(水)"
formatDateTime('2026-01-29T14:30:00')       // → "2026年1月29日 14:30"
toISODateString(new Date())                 // → "2026-01-29"
addMonthsImmutable(new Date(), 1)           // → 1ヶ月後のDate
```

---

## 7. コード重複の解消 【Medium】

### 7.1 日付フォーマット関数の統一 ✅ 完了

~~複数のコンポーネントで `formatDate()` が個別に実装されています。~~

`apps/shared/utils/date.ts` に統一済み。詳細はセクション6を参照。

**修正済みファイル（15ファイル）:**

- `apps/web/utils/formatters.ts` - 共通関数をre-export
- `apps/mobile/hooks/useCalendarQuery.ts`
- `TeamAnnouncementsSection.tsx`, `AnnouncementDetail.tsx`, `AnnouncementList.tsx`
- `TeamRecords.tsx`, `TeamMembers.tsx`, `TeamStatsCards.tsx`
- `ProfileDisplay.tsx`, `PendingMembersSection.tsx`
- `RecentAttendance.tsx`, `AttendanceStatusModal.tsx`, `MonthDetailModal.tsx`
- `CompetitionCard.tsx`, `Footer.tsx`, `terms/page.tsx`, `privacy/page.tsx`

### 7.2 管理者権限チェックの共通化

`TeamMembersAPI` と `TeamAttendancesAPI` で同様のチェックが重複。

**修正案:** `BaseTeamAPI` クラスを作成し継承

```typescript
abstract class BaseTeamAPI {
  protected async requireAuth(): Promise<string> { ... }
  protected async requireTeamMembership(teamId: string): Promise<void> { ... }
  protected async requireTeamAdmin(teamId: string): Promise<void> { ... }
}

class TeamMembersAPI extends BaseTeamAPI { ... }
class TeamAttendancesAPI extends BaseTeamAPI { ... }
```

### 7.3 モーダル/フォームパターンの共通化

644件のモーダル/フォームコンポーネントが存在。共通パターンを抽出可能。

**検討項目:**

- 共通のモーダルラッパーコンポーネント
- フォームバリデーションの統一
- エラーハンドリングパターンの共通化

---

## 8. Zustandストアの整理 【Low】

### 現状

- Web: 15ストア
- Mobile: 9ストア

### 統合検討対象


| 現在                                                | 統合案                |
| ------------------------------------------------- | ------------------ |
| `practiceFormStore` + `practiceFilterStore`       | `practiceStore`    |
| `competitionFormStore` + `competitionFilterStore` | `competitionStore` |
| `recordLogFormStore` + `recordFormStore`          | `recordStore`      |


---

## 9. エラーハンドリングの統一 【Low】

現在、各APIメソッドで個別にエラーハンドリングしています。

**修正案:** 共通エラーハンドラーユーティリティ

```typescript
// apps/shared/utils/errorHandler.ts
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message)
  }
}

export const handleSupabaseError = (error: PostgrestError): never => {
  if (error.code === 'PGRST116') {
    throw new ApiError('リソースが見つかりません', 'NOT_FOUND')
  }
  if (error.code === '42501') {
    throw new ApiError('権限がありません', 'FORBIDDEN')
  }
  throw new ApiError(error.message, error.code, error.details)
}
```

---

## 10. テストカバレッジの向上 【Low】

現在のカバレッジ閾値: 50%（lines/statements）

### 優先テスト対象

1. API層 (`apps/shared/api/`) - ビジネスロジックの中心
2. カスタムフック (`apps/shared/hooks/`) - 状態管理
3. ユーティリティ関数 (`apps/shared/utils/`) - 共通処理

---

## 実行優先順位

### Phase 1（即座に対応）✅ 完了

1. ✅ console.log の削除（17箇所）
2. ✅ any型の修正（API層 5箇所、ユーティリティ 5箇所）
3. ✅ N+1クエリの修正（TeamAttendancesAPI: 4クエリ→2クエリ）
4. ✅ コード重複の解消（TeamMembersAPI: 管理者チェック共通化）

### Phase 2（1-2週間）

1. DayDetailModal の分割
2. 大きなClientコンポーネントのリファクタリング
3. ✅ 日付フォーマットの統一

### Phase 3（継続的）

1. TODOコメントの実装
2. ✅ コード重複の解消（認証・権限チェック、時刻パース、Supabase型変換、モーダル離脱防止）
3. ストアの整理
4. テストカバレッジ向上

---

## 参考: コードベース構造

```
swim-hub/
├── apps/
│   ├── web/          (Next.js 15 - 40ディレクトリ, 118ファイル)
│   ├── mobile/       (React Native + Expo 54 - 41ディレクトリ)
│   └── shared/       (共通API/型/フック - 15ディレクトリ)
├── supabase/         (マイグレーション、設定)
├── docs/             (ドキュメント)
└── tools/            (共有ビルド設定)
```

---

---

## 変更履歴

### 2026-01-29 Phase 1 完了

- **console.log削除**: Mobile App (11箇所)、Shared (6箇所)、Web App (3箇所)
- **any型修正**:
  - `apps/shared/api/goals.ts`: `GoalQueryResult`型を定義
  - `apps/shared/api/practices.ts`: `RealtimeSubscriptionConfig`型を使用
  - `apps/shared/api/records.ts`: `RealtimeSubscriptionConfig`型を使用
  - `apps/web/utils/practiceExcel.ts`: ExcelJSの`Worksheet`/`Row`型を使用
  - `apps/web/utils/competitionExcel.ts`: 同上
- **N+1クエリ最適化**:
  - `TeamAttendancesAPI.listByTeam()`: 4クエリ → 2クエリ（!innerジョインを使用）
- **コード重複解消**:
  - `TeamMembersAPI`: `requireAuth()`/`requireTeamAdmin()`メソッドを追加

### 2026-01-29 日付フォーマット統一 完了

- **共通関数作成**: `apps/shared/utils/date.ts`
  - `formatDate()`: 日付フォーマット（6スタイル対応）
  - `formatDateTime()`: 日時フォーマット（時刻含む）
  - `toISODateString()`: ISO形式変換
  - `addMonthsImmutable()`: イミュータブルな月加算
- **toLocaleDateString削除**: 15ファイルから削除し共通関数に統一
- **setMonth削除**: `addMonthsImmutable()` に置換
- **toISOString().split削除**: `toISODateString()` に置換
- **テスト更新**: `formatters.test.ts` を新API対応に更新
- **ルートテストスクリプト修正**: web + mobile 両方実行するように変更

### 2026-01-30 コード重複の解消 完了

- **認証・権限チェック共通化**:
  - `apps/shared/api/auth-utils.ts` を新規作成
  - `requireAuth()`, `requireTeamMembership()`, `requireTeamAdmin()` 関数
  - 適用: TeamMembersAPI, TeamAttendancesAPI, TeamAnnouncementsAPI, TeamBulkRegisterAPI, TeamCoreAPI, AttendanceAPI, EntryAPI
- **時刻パース関数統一**:
  - `apps/web/utils/timeParser.ts` を削除
  - `apps/web/hooks/useTeamEntry.ts` のローカル関数を削除
  - `@apps/shared/utils/time` の `parseTimeStrict` に統一
- **Supabase型変換共通化**:
  - `apps/shared/utils/supabase-helpers.ts` を新規作成
  - `normalizeRelation()`, `normalizeRelationArray()` 関数
  - 適用: goals.ts, useTeamEntry.ts
- **モーダル離脱防止共通化**:
  - `apps/web/hooks/useUnsavedChangesWarning.ts` を新規作成
  - beforeunload / popstate イベント処理
  - ConfirmDialog との連携機能

*このドキュメントは 2026-01-30 時点の分析に基づいています。*