# Swim Hub リファクタリング計画書

**作成日**: 2026-01-21
**対象**: システム全体（特にファイル構造とパフォーマンス）
**目的**: コードの可読性向上、保守性向上、パフォーマンス改善、バグ予防

---

## 📋 目次

1. [現状分析](#現状分析)
2. [リファクタリング優先度マトリクス](#リファクタリング優先度マトリクス)
3. [フェーズ1: database.tsの分割](#フェーズ1-databasetsの分割)
4. [フェーズ2: teamモジュールの再組織](#フェーズ2-teamモジュールの再組織)
5. [フェーズ3: formsディレクトリの整理](#フェーズ3-formsディレクトリの整理)
6. [フェーズ4: パフォーマンス最適化](#フェーズ4-パフォーマンス最適化)
7. [フェーズ5: 重複コードの解消](#フェーズ5-重複コードの解消)
8. [実装スケジュール](#実装スケジュール)
9. [リスク評価と対策](#リスク評価と対策)

---

## 現状分析

### プロジェクト構造
```
swim-hub/
├── apps/
│   ├── web/              # Next.js 16アプリケーション
│   │   ├── app/
│   │   │   ├── (authenticated)/    # 認証済みルート（17ページ）
│   │   │   └── (unauthenticated)/  # 未認証ルート
│   │   ├── components/
│   │   │   ├── forms/      # 15コンポーネント（5,827行）
│   │   │   ├── team/       # 27コンポーネント（9,194行）
│   │   │   ├── ui/         # 再利用可能UIコンポーネント
│   │   │   └── charts/     # データ可視化
│   │   ├── stores/         # Zustand状態管理
│   │   └── hooks/          # カスタムフック
│   ├── mobile/           # React Native/Expo
│   └── shared/           # 共有コード
│       ├── types/
│       │   └── database.ts    # 1,003行（問題）
│       ├── api/          # Supabaseクエリクラス
│       ├── hooks/        # React Query統合
│       └── utils/        # 共有ユーティリティ
└── supabase/
    └── migrations/       # 7つのマイグレーション
```

### 主要な問題点

#### 🔴 重大度：高

1. **巨大な型定義ファイル**
   - `apps/shared/types/database.ts`: 1,003行
   - すべてのドメインの型が一つのファイルに集約
   - 可読性・保守性の低下

2. **大規模なformコンポーネント**
   - `RecordForm.tsx`: 865行
   - `PracticeLogForm.tsx`: 848行
   - `RecordLogForm.tsx`: 804行
   - 複数の責務が混在（フォーム、バリデーション、ファイルアップロード、時間計算等）

3. **膨大なteamモジュール**
   - 27コンポーネント、合計9,194行
   - `MyMonthlyAttendance.tsx`: 1,428行
   - `TeamMemberManagement.tsx`: 854行
   - `MemberDetailModal.tsx`: 813行
   - `AdminMonthlyAttendance.tsx`: 711行

4. **パフォーマンス問題**
   - 全体的なページ読み込みの遅延
   - 潜在的なウォーターフォール問題
   - 最適化されていない再レンダリング

#### 🟡 重大度：中

5. **重複コード**
   - `PracticeImageUploader.tsx` (271行) と `CompetitionImageUploader.tsx` (272行)
   - 90%以上のコードが重複（型名のみ異なる）

6. **Attendance表示ロジックの重複**
   - `MyMonthlyAttendance` と `AdminMonthlyAttendance` に共通のサブコンポーネント

7. **テストカバレッジ不足**
   - 約50のテストファイルのみ
   - 大規模コンポーネントのテストが不足

---

## リファクタリング優先度マトリクス

| フェーズ | 対象 | 影響範囲 | 実装難易度 | 優先度 | 推定工数 |
|---------|------|---------|-----------|--------|---------|
| 1 | database.ts分割 | 高 | 低 | 🔴 最高 | 4-6時間 |
| 2 | teamモジュール再組織 | 高 | 中 | 🔴 高 | 8-12時間 |
| 3 | forms整理 | 高 | 高 | 🟡 中 | 12-16時間 |
| 4 | パフォーマンス最適化 | 最高 | 中 | 🔴 最高 | 8-10時間 |
| 5 | 重複コード解消 | 中 | 低 | 🟡 中 | 4-6時間 |

---

## フェーズ1: database.tsの分割

### 目標
巨大な型定義ファイル（1,003行）をドメイン別に分割し、保守性と可読性を向上させる。

### 現在の構造
```typescript
// apps/shared/types/database.ts (1,003行)
export interface UserProfile { ... }
export interface Practice { ... }
export interface PracticeLog { ... }
export interface Record { ... }
export interface Competition { ... }
export interface Team { ... }
export interface Goal { ... }
// ... 40以上のインターフェース
```

### 新しい構造
```
apps/shared/types/
├── index.ts                    # 統合エクスポート
├── common.ts                   # 共通型（50-80行）
├── user.ts                     # ユーザー関連（80-120行）
├── practice.ts                 # 練習関連（150-200行）
├── record.ts                   # 記録関連（120-150行）
├── competition.ts              # 大会関連（120-150行）
├── team.ts                     # チーム関連（150-200行）
├── goal.ts                     # 目標関連（80-120行）
├── attendance.ts               # 出欠関連（80-100行）
├── calendar.ts                 # カレンダー関連（60-80行）
└── supabase.ts                 # Supabase型定義（40-60行）
```

### 詳細な分割計画

#### 1. `common.ts` - 共通型定義
```typescript
// 基本的なenum、共通インターフェース
export type PoolType = 'long' | 'short'
export type AttendanceStatusType = 'present' | 'absent' | 'other' | 'unanswered'
export type CalendarItemType = 'practice' | 'competition'

export interface Style {
  id: number
  name_jp: string
  name: string
  style: 'fr' | 'br' | 'ba' | 'fly' | 'im'
  distance: number
}

export interface TimestampFields {
  created_at: string
  updated_at: string
}

export interface BaseEntity extends TimestampFields {
  id: string
}
```

#### 2. `user.ts` - ユーザー関連型
```typescript
import { BaseEntity } from './common'

export interface UserProfile extends BaseEntity {
  name: string
  gender: number
  birthday: string | null
  profile_image_path: string | null
  bio: string | null
  google_calendar_enabled: boolean
  google_calendar_sync_practices: boolean
  google_calendar_sync_competitions: boolean
}

export type UserInsert = Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>
export type UserUpdate = Partial<UserInsert>

// Google Calendar関連
export interface GoogleCalendarSettings {
  enabled: boolean
  sync_practices: boolean
  sync_competitions: boolean
}
```

#### 3. `practice.ts` - 練習関連型
```typescript
import { BaseEntity, AttendanceStatusType, CalendarItemType } from './common'
import { Style } from './common'

export interface Practice extends BaseEntity {
  user_id: string
  date: string
  title: string | null
  place: string | null
  note: string | null
  team_id?: string | null
  attendance_status?: AttendanceStatusType | null
  google_event_id?: string | null

  // 拡張プロパティ（CalendarItem互換）
  item_type?: CalendarItemType
  item_date?: string
  tags?: string[]
  team_practice?: boolean
  practiceLogs?: PracticeLog[]
  practice_logs?: PracticeLog[]
}

export interface PracticeLog extends BaseEntity {
  user_id: string
  practice_id: string
  style: string
  swim_category: 'Swim' | 'Pull' | 'Kick'
  rep_count: number
  set_count: number
  distance: number
  circle: number | null
  note: string | null
}

export interface PracticeImage extends BaseEntity {
  practice_id: string
  user_id: string
  original_path: string
  display_path: string
  display_order: number
}

export interface PracticeTag {
  id: string
  user_id: string
  tag_name: string
}

export type PracticeInsert = Omit<Practice, 'id' | 'created_at' | 'updated_at'>
export type PracticeUpdate = Partial<Omit<PracticeInsert, 'user_id'>>
export type PracticeLogInsert = Omit<PracticeLog, 'id' | 'created_at' | 'updated_at'>
export type PracticeLogUpdate = Partial<Omit<PracticeLogInsert, 'practice_id'>>
```

#### 4. `record.ts` - 記録関連型
```typescript
import { BaseEntity, PoolType } from './common'

export interface Record extends BaseEntity {
  user_id: string
  style_id: number
  time_result: number
  pool_type: PoolType
  competition_date: string
  competition_name: string
  is_relaying: boolean
  note: string | null
  competition_id?: string | null
  entry_id?: string | null
  team_id?: string | null

  // リレーション
  style?: {
    id: string
    name_jp: string
    distance: number
  }
}

export interface RecordLog extends BaseEntity {
  record_id: string
  user_id: string
  set_number: number
  time_result: number
  reaction_time: number | null
  note: string | null
  lap_times: number[]
}

export type RecordInsert = Omit<Record, 'id' | 'created_at' | 'updated_at'>
export type RecordUpdate = Partial<Omit<RecordInsert, 'user_id'>>
export type RecordLogInsert = Omit<RecordLog, 'id' | 'created_at' | 'updated_at'>
export type RecordLogUpdate = Partial<Omit<RecordLogInsert, 'record_id'>>
```

#### 5. `competition.ts` - 大会関連型
```typescript
import { BaseEntity, CalendarItemType } from './common'

export interface Competition extends BaseEntity {
  user_id: string
  date: string
  name: string
  place: string | null
  note: string | null
  team_id?: string | null
  google_event_id?: string | null

  // 拡張プロパティ
  item_type?: CalendarItemType
  item_date?: string
  team_competition?: boolean
}

export interface CompetitionImage extends BaseEntity {
  competition_id: string
  user_id: string
  original_path: string
  display_path: string
  display_order: number
}

export type CompetitionInsert = Omit<Competition, 'id' | 'created_at' | 'updated_at'>
export type CompetitionUpdate = Partial<Omit<CompetitionInsert, 'user_id'>>
```

#### 6. `team.ts` - チーム関連型
```typescript
import { BaseEntity } from './common'

export interface Team extends BaseEntity {
  name: string
  description: string | null
  owner_id: string
  invitation_code: string
  code_updated_at: string
}

export interface TeamMembership extends BaseEntity {
  team_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  is_active: boolean
}

export interface TeamAnnouncement extends BaseEntity {
  team_id: string
  user_id: string
  title: string
  content: string
  is_pinned: boolean
}

export type TeamInsert = Omit<Team, 'id' | 'created_at' | 'updated_at'>
export type TeamUpdate = Partial<Omit<TeamInsert, 'owner_id'>>
```

#### 7. `attendance.ts` - 出欠関連型
```typescript
import { BaseEntity, AttendanceStatusType } from './common'

export interface TeamAttendance extends BaseEntity {
  team_id: string
  user_id: string
  practice_id: string
  status: AttendanceStatusType
  note: string | null
}

export interface AttendanceSubmission {
  practice_id: string
  status: AttendanceStatusType
  note?: string | null
}

export type TeamAttendanceInsert = Omit<TeamAttendance, 'id' | 'created_at' | 'updated_at'>
export type TeamAttendanceUpdate = Partial<Omit<TeamAttendanceInsert, 'team_id' | 'user_id' | 'practice_id'>>
```

#### 8. `goal.ts` - 目標関連型
```typescript
import { BaseEntity } from './common'

export interface Goal extends BaseEntity {
  user_id: string
  style_id: number
  target_time: number
  deadline: string | null
  is_achieved: boolean
  achieved_at: string | null
  note: string | null

  // リレーション
  style?: {
    id: string
    name_jp: string
    distance: number
  }
}

export type GoalInsert = Omit<Goal, 'id' | 'created_at' | 'updated_at'>
export type GoalUpdate = Partial<Omit<GoalInsert, 'user_id'>>
```

#### 9. `calendar.ts` - カレンダー関連型
```typescript
import { CalendarItemType, PoolType, AttendanceStatusType } from './common'
import { Practice } from './practice'
import { Competition } from './competition'
import { Record } from './record'

export interface CalendarItem {
  id: string
  item_type: CalendarItemType
  item_date: string
  title: string | null
  place: string | null
  note: string | null
  time_result?: number
  pool_type?: PoolType
  tags?: string[]
  competition_name?: string
  is_relaying?: boolean
  team_practice?: boolean
  team_record?: boolean
  team_id?: string | null
  attendance_status?: AttendanceStatusType | null
  style?: {
    id: string
    name_jp: string
    distance: number
  }
}

// カレンダー表示用のユニオン型
export type CalendarEventItem = (Practice | Competition) & {
  item_type: CalendarItemType
  item_date: string
}
```

#### 10. `index.ts` - 統合エクスポート
```typescript
// 共通型
export * from './common'

// ドメイン別型
export * from './user'
export * from './practice'
export * from './record'
export * from './competition'
export * from './team'
export * from './attendance'
export * from './goal'
export * from './calendar'
export * from './supabase'

// 後方互換性のための再エクスポート
// 既存コードが `import { UserProfile } from '@/shared/types/database'` を使用している場合
// 段階的移行期間中は両方からインポート可能にする
```

### 実装手順

#### ステップ1: 新しい型ファイルの作成（影響なし）
1. `apps/shared/types/` 配下に新しいファイルを作成
2. 既存の `database.ts` から型定義をコピー＆分割
3. 各ファイルでの依存関係を整理
4. `index.ts` で統合エクスポート

**所要時間**: 2-3時間

#### ステップ2: インポートパスの更新（段階的）
1. まず `apps/shared/` 内のファイルから更新
   ```typescript
   // Before
   import { UserProfile, Practice } from './types/database'

   // After (推奨)
   import { UserProfile } from './types/user'
   import { Practice } from './types/practice'

   // または（移行期間中）
   import { UserProfile, Practice } from './types'
   ```

2. 次に `apps/web/` と `apps/mobile/` を更新
3. ESLintルールで古いインポートを警告

**所要時間**: 1-2時間

#### ステップ3: database.tsの削除またはdeprecate
1. すべてのインポートが新しいパスに移行したことを確認
2. `database.ts` を削除、または deprecation 警告を追加
   ```typescript
   // @deprecated このファイルは非推奨です。代わりに './types' からインポートしてください
   export * from './index'
   ```

**所要時間**: 30分

#### ステップ4: ドキュメント更新
1. `docs/TYPE_ORGANIZATION.md` を作成
2. 各ドメインの型定義の場所を文書化
3. 新規開発者向けのガイドラインを記載

**所要時間**: 30分-1時間

### テスト戦略
- [ ] 既存のすべてのテストがパスすることを確認
- [ ] TypeScriptコンパイルエラーがないことを確認
- [ ] `npm run build` が成功することを確認
- [ ] 型チェック: `npx tsc --noEmit`

### ロールバック計画
- `database.ts` は移行完了まで保持
- Git履歴で簡単に復元可能

---

## フェーズ2: teamモジュールの再組織

### 目標
9,194行、27コンポーネントの巨大なteamモジュールを機能別にサブモジュール化し、保守性を向上させる。

### 現在の構造（問題点）
```
apps/web/components/team/
├── MyMonthlyAttendance.tsx            (1,428行) 🔴
├── TeamMemberManagement.tsx           (854行)  🔴
├── MemberDetailModal.tsx              (813行)  🔴
├── AdminMonthlyAttendance.tsx         (711行)  🔴
├── TeamBulkRegister.tsx               (582行)
├── TeamEntrySection.tsx               (558行)
├── TeamCompetitions.tsx               (407行)
├── TeamPractices.tsx                  (382行)
├── TeamCompetitionEntryModal.tsx      (341行)
├── AnnouncementForm.tsx               (294行)
├── TeamPracticeForm.tsx               (290行)
├── TeamAttendanceList.tsx             (288行)
├── TeamCompetitionForm.tsx            (269行)
├── TeamRecords.tsx                    (266行)
├── TeamTimeInputModal.tsx             (243行)
├── TeamMembers.tsx                    (230行)
├── TeamSettings.tsx                   (196行)
├── AnnouncementDetail.tsx             (182行)
├── AnnouncementList.tsx               (166行)
└── ... 他8コンポーネント
```

### 新しい構造（機能別モジュール）
```
apps/web/components/team/
├── index.ts                          # 公開APIエクスポート
├── shared/                           # 共通コンポーネント
│   ├── TeamTabs.tsx                  # チームページタブ
│   ├── TeamAdminTabs.tsx             # 管理者用タブ
│   ├── TeamStatsCards.tsx            # 統計カード
│   ├── TeamCreateModal.tsx           # チーム作成モーダル
│   └── TeamJoinModal.tsx             # チーム参加モーダル
│
├── attendance/                       # 出欠管理（2,139行を分割）
│   ├── MyMonthlyAttendance.tsx       # 個人出欠（1,428行 → 分割対象）
│   ├── AdminMonthlyAttendance.tsx    # 管理者出欠（711行 → 分割対象）
│   ├── TeamAttendanceList.tsx        # 出欠リスト
│   ├── components/
│   │   ├── AttendanceCalendar.tsx    # カレンダー表示ロジック（新規抽出）
│   │   ├── AttendanceGroupDisplay.tsx # グループ表示（共通化）
│   │   ├── AttendanceStatusSelect.tsx # ステータス選択
│   │   └── AttendanceFilters.tsx     # フィルタリング
│   └── hooks/
│       ├── useAttendanceData.ts      # データ取得ロジック
│       └── useAttendanceCalendar.ts  # カレンダーロジック
│
├── members/                          # メンバー管理（2,476行）
│   ├── TeamMemberManagement.tsx      # メンバー管理メイン（854行 → 分割対象）
│   ├── MemberDetailModal.tsx         # メンバー詳細（813行 → 分割対象）
│   ├── TeamBulkRegister.tsx          # 一括登録（582行）
│   ├── TeamMembers.tsx               # メンバー一覧（230行）
│   ├── components/
│   │   ├── MemberList.tsx            # メンバーリスト表示（新規抽出）
│   │   ├── MemberCard.tsx            # メンバーカード
│   │   ├── MemberRoleManager.tsx     # 権限管理
│   │   ├── MemberStats.tsx           # メンバー統計
│   │   └── InvitationCodeDisplay.tsx # 招待コード表示
│   └── hooks/
│       ├── useMemberManagement.ts    # メンバー管理ロジック
│       └── useMemberStats.ts         # 統計計算
│
├── competitions/                     # 大会管理（1,017行）
│   ├── TeamCompetitions.tsx          # 大会一覧（407行）
│   ├── TeamCompetitionForm.tsx       # 大会フォーム（269行）
│   ├── TeamCompetitionEntryModal.tsx # エントリーモーダル（341行）
│   └── components/
│       ├── CompetitionList.tsx       # 大会リスト表示
│       └── CompetitionCard.tsx       # 大会カード
│
├── practices/                        # 練習管理（672行）
│   ├── TeamPractices.tsx             # 練習一覧（382行）
│   ├── TeamPracticeForm.tsx          # 練習フォーム（290行）
│   └── components/
│       ├── PracticeList.tsx          # 練習リスト表示
│       └── PracticeCard.tsx          # 練習カード
│
├── entries/                          # エントリー管理（801行）
│   ├── TeamEntrySection.tsx          # エントリーセクション（558行）
│   ├── TeamTimeInputModal.tsx        # タイム入力（243行）
│   └── components/
│       ├── EntryList.tsx             # エントリーリスト
│       └── EntryCard.tsx             # エントリーカード
│
├── records/                          # 記録管理（266行）
│   ├── TeamRecords.tsx               # 記録一覧（266行）
│   └── components/
│       └── RecordList.tsx            # 記録リスト
│
├── announcements/                    # お知らせ管理（642行）
│   ├── TeamAnnouncements.tsx         # お知らせ一覧
│   ├── AnnouncementList.tsx          # お知らせリスト（166行）
│   ├── AnnouncementDetail.tsx        # お知らせ詳細（182行）
│   ├── AnnouncementForm.tsx          # お知らせフォーム（294行）
│   └── components/
│       ├── AnnouncementCard.tsx      # お知らせカード
│       └── AnnouncementEditor.tsx    # エディタ
│
└── settings/                         # チーム設定（196行）
    ├── TeamSettings.tsx              # 設定画面（196行）
    └── components/
        ├── GeneralSettings.tsx       # 一般設定
        ├── InvitationSettings.tsx    # 招待設定
        └── DangerZone.tsx            # 危険な操作
```

### 優先的に分割すべき巨大コンポーネント

#### 1. MyMonthlyAttendance.tsx (1,428行) の分割計画

**現状の問題点**:
- カレンダーロジック、データ取得、UI表示がすべて混在
- 再利用不可能なコード
- テストが困難

**分割後の構造**:
```typescript
// attendance/MyMonthlyAttendance.tsx (200-250行に削減)
'use client'

import { AttendanceCalendar } from './components/AttendanceCalendar'
import { AttendanceGroupDisplay } from './components/AttendanceGroupDisplay'
import { AttendanceFilters } from './components/AttendanceFilters'
import { useAttendanceData } from './hooks/useAttendanceData'
import { useAttendanceCalendar } from './hooks/useAttendanceCalendar'

export const MyMonthlyAttendance = () => {
  const {
    attendanceData,
    isLoading,
    filters,
    setFilters
  } = useAttendanceData()

  const {
    currentMonth,
    calendarDays,
    handleMonthChange
  } = useAttendanceCalendar()

  if (isLoading) return <LoadingSpinner />

  return (
    <div>
      <AttendanceFilters filters={filters} onChange={setFilters} />
      <AttendanceCalendar
        days={calendarDays}
        currentMonth={currentMonth}
        onMonthChange={handleMonthChange}
      />
      <AttendanceGroupDisplay data={attendanceData} />
    </div>
  )
}

// attendance/components/AttendanceCalendar.tsx (300-400行)
// カレンダー表示ロジックのみを担当

// attendance/components/AttendanceGroupDisplay.tsx (200-300行)
// グループ化された出欠表示（MyとAdminで共通化）

// attendance/hooks/useAttendanceData.ts (150-200行)
// データ取得とフィルタリングロジック

// attendance/hooks/useAttendanceCalendar.ts (100-150行)
// カレンダーの月移動、日付計算ロジック
```

#### 2. TeamMemberManagement.tsx (854行) の分割計画

**分割後の構造**:
```typescript
// members/TeamMemberManagement.tsx (150-200行に削減)
import { MemberList } from './components/MemberList'
import { MemberRoleManager } from './components/MemberRoleManager'
import { InvitationCodeDisplay } from './components/InvitationCodeDisplay'
import { useMemberManagement } from './hooks/useMemberManagement'

export const TeamMemberManagement = ({ teamId }: Props) => {
  const {
    members,
    invitationCode,
    updateRole,
    removeMember,
    regenerateCode
  } = useMemberManagement(teamId)

  return (
    <div>
      <InvitationCodeDisplay code={invitationCode} onRegenerate={regenerateCode} />
      <MemberList members={members}>
        {(member) => (
          <MemberRoleManager
            member={member}
            onUpdateRole={updateRole}
            onRemove={removeMember}
          />
        )}
      </MemberList>
    </div>
  )
}

// members/components/MemberList.tsx (200-250行)
// members/components/MemberRoleManager.tsx (150-200行)
// members/hooks/useMemberManagement.ts (200-250行)
```

#### 3. MemberDetailModal.tsx (813行) の分割計画

**分割後の構造**:
```typescript
// members/MemberDetailModal.tsx (150-200行に削減)
import { MemberStats } from './components/MemberStats'
import { MemberRecordHistory } from './components/MemberRecordHistory'
import { MemberPracticeHistory } from './components/MemberPracticeHistory'

export const MemberDetailModal = ({ member, isOpen, onClose }: Props) => {
  if (!isOpen) return null

  return (
    <Modal onClose={onClose}>
      <MemberBasicInfo member={member} />
      <Tabs>
        <TabPanel label="統計">
          <MemberStats memberId={member.id} />
        </TabPanel>
        <TabPanel label="記録">
          <MemberRecordHistory memberId={member.id} />
        </TabPanel>
        <TabPanel label="練習">
          <MemberPracticeHistory memberId={member.id} />
        </TabPanel>
      </Tabs>
    </Modal>
  )
}

// members/components/MemberStats.tsx (200-250行)
// members/components/MemberRecordHistory.tsx (200-250行)
// members/components/MemberPracticeHistory.tsx (200-250行)
```

### 実装手順

#### ステップ1: サブディレクトリの作成と共通コンポーネントの移動
1. `apps/web/components/team/` 配下にサブディレクトリを作成
2. 既存の小規模コンポーネントを適切なサブディレクトリに移動
3. 公開API用の `index.ts` を作成

**所要時間**: 1-2時間

#### ステップ2: attendanceモジュールの分割
1. `AttendanceGroupDisplay` を共通コンポーネントとして抽出
2. `MyMonthlyAttendance` を分割
3. `AdminMonthlyAttendance` を分割
4. カスタムフックを抽出

**所要時間**: 3-4時間

#### ステップ3: membersモジュールの分割
1. `TeamMemberManagement` を分割
2. `MemberDetailModal` を分割
3. カスタムフックを抽出

**所要時間**: 3-4時間

#### ステップ4: その他のモジュールの整理
1. competitions, practices, entries, records, announcementsを整理
2. 各モジュールの `index.ts` を作成

**所要時間**: 2-3時間

#### ステップ5: インポートパスの更新と検証
```typescript
// Before
import { MyMonthlyAttendance } from '@/components/team/MyMonthlyAttendance'

// After
import { MyMonthlyAttendance } from '@/components/team/attendance'
// または
import { MyMonthlyAttendance } from '@/components/team'
```

**所要時間**: 1-2時間

### テスト戦略
- [ ] 各サブモジュールのユニットテストを追加
- [ ] 統合テストでチーム機能全体をテスト
- [ ] E2Eテストでユーザーフローを検証

---

## フェーズ3: formsディレクトリの整理

### 目標
大規模なformコンポーネント（800行以上）を分割し、再利用可能なサブコンポーネントとロジックを抽出する。

### 現在の問題点
```
apps/web/components/forms/
├── RecordForm.tsx              (865行) 🔴 複雑すぎる
├── PracticeLogForm.tsx         (848行) 🔴 複雑すぎる
├── RecordLogForm.tsx           (804行) 🔴 複雑すぎる
├── EntryLogForm.tsx            (488行) 🟡
├── CompetitionImageUploader    (272行) 🟡 重複コード
├── PracticeImageUploader       (271行) 🟡 重複コード
└── ...
```

**問題点**:
1. 一つのコンポーネントに複数の責務が混在
   - フォームバリデーション
   - ファイルアップロード
   - 時間計算・フォーマット
   - タグ管理
   - UI表示

2. 再利用不可能なロジック
3. テストが困難
4. 変更の影響範囲が広い

### 新しい構造
```
apps/web/components/forms/
├── index.ts                    # 公開APIエクスポート
│
├── record/                     # 記録フォーム（865行を分割）
│   ├── RecordForm.tsx          # メインフォーム（150-200行に削減）
│   ├── RecordFormProvider.tsx # フォーム状態管理
│   ├── components/
│   │   ├── RecordBasicInfo.tsx      # 基本情報入力（種目、日付等）
│   │   ├── RecordTimeInput.tsx      # タイム入力
│   │   ├── RecordSetManager.tsx     # セット管理
│   │   ├── RecordLapTimes.tsx       # ラップタイム入力
│   │   └── RecordCompetitionInfo.tsx # 大会情報
│   ├── hooks/
│   │   ├── useRecordForm.ts         # フォームロジック
│   │   ├── useRecordValidation.ts   # バリデーション
│   │   └── useRecordSubmit.ts       # 送信処理
│   └── utils/
│       ├── recordCalculations.ts    # 計算ロジック
│       └── recordValidators.ts      # バリデータ
│
├── practice-log/               # 練習ログフォーム（848行を分割）
│   ├── PracticeLogForm.tsx     # メインフォーム（150-200行に削減）
│   ├── PracticeLogProvider.tsx # フォーム状態管理
│   ├── components/
│   │   ├── PracticeSetInput.tsx     # セット入力
│   │   ├── PracticeStyleSelect.tsx  # 種目選択
│   │   ├── PracticeRepInput.tsx     # 本数・セット数
│   │   ├── PracticeCircleInput.tsx  # サークル入力
│   │   └── PracticeTagManager.tsx   # タグ管理
│   ├── hooks/
│   │   ├── usePracticeLogForm.ts
│   │   ├── usePracticeLogTags.ts
│   │   └── usePracticeLogSubmit.ts
│   └── utils/
│       └── practiceCalculations.ts
│
├── record-log/                 # 記録ログフォーム（804行を分割）
│   ├── RecordLogForm.tsx
│   ├── components/
│   │   └── ...
│   └── hooks/
│       └── ...
│
├── shared/                     # 共通フォームコンポーネント
│   ├── TimeInput/              # 時間入力コンポーネント
│   │   ├── TimeInput.tsx       # 共通時間入力UI
│   │   ├── TimeInputModal.tsx  # モーダル版
│   │   ├── LapTimeDisplay.tsx  # ラップタイム表示
│   │   └── hooks/
│   │       └── useTimeInput.ts # 時間入力ロジック
│   │
│   ├── ImageUploader/          # 画像アップロード（重複解消）
│   │   ├── ImageUploader.tsx   # 汎用画像アップローダー
│   │   ├── ImagePreview.tsx    # プレビュー表示
│   │   ├── ImageDragDrop.tsx   # ドラッグ&ドロップ
│   │   └── hooks/
│   │       ├── useImageUpload.ts
│   │       └── useImageValidation.ts
│   │
│   ├── TagManager/             # タグ管理
│   │   ├── TagInput.tsx        # タグ入力
│   │   ├── TagList.tsx         # タグリスト
│   │   ├── TagManagementModal.tsx
│   │   └── hooks/
│   │       └── useTagManager.ts
│   │
│   └── StyleSelect/            # 種目選択
│       ├── StyleSelect.tsx
│       ├── StyleFilter.tsx
│       └── hooks/
│           └── useStyleSelect.ts
│
├── team/                       # チーム関連フォーム
│   ├── TeamCreateForm.tsx
│   ├── TeamJoinForm.tsx
│   └── components/
│       └── ...
│
├── competition/                # 大会フォーム
│   ├── CompetitionBasicForm.tsx
│   └── components/
│       └── ...
│
└── practice/                   # 練習フォーム
    ├── PracticeBasicForm.tsx
    ├── PracticeForm.tsx
    └── components/
        └── ...
```

### 重複コード解消: 汎用ImageUploaderの作成

**現状**: PracticeImageUploader (271行) と CompetitionImageUploader (272行) が90%重複

**解決策**: 型パラメータを使った汎用コンポーネント

```typescript
// forms/shared/ImageUploader/ImageUploader.tsx
interface ImageUploaderProps<T extends { id: string }> {
  entityId: string
  entityType: 'practice' | 'competition'
  images: T[]
  maxImages?: number
  maxSizeKB?: number
  onUpload: (files: File[]) => Promise<void>
  onDelete: (imageId: string) => Promise<void>
  onReorder?: (images: T[]) => Promise<void>
}

export function ImageUploader<T extends { id: string; display_path: string; display_order: number }>({
  entityId,
  entityType,
  images,
  maxImages = 10,
  maxSizeKB = 5120,
  onUpload,
  onDelete,
  onReorder
}: ImageUploaderProps<T>) {
  // 共通のアップロードロジック
  const { isDragging, handleDrop, handleFileSelect } = useImageUpload({
    onUpload,
    maxImages,
    maxSizeKB
  })

  return (
    <div>
      <ImageDragDrop
        isDragging={isDragging}
        onDrop={handleDrop}
        onFileSelect={handleFileSelect}
      />
      <ImagePreview
        images={images}
        onDelete={onDelete}
        onReorder={onReorder}
      />
    </div>
  )
}

// 使用例: PracticeImageUploader
export const PracticeImageUploader = (props: PracticeImageUploaderProps) => {
  return (
    <ImageUploader<PracticeImage>
      entityType="practice"
      {...props}
    />
  )
}

// 使用例: CompetitionImageUploader
export const CompetitionImageUploader = (props: CompetitionImageUploaderProps) => {
  return (
    <ImageUploader<CompetitionImage>
      entityType="competition"
      {...props}
    />
  )
}
```

### RecordForm.tsx (865行) の詳細分割計画

**現在の構造（問題点）**:
```typescript
// RecordForm.tsx (865行)
export const RecordForm = () => {
  // 100行以上のstate定義
  const [styleId, setStyleId] = useState(...)
  const [timeResult, setTimeResult] = useState(...)
  const [sets, setSets] = useState([...])
  // ... 20以上のstate

  // 200行以上のイベントハンドラ
  const handleStyleChange = () => { /* 複雑なロジック */ }
  const handleTimeChange = () => { /* 時間計算ロジック */ }
  const handleSetAdd = () => { /* セット追加ロジック */ }
  // ... 10以上のハンドラ

  // 300行以上のバリデーション
  const validateForm = () => { /* 複雑なバリデーション */ }
  const validateTime = () => { /* ... */ }

  // 200行以上のUI
  return (
    <form>
      {/* 種目選択 */}
      {/* タイム入力 */}
      {/* セット管理 */}
      {/* ラップタイム */}
      {/* 大会情報 */}
    </form>
  )
}
```

**分割後の構造（推奨）**:
```typescript
// record/RecordForm.tsx (150-200行に削減)
export const RecordForm = ({ initialData, onSubmit }: Props) => {
  return (
    <RecordFormProvider initialData={initialData}>
      <form onSubmit={handleSubmit}>
        <RecordBasicInfo />
        <RecordTimeInput />
        <RecordSetManager />
        <RecordLapTimes />
        <RecordCompetitionInfo />
        <FormActions onCancel={onCancel} />
      </form>
    </RecordFormProvider>
  )
}

// record/RecordFormProvider.tsx (100-150行)
// Context + Reducer でフォーム状態を管理
export const RecordFormProvider = ({ children, initialData }) => {
  const form = useRecordForm(initialData)

  return (
    <RecordFormContext.Provider value={form}>
      {children}
    </RecordFormContext.Provider>
  )
}

// record/hooks/useRecordForm.ts (200-250行)
export const useRecordForm = (initialData?: Partial<Record>) => {
  const [formState, dispatch] = useReducer(recordFormReducer, initialState)
  const validation = useRecordValidation(formState)
  const submit = useRecordSubmit()

  return {
    formState,
    validation,
    updateField: (field, value) => dispatch({ type: 'UPDATE_FIELD', field, value }),
    addSet: () => dispatch({ type: 'ADD_SET' }),
    removeSet: (index) => dispatch({ type: 'REMOVE_SET', index }),
    submit: () => submit(formState)
  }
}

// record/components/RecordBasicInfo.tsx (80-120行)
export const RecordBasicInfo = () => {
  const { formState, updateField, validation } = useRecordFormContext()

  return (
    <div>
      <StyleSelect
        value={formState.styleId}
        onChange={(id) => updateField('styleId', id)}
        error={validation.errors.styleId}
      />
      <PoolTypeSelect ... />
      <DatePicker ... />
    </div>
  )
}

// record/components/RecordTimeInput.tsx (100-150行)
// 時間入力の複雑なロジックを分離

// record/components/RecordSetManager.tsx (150-200行)
// セット管理ロジックを分離

// record/utils/recordCalculations.ts (80-120行)
// 計算ロジックをピュア関数として分離
export const calculateAverageTime = (sets: RecordSet[]): number => {
  // ...
}

export const calculatePacePerLap = (time: number, distance: number): number => {
  // ...
}

// record/utils/recordValidators.ts (100-150行)
// バリデーションロジックをピュア関数として分離
export const validateRecordTime = (time: number): ValidationResult => {
  if (time <= 0) return { valid: false, error: 'タイムは0より大きい必要があります' }
  if (time > 86400) return { valid: false, error: 'タイムが無効です' }
  return { valid: true }
}
```

### 実装手順

#### ステップ1: 共通コンポーネントの作成
1. `forms/shared/` ディレクトリを作成
2. 汎用 `ImageUploader` を実装（重複解消）
3. `TimeInput` コンポーネントを抽出
4. `TagManager` を抽出

**所要時間**: 3-4時間

#### ステップ2: RecordFormの分割
1. `RecordFormProvider` を作成（状態管理）
2. サブコンポーネントを作成
   - `RecordBasicInfo`
   - `RecordTimeInput`
   - `RecordSetManager`
3. カスタムフックを作成
4. ユーティリティ関数を抽出

**所要時間**: 4-5時間

#### ステップ3: PracticeLogFormの分割
1. 同様の手法で分割
2. 共通コンポーネントを活用

**所要時間**: 3-4時間

#### ステップ4: RecordLogFormの分割
**所要時間**: 3-4時間

#### ステップ5: 既存コードの置き換えと検証
**所要時間**: 1-2時間

### テスト戦略
- [ ] 各サブコンポーネントのユニットテスト
- [ ] ユーティリティ関数のテスト（ピュア関数なのでテストしやすい）
- [ ] フォーム全体の統合テスト
- [ ] E2Eテストで実際の入力フローをテスト

---

## フェーズ4: パフォーマンス最適化

### 目標
全体的なページ読み込み速度を改善し、ユーザー体験を向上させる。

### 現状の問題分析

#### 潜在的なパフォーマンス問題
1. **ウォーターフォール問題**: データ取得が直列に実行される可能性
2. **不要な再レンダリング**: 適切なメモ化が欠如
3. **大きなバンドルサイズ**: コード分割が不十分
4. **最適化されていないクエリ**: N+1問題の可能性
5. **画像最適化の欠如**: Next.js Imageの活用不足

### パフォーマンス最適化戦略

#### 1. データ取得の最適化

**問題**: 複数のデータ取得が直列実行（ウォーターフォール）

```typescript
// ❌ 悪い例: ウォーターフォール
const Dashboard = () => {
  const { data: practices } = usePracticesQuery()
  const { data: records } = useRecordsQuery()
  const { data: goals } = useGoalsQuery()

  // 各クエリが順番に実行される
}
```

**解決策**: React Server Componentsで並行データ取得

```typescript
// ✅ 良い例: 並行データ取得
// apps/web/app/(authenticated)/dashboard/_server/DashboardDataLoader.tsx
import { createServerClient } from '@/lib/supabase/server'

async function fetchAllData() {
  const supabase = createServerClient()

  // すべてのデータ取得を並行実行
  const [practices, records, goals, teams] = await Promise.all([
    supabase.from('practices').select('*').order('date', { ascending: false }).limit(10),
    supabase.from('records').select('*, style:styles(*)').order('competition_date', { ascending: false }).limit(10),
    supabase.from('goals').select('*, style:styles(*)').where('is_achieved', false),
    supabase.from('team_memberships').select('*, team:teams(*)').eq('is_active', true)
  ])

  return {
    practices: practices.data ?? [],
    records: records.data ?? [],
    goals: goals.data ?? [],
    teams: teams.data ?? []
  }
}

export default async function DashboardDataLoader() {
  const data = await fetchAllData() // 並行実行

  return <DashboardClient {...data} />
}
```

**適用箇所**:
- [ ] ダッシュボードページ
- [ ] チームページ
- [ ] マイページ
- [ ] 記録ページ

#### 2. React Query の最適化

**設定の見直し**:
```typescript
// apps/web/lib/react-query/queryClient.ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5分（現在の設定を維持）
      cacheTime: 10 * 60 * 1000,       // 10分
      refetchOnWindowFocus: false,     // ウィンドウフォーカス時の再取得を無効化
      refetchOnReconnect: true,        // 再接続時は再取得
      retry: 1,                        // リトライ回数を削減
      // ✅ 新規追加: プリフェッチの有効化
      suspense: false,                 // Suspenseは必要な場所でのみ有効化
    }
  }
})
```

**プリフェッチの活用**:
```typescript
// apps/web/components/navigation/NavLink.tsx
export const NavLink = ({ href, children }: Props) => {
  const queryClient = useQueryClient()

  const handleMouseEnter = () => {
    // ホバー時に次のページのデータをプリフェッチ
    if (href === '/practices') {
      queryClient.prefetchQuery(['practices'], fetchPractices)
    }
  }

  return (
    <Link href={href} onMouseEnter={handleMouseEnter}>
      {children}
    </Link>
  )
}
```

#### 3. コンポーネントの最適化

**React.memoの適用**:
```typescript
// ❌ 不要な再レンダリングが発生
export const PracticeCard = ({ practice, onEdit, onDelete }) => {
  return <div>...</div>
}

// ✅ メモ化で再レンダリングを防止
export const PracticeCard = React.memo(({ practice, onEdit, onDelete }) => {
  return <div>...</div>
}, (prevProps, nextProps) => {
  // カスタム比較関数で精密な制御
  return prevProps.practice.id === nextProps.practice.id &&
         prevProps.practice.updated_at === nextProps.practice.updated_at
})
```

**適用対象コンポーネント**:
- [ ] PracticeCard, RecordCard, GoalCard
- [ ] リスト内の繰り返し要素
- [ ] 高頻度で再レンダリングされるコンポーネント

**useMemo / useCallbackの適用**:
```typescript
// ❌ 毎回新しい関数が生成される
const handleClick = () => {
  doSomething(id)
}

// ✅ 関数をメモ化
const handleClick = useCallback(() => {
  doSomething(id)
}, [id])

// ❌ 毎回計算が実行される
const filteredPractices = practices.filter(p => p.team_id === teamId)

// ✅ 計算結果をメモ化
const filteredPractices = useMemo(
  () => practices.filter(p => p.team_id === teamId),
  [practices, teamId]
)
```

#### 4. バンドルサイズの最適化

**動的インポートの活用**:
```typescript
// ❌ すべてのモーダルが初期バンドルに含まれる
import { RecordFormModal } from '@/components/modals/RecordFormModal'
import { PracticeFormModal } from '@/components/modals/PracticeFormModal'

// ✅ 動的インポートで必要な時のみロード
const RecordFormModal = dynamic(() => import('@/components/modals/RecordFormModal'), {
  loading: () => <ModalSkeleton />
})

const PracticeFormModal = dynamic(() => import('@/components/modals/PracticeFormModal'), {
  loading: () => <ModalSkeleton />
})
```

**動的インポート適用対象**:
- [ ] モーダルコンポーネント（RecordFormModal, PracticeFormModal等）
- [ ] チャートライブラリ（RecordProgressChart等）
- [ ] 画像エディタ（ImageCrop等）
- [ ] PDFエクスポート機能
- [ ] Excelエクスポート機能

**バンドル分析**:
```bash
# next.config.jsに追加
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true'
})

module.exports = withBundleAnalyzer(nextConfig)

# 実行
ANALYZE=true npm run build
```

#### 5. 画像の最適化

**Next.js Imageコンポーネントの活用**:
```typescript
// ❌ 最適化されていない画像
<img src={practice.image_url} alt="Practice" />

// ✅ Next.js Imageで最適化
import Image from 'next/image'

<Image
  src={practice.image_url}
  alt="Practice"
  width={800}
  height={600}
  placeholder="blur"
  blurDataURL={practice.blur_data_url}
  loading="lazy"
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>
```

**画像フォーマットの最適化**:
```javascript
// next.config.js
module.exports = {
  images: {
    formats: ['image/avif', 'image/webp'], // 最新フォーマットを優先
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  }
}
```

#### 6. Supabaseクエリの最適化

**select文の最適化**:
```typescript
// ❌ すべてのカラムを取得
const { data } = await supabase.from('practices').select('*')

// ✅ 必要なカラムのみ取得
const { data } = await supabase
  .from('practices')
  .select('id, date, title, place, team_id, practice_logs(id, style, distance)')
  .order('date', { ascending: false })
  .limit(20)
```

**インデックスの確認と追加**:
```sql
-- 頻繁にクエリされるカラムにインデックスを追加
CREATE INDEX IF NOT EXISTS idx_practices_user_date ON practices(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_practices_team_date ON practices(team_id, date DESC) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_records_user_style ON records(user_id, style_id);
CREATE INDEX IF NOT EXISTS idx_team_attendance_practice ON team_attendance(practice_id, status);
```

**N+1問題の解決**:
```typescript
// ❌ N+1問題が発生
const practices = await supabase.from('practices').select('*')
for (const practice of practices.data) {
  const logs = await supabase.from('practice_logs').select('*').eq('practice_id', practice.id)
  // 各practiceに対して個別にクエリが実行される
}

// ✅ JOINで一度に取得
const { data } = await supabase
  .from('practices')
  .select(`
    *,
    practice_logs(*)
  `)
  .order('date', { ascending: false })
```

#### 7. リアルタイムサブスクリプションの最適化

**現在の実装**:
```typescript
// apps/shared/hooks/queries/practices.ts
useEffect(() => {
  const channel = supabase
    .channel('practices_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'practices' }, () => {
      queryClient.invalidateQueries(['practices']) // すべてのキャッシュを無効化
    })
    .subscribe()
}, [])
```

**最適化案**:
```typescript
// ✅ 部分的なキャッシュ更新
useEffect(() => {
  const channel = supabase
    .channel('practices_changes')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'practices' },
      (payload) => {
        // 新規データをキャッシュに追加（再取得不要）
        queryClient.setQueryData(['practices'], (old) => [payload.new, ...old])
      }
    )
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'practices' },
      (payload) => {
        // 更新されたデータのみキャッシュ更新
        queryClient.setQueryData(['practices'], (old) =>
          old.map(p => p.id === payload.new.id ? payload.new : p)
        )
      }
    )
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'practices' },
      (payload) => {
        // 削除されたデータをキャッシュから除去
        queryClient.setQueryData(['practices'], (old) =>
          old.filter(p => p.id !== payload.old.id)
        )
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}, [])
```

#### 8. サーバーコンポーネントの活用

**Next.js 16のServer Componentsを最大限活用**:

```typescript
// ✅ apps/web/app/(authenticated)/dashboard/page.tsx
// デフォルトでServer Component
export default async function DashboardPage() {
  // サーバー側でデータ取得（高速）
  const supabase = createServerClient()
  const { data: practices } = await supabase
    .from('practices')
    .select('*')
    .order('date', { ascending: false })
    .limit(10)

  return (
    <div>
      {/* 静的な部分はServer Component */}
      <DashboardHeader />

      {/* インタラクティブな部分のみClient Component */}
      <PracticeList practices={practices} />
    </div>
  )
}

// apps/web/app/(authenticated)/dashboard/PracticeList.tsx
'use client' // インタラクティブな部分のみ

export const PracticeList = ({ practices }: { practices: Practice[] }) => {
  const [filter, setFilter] = useState('')
  // クライアント側のインタラクティブなロジック

  return <div>...</div>
}
```

### 実装手順

#### ステップ1: パフォーマンス計測ベースラインの作成
```bash
# Lighthouseでパフォーマンス計測
npm run build
npm run start
# Chrome DevToolsでLighthouseを実行

# Core Web Vitals測定
# - LCP (Largest Contentful Paint): 2.5秒以下
# - FID (First Input Delay): 100ms以下
# - CLS (Cumulative Layout Shift): 0.1以下
```

**所要時間**: 1時間

#### ステップ2: データ取得の最適化
1. 主要ページでServer Componentsを活用
2. Promise.allで並行データ取得
3. React Query設定の見直し

**所要時間**: 3-4時間

#### ステップ3: コンポーネントの最適化
1. React.memoの適用
2. useMemo/useCallbackの適用
3. 仮想化（react-window）の検討（長いリスト）

**所要時間**: 2-3時間

#### ステップ4: バンドルサイズの最適化
1. 動的インポートの適用
2. バンドル分析と最適化

**所要時間**: 2-3時間

#### ステップ5: 画像とクエリの最適化
1. Next.js Imageへの置き換え
2. Supabaseクエリの最適化
3. インデックスの追加

**所要時間**: 2-3時間

#### ステップ6: パフォーマンス再計測と検証
**所要時間**: 1時間

### 期待される改善効果

| 指標 | 現在（推定） | 目標 | 改善率 |
|-----|------------|-----|--------|
| LCP (Largest Contentful Paint) | 3.5s | <2.0s | 43%改善 |
| FID (First Input Delay) | 150ms | <100ms | 33%改善 |
| バンドルサイズ（初期） | 800KB | <500KB | 38%削減 |
| Time to Interactive | 4.5s | <3.0s | 33%改善 |
| ダッシュボード読み込み | 2.5s | <1.5s | 40%改善 |

---

## フェーズ5: 重複コードの解消

### 目標
重複したコードを共通化し、保守性を向上させる。

### 重複箇所の特定

#### 1. ImageUploaderコンポーネント（優先度：高）
- `PracticeImageUploader.tsx` (271行)
- `CompetitionImageUploader.tsx` (272行)
- **重複率**: 90%以上

**解決策**: フェーズ3の汎用ImageUploaderで対応

#### 2. Attendanceコンポーネント（優先度：中）
- `MyMonthlyAttendance.tsx` (1,428行)
- `AdminMonthlyAttendance.tsx` (711行)
- **共通部分**: AttendanceGroupingDisplay, カレンダーナビゲーション

**解決策**: フェーズ2のattendanceモジュール分割で対応

#### 3. 時間フォーマット関数（優先度：中）
複数のファイルで同様の時間フォーマット処理が散在:
- `apps/web/utils/formatters.ts`
- `apps/shared/utils/time.ts`
- 各フォームコンポーネント内

**解決策**: 共通ユーティリティに集約
```typescript
// apps/shared/utils/time.ts（統合版）
export const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(2)
  return `${minutes}:${secs.padStart(5, '0')}`
}

export const parseTime = (timeString: string): number => {
  const [minutes, seconds] = timeString.split(':').map(parseFloat)
  return minutes * 60 + seconds
}

export const formatLapTime = (milliseconds: number): string => {
  const totalSeconds = milliseconds / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = (totalSeconds % 60).toFixed(2)
  return `${minutes}:${seconds.padStart(5, '0')}`
}
```

#### 4. バリデーション関数（優先度：低）
複数のフォームで類似のバリデーション:
- タイムのバリデーション
- 日付のバリデーション
- 入力値の範囲チェック

**解決策**: 共通バリデータライブラリ
```typescript
// apps/shared/utils/validators.ts
export const validators = {
  time: (value: number): ValidationResult => {
    if (value <= 0) return { valid: false, error: 'タイムは0より大きい必要があります' }
    if (value > 86400) return { valid: false, error: 'タイムが無効です（24時間以内）' }
    return { valid: true }
  },

  date: (value: string): ValidationResult => {
    const date = new Date(value)
    if (isNaN(date.getTime())) return { valid: false, error: '無効な日付です' }
    if (date > new Date()) return { valid: false, error: '未来の日付は指定できません' }
    return { valid: true }
  },

  distance: (value: number): ValidationResult => {
    const validDistances = [25, 50, 100, 200, 400, 800, 1500]
    if (!validDistances.includes(value)) {
      return { valid: false, error: '無効な距離です' }
    }
    return { valid: true }
  }
}
```

### 実装手順

#### ステップ1: 汎用ImageUploaderの実装
**所要時間**: 2-3時間（フェーズ3に含まれる）

#### ステップ2: Attendance共通化
**所要時間**: 2-3時間（フェーズ2に含まれる）

#### ステップ3: ユーティリティ関数の統合
1. 時間フォーマット関数を `apps/shared/utils/time.ts` に集約
2. 既存コードの置き換え
3. 古い関数を削除

**所要時間**: 2-3時間

#### ステップ4: バリデータの統合
1. 共通バリデータライブラリを作成
2. 既存のバリデーション処理を置き換え

**所要時間**: 2-3時間

---

## 実装スケジュール

### 全体スケジュール（推定）

| フェーズ | 内容 | 所要時間 | 依存関係 | 優先度 |
|---------|-----|---------|---------|--------|
| **フェーズ1** | database.ts分割 | 4-6時間 | なし | 🔴 最高 |
| **フェーズ2** | teamモジュール再組織 | 8-12時間 | フェーズ1完了後 | 🔴 高 |
| **フェーズ3** | forms整理 | 12-16時間 | フェーズ1完了後 | 🟡 中 |
| **フェーズ4** | パフォーマンス最適化 | 8-10時間 | 並行実施可能 | 🔴 最高 |
| **フェーズ5** | 重複コード解消 | 4-6時間 | フェーズ2,3に統合 | 🟡 中 |
| **テスト** | 総合テストと調整 | 4-6時間 | 全フェーズ完了後 | - |

**合計推定時間**: 40-56時間（5-7営業日相当）

### 段階的実装の推奨順序

#### 週1: 基盤整備（フェーズ1 + フェーズ4の一部）
- [ ] database.tsの分割（4-6時間）
- [ ] パフォーマンス計測ベースライン作成（1時間）
- [ ] Server Componentsでのデータ取得最適化（3-4時間）

**成果物**:
- 新しい型定義構造
- ベースラインパフォーマンスレポート
- 最適化されたダッシュボード

#### 週2: モジュール分割（フェーズ2）
- [ ] teamモジュールのサブディレクトリ作成（1-2時間）
- [ ] attendanceモジュールの分割（3-4時間）
- [ ] membersモジュールの分割（3-4時間）
- [ ] その他モジュールの整理（2-3時間）

**成果物**:
- 整理されたteamモジュール構造
- 再利用可能なサブコンポーネント

#### 週3: フォーム最適化（フェーズ3 + フェーズ4の一部）
- [ ] 共通フォームコンポーネントの作成（3-4時間）
- [ ] RecordFormの分割（4-5時間）
- [ ] PracticeLogFormの分割（3-4時間）
- [ ] コンポーネントの最適化（React.memo等）（2-3時間）

**成果物**:
- 再利用可能なフォームコンポーネント
- 分割された大規模フォーム
- 最適化されたレンダリング

#### 週4: 仕上げとテスト（フェーズ4の残り + 総合テスト）
- [ ] バンドルサイズ最適化（2-3時間）
- [ ] 画像・クエリ最適化（2-3時間）
- [ ] パフォーマンス再計測（1時間）
- [ ] 総合テストと調整（4-6時間）

**成果物**:
- 最適化されたアプリケーション
- パフォーマンスレポート
- テストレポート

---

## リスク評価と対策

### 高リスク項目

#### リスク1: 既存機能の破壊
**内容**: リファクタリング中に既存機能が動作しなくなる

**影響度**: 高
**発生確率**: 中

**対策**:
1. 各フェーズ後に既存テストを実行
2. E2Eテストで主要フローを検証
3. ステージング環境でテスト
4. 段階的にリリース（feature flagの活用）
5. Gitブランチ戦略: 各フェーズごとに個別ブランチ

#### リスク2: 型定義の不整合
**内容**: database.ts分割時に型の依存関係でエラー発生

**影響度**: 中
**発生確率**: 中

**対策**:
1. TypeScriptのstrict modeで早期発見
2. 分割後も`database.ts`を一時的に保持（後方互換性）
3. `index.ts`で統合エクスポート
4. CI/CDで型チェックを自動化

#### リスク3: パフォーマンス改善が不十分
**内容**: 最適化しても目標パフォーマンスに到達しない

**影響度**: 中
**発生確率**: 低

**対策**:
1. ベースライン計測で現状把握
2. 小さな改善を積み重ねる
3. Lighthouseで継続的に計測
4. ボトルネック特定ツール（React DevTools Profiler）の活用

### 中リスク項目

#### リスク4: 実装時間の超過
**内容**: 推定時間を大幅に超過

**影響度**: 中
**発生確率**: 中

**対策**:
1. 優先度の高いフェーズから実施
2. 週次で進捗確認
3. 必要に応じて範囲を調整
4. ペアプログラミングで効率化

#### リスク5: チーム間の調整コスト
**内容**: 複数人で作業する場合の調整コスト

**影響度**: 低
**発生確率**: 中

**対策**:
1. 明確なモジュール分割で並行作業を可能に
2. コードレビュープロセスの確立
3. 定期的なミーティング
4. ドキュメントの充実

---

## 成功指標（KPI）

### コード品質指標

| 指標 | 現在 | 目標 | 測定方法 |
|-----|-----|-----|---------|
| 最大ファイルサイズ | 1,428行 | <500行 | `wc -l` |
| 平均コンポーネントサイズ | 200-300行 | <200行 | `wc -l` |
| 重複コード率 | 15-20% | <5% | SonarQube/ESLint |
| TypeScript strictエラー | 0 | 0 | `tsc --noEmit` |
| テストカバレッジ | ~20% | >60% | Jest/Vitest |

### パフォーマンス指標

| 指標 | 現在（推定） | 目標 | 測定方法 |
|-----|------------|-----|---------|
| Lighthouse Performance Score | 60-70 | >90 | Lighthouse CI |
| LCP | 3.5s | <2.0s | Chrome DevTools |
| FID | 150ms | <100ms | Chrome DevTools |
| TTI | 4.5s | <3.0s | Chrome DevTools |
| バンドルサイズ | 800KB | <500KB | webpack-bundle-analyzer |

### ビジネス指標

| 指標 | 現在 | 目標 | 測定方法 |
|-----|-----|-----|---------|
| ページ読み込み離脱率 | - | 5%削減 | Google Analytics |
| フォーム完了率 | - | 10%向上 | Google Analytics |
| ユーザー満足度 | - | 4.5/5.0 | ユーザーアンケート |

---

## 付録

### A. 推奨ツール

#### 開発ツール
- **VS Code Extensions**:
  - ESLint
  - TypeScript Error Lens
  - Import Cost（バンドルサイズ可視化）
  - Bundle Size（インポートサイズ表示）

#### 分析ツール
- **Lighthouse CI**: 継続的なパフォーマンス計測
- **webpack-bundle-analyzer**: バンドル分析
- **React DevTools Profiler**: レンダリング分析
- **SonarQube**: コード品質分析

#### テストツール
- **Vitest**: ユニットテスト
- **Playwright**: E2Eテスト
- **React Testing Library**: コンポーネントテスト

### B. 参考リソース

#### 公式ドキュメント
- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)
- [Supabase Performance Tips](https://supabase.com/docs/guides/performance)

#### ベストプラクティス
- [Clean Code TypeScript](https://github.com/labs42io/clean-code-typescript)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
- [Monorepo Best Practices](https://monorepo.tools/)

### C. チェックリスト

#### フェーズ1完了チェックリスト
- [ ] 新しい型ファイルが作成されている
- [ ] すべてのインポートが新しいパスに更新されている
- [ ] TypeScriptコンパイルエラーがない
- [ ] 既存テストがすべてパスする
- [ ] ドキュメントが更新されている

#### フェーズ2完了チェックリスト
- [ ] teamモジュールが機能別に分割されている
- [ ] 巨大コンポーネントが分割されている
- [ ] 共通コンポーネントが抽出されている
- [ ] カスタムフックが作成されている
- [ ] テストが追加されている

#### フェーズ3完了チェックリスト
- [ ] 共通フォームコンポーネントが作成されている
- [ ] 大規模フォームが分割されている
- [ ] ImageUploaderが統合されている
- [ ] バリデーションロジックが分離されている
- [ ] テストが追加されている

#### フェーズ4完了チェックリスト
- [ ] パフォーマンスベースラインが計測されている
- [ ] Server Componentsが活用されている
- [ ] React.memoが適用されている
- [ ] 動的インポートが実装されている
- [ ] 画像が最適化されている
- [ ] パフォーマンス目標が達成されている

---

## まとめ

このリファクタリング計画は、Swim Hubアプリケーションの持続可能な成長を支えるための包括的な改善提案です。

### 重要なポイント

1. **段階的な実施**: 一度にすべてを変更せず、フェーズごとに確実に進める
2. **テスト駆動**: 各フェーズでテストを実施し、既存機能を保護
3. **パフォーマンス重視**: ユーザー体験に直結するパフォーマンス改善を優先
4. **保守性の向上**: 将来の開発効率を高めるコード構造

### 期待される効果

- **開発速度**: 新機能開発が30-40%高速化
- **バグ削減**: コードの可読性向上により、バグが20-30%削減
- **パフォーマンス**: ページ読み込みが40%高速化
- **保守性**: コードレビュー時間が50%削減

### 次のステップ

1. このドキュメントをチームで確認
2. 優先フェーズの決定
3. 実装スケジュールの確定
4. フェーズ1の実装開始

---

**作成者**: Claude Code
**最終更新**: 2026-01-21
**バージョン**: 1.0
**ステータス**: レビュー待ち
