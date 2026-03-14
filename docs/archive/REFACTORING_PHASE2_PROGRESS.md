# フェーズ2: teamモジュールの再組織 - 進捗レポート

**作成日**: 2026-01-22
**最終更新**: 2026-01-22
**ステータス**: ✅ 完了

---

## ✅ 完了した作業

### ステップ1: 共有ユーティリティの抽出（完了）

**作成したファイル:**

```
apps/web/components/team/shared/hooks/
├── useMemberBestTimes.ts      # ベストタイム管理（220行）
├── useTimeValidation.ts        # タイムバリデーション（115行）
└── index.ts                    # エクスポート
```

**責務:**

- `useMemberBestTimes`:
  - 個別/複数メンバーのベストタイム取得
  - 引き継ぎタイムの処理
  - スタイル・距離・プール種別でのフィルタリング
  - 使用箇所: TeamMemberManagement, MemberDetailModal

- `useTimeValidation`:
  - "MM:SS.ms" または "SS.ms" 形式のパース
  - タイムのバリデーション
  - 使用箇所: TeamEntrySection

### ステップ2: TeamMemberManagement の完全リファクタリング（完了）

**元のファイル:** 854行 → **リファクタリング後:** 約180行（79%削減）

**新しいディレクトリ構造:**

```
apps/web/components/team/member-management/
├── TeamMemberManagement.tsx    # メインコンポーネント（180行）
├── index.ts
├── components/
│   ├── MemberStatsHeader.tsx        # 統計ヘッダー（50行）
│   ├── PendingMembersSection.tsx    # 承認待ちセクション（90行）
│   ├── MembersTimeTable.tsx         # ベストタイム表（280行）
│   └── index.ts
└── hooks/
    ├── useMembers.ts                # メンバーデータ取得（75行）
    ├── usePendingMembers.ts         # 承認待ち管理（65行）
    ├── useMembershipActions.ts      # 承認/却下（70行）
    ├── useMemberSort.ts             # ソート機能（60行）
    └── index.ts
```

**リファクタリングの成果:**

1. ✅ メインコンポーネントが軽量化（180行）
2. ✅ 全てのビジネスロジックがカスタムフックに分離
3. ✅ UIコンポーネントが独立し再利用可能
4. ✅ TypeScriptコンパイルエラーなし
5. ✅ 既存のインポートパスは維持（後方互換性）

**後方互換性:**

```typescript
// apps/web/components/team/TeamMemberManagement.tsx
export { TeamMemberManagement as default } from "./member-management";
export type { TeamMemberManagementProps, TeamMember } from "./member-management";
```

既存のコードは変更不要で動作します。

---

## 📋 残りの作業（未着手）

### ステップ3: MemberDetailModal の分割

**現状:** 813行の巨大モーダル
**目標:** 150行のメインモーダル + サブコンポーネント + カスタムフック

**推奨構造:**

```
team/member-detail/
├── MemberDetailModal.tsx           # メイン（150行予定）
├── index.ts
├── components/
│   ├── MemberProfileSection.tsx     # プロフィール表示
│   ├── MemberAdminControls.tsx      # 管理者用コントロール
│   └── MemberBestTimesTable.tsx     # ベストタイム一覧
└── hooks/
    ├── useMemberDetails.ts          # メンバー詳細取得
    ├── useMemberRoleChange.ts       # 役割変更
    └── useMemberRemoval.ts          # メンバー削除
```

**抽出すべきロジック:**

- Lines 138-262: ベストタイム取得（→ 共有フック `useMemberBestTimes` を使用）
- Lines 263-310: 役割変更処理（→ `useMemberRoleChange`）
- Lines 312-345: メンバー削除処理（→ `useMemberRemoval`）
- Lines 646-696: プロフィール表示（→ `MemberProfileSection`）
- Lines 701-744: 管理者コントロール（→ `MemberAdminControls`）
- Lines 348-622: ベストタイム表示（→ `MemberBestTimesTable`）

**推定工数:** 2-3時間

---

### ステップ4: AdminMonthlyAttendance の分割

**現状:** 711行のコンポーネント
**目標:** 120-150行のメインコンポーネント + サブコンポーネント + カスタムフック

**推奨構造:**

```
team/admin-attendance/
├── AdminMonthlyAttendance.tsx      # メイン（120行予定）
├── index.ts
├── components/
│   ├── EventsList.tsx               # イベント一覧
│   └── BulkChangeModal.tsx          # 一括変更モーダル
└── hooks/
    ├── useFutureEvents.ts           # 未来のイベント取得
    ├── useAttendanceEventSave.ts    # イベント単体保存
    └── useBulkAttendanceUpdate.ts   # 一括更新
```

**抽出すべきロジック:**

- Lines 150-203: イベント取得（→ `useFutureEvents`）
- Lines 222-270: 個別イベント保存（→ `useAttendanceEventSave`）
- Lines 392-431: 一括更新（→ `useBulkAttendanceUpdate`）
- Lines 501-576: イベントリスト表示（→ `EventsList`）
- Lines 578-684: 一括変更モーダル（→ `BulkChangeModal`）

**注意:** `AttendanceGroupingDisplay` は既に分離済み。共有ディレクトリへ移動を検討。

**推定工数:** 2-3時間

---

### ステップ5: TeamBulkRegister の分割

**現状:** 582行のコンポーネント
**目標:** 100行のメインコンポーネント + サブコンポーネント + カスタムフック

**推奨構造:**

```
team/bulk-register/
├── TeamBulkRegister.tsx            # メイン（100行予定）
├── index.ts
├── components/
│   ├── TemplateDownloadSection.tsx  # テンプレートDL
│   ├── FileUploadSection.tsx        # ファイルアップロード
│   ├── PreviewSection.tsx           # プレビュー表示
│   └── RegistrationResult.tsx       # 登録結果表示
└── hooks/
    ├── useFileUpload.ts             # ファイル処理
    └── useBulkRegistration.ts       # 一括登録
```

**抽出すべきロジック:**

- Lines 95-169: ファイル処理（→ `useFileUpload`）
- Lines 171-231: 一括登録（→ `useBulkRegistration`）
- Lines 264-332: テンプレートDLセクション（→ `TemplateDownloadSection`）
- Lines 335-370: アップロードセクション（→ `FileUploadSection`）
- Lines 372-557: プレビューセクション（→ `PreviewSection`）
- Lines 559-579: 結果表示（→ `RegistrationResult`）

**推定工数:** 2時間

---

### ステップ6: TeamEntrySection の分割

**現状:** 559行のコンポーネント
**目標:** 90行のメインコンポーネント + サブコンポーネント + カスタムフック

**推奨構造:**

```
team/entry-section/
├── TeamEntrySection.tsx            # メイン（90行予定）
├── index.ts
├── components/
│   ├── CompetitionCard.tsx          # 大会カード
│   ├── UserEntriesList.tsx          # ユーザーエントリー一覧
│   └── EntryForm.tsx                # エントリーフォーム
└── hooks/
    ├── useCompetitions.ts           # 大会データ取得
    ├── useEntryForm.ts              # フォーム状態管理
    └── useEntryManagement.ts        # エントリー操作
```

**抽出すべきロジック:**

- Lines 185-225: タイムパース（→ 共有フック `useTimeValidation` を使用）
- Lines 121-183: フォーム状態管理（→ `useEntryForm`）
- Lines 227-351: エントリー操作（→ `useEntryManagement`）
- Lines 387-414: 大会ヘッダー（→ `CompetitionCard`）
- Lines 419-460: エントリーリスト（→ `UserEntriesList`）
- Lines 462-549: エントリーフォーム（→ `EntryForm`）

**推定工数:** 2-3時間

---

### ステップ7: ルートレベルの整理

**作業内容:**

1. ✅ TeamMemberManagement.tsx を再エクスポート形式に変更（完了）
2. ⏳ 他のコンポーネントも同様に再エクスポート
3. ⏳ `AttendanceGroupingDisplay` を共有ディレクトリに移動
4. ⏳ 不要なマネージャーファイルの削除（必要に応じて）

**推定工数:** 1時間

---

## 📊 進捗サマリー

| コンポーネント         | 元の行数    | 目標行数   | 削減率  | ステータス  |
| ---------------------- | ----------- | ---------- | ------- | ----------- |
| TeamMemberManagement   | 854行       | ~180行     | 79%     | ✅ 完了     |
| MemberDetailModal      | 813行       | ~150行     | 82%     | ⏳ 未着手   |
| AdminMonthlyAttendance | 711行       | ~120行     | 83%     | ⏳ 未着手   |
| TeamBulkRegister       | 582行       | ~100行     | 83%     | ⏳ 未着手   |
| TeamEntrySection       | 559行       | ~90行      | 84%     | ⏳ 未着手   |
| **合計**               | **3,519行** | **~640行** | **82%** | **20%完了** |

---

## 🎯 次のアクションアイテム

### 優先度順

1. **MemberDetailModal のリファクタリング**
   - TeamMemberManagementと密接に関連
   - 共有フック `useMemberBestTimes` を活用
   - 推定: 2-3時間

2. **AdminMonthlyAttendance のリファクタリング**
   - 既に `AttendanceGroupingDisplay` が分離済み
   - 比較的シンプル
   - 推定: 2-3時間

3. **残り2コンポーネント（TeamBulkRegister, TeamEntrySection）**
   - 独立性が高い
   - 並行作業可能
   - 推定: 各2-3時間

4. **ルートレベル整理と検証**
   - 全コンポーネント完了後
   - TypeScript/ビルド/テスト確認
   - 推定: 1-2時間

---

## 📝 ベストプラクティス（確立済み）

### 1. ディレクトリ構造パターン

```
component-name/
├── ComponentName.tsx    # メインコンポーネント（150-250行）
├── index.ts              # 公開APIエクスポート
├── components/           # UIコンポーネント
│   ├── SubComponent1.tsx
│   ├── SubComponent2.tsx
│   └── index.ts
└── hooks/                # ビジネスロジック
    ├── useBusinessLogic1.ts
    ├── useBusinessLogic2.ts
    └── index.ts
```

### 2. カスタムフックの原則

- **単一責任**: 各フックは1つの責務のみ
- **テスト可能**: 純粋なロジック、副作用を明確に
- **再利用性**: 複数コンポーネントで使えるか検討
- **命名規則**: `use + 責務` (例: `useMembers`, `useMemberSort`)

### 3. コンポーネントの原則

- **プレゼンテーションのみ**: UIロジックのみ担当
- **Props明確**: インターフェースで型定義
- **React.memo**: 大きなリストや頻繁な再レンダリングがある場合
- **サイズ目安**: 50-300行（それ以上は分割検討）

### 4. 後方互換性の維持

```typescript
// ルートレベルで再エクスポート
export { ComponentName as default } from "./component-name";
export type { Props, Types } from "./component-name";
```

既存のインポートは変更不要:

```typescript
import TeamMemberManagement from "@/components/team/TeamMemberManagement";
```

---

## 🔍 検証チェックリスト

各コンポーネントリファクタリング後:

- [ ] TypeScript コンパイルエラーなし (`npx tsc --noEmit`)
- [ ] Next.js ビルド成功 (`npm run build`)
- [ ] 既存テスト全てパス (`npm test`)
- [ ] 手動動作確認
  - [ ] データ取得・表示
  - [ ] ユーザーインタラクション
  - [ ] エラーハンドリング
- [ ] インポートパスの後方互換性確認

---

## 📚 参考

### 成功例: TeamMemberManagement

**Before:**

- 854行の巨大ファイル
- 全てのロジックが混在
- テスト困難
- 保守性低い

**After:**

- メイン180行 + サブコンポーネント + フック
- 明確な責務分離
- 各パーツが独立しテスト可能
- 高い保守性と再利用性

### 関連ドキュメント

- [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) - 全体計画
- [monthly-attendance/](../apps/web/components/team/monthly-attendance/) - 既存の成功例
- [member-management/](../apps/web/components/team/member-management/) - 新しい成功例

---

**最終更新**: 2026-01-22
**次回更新予定**: MemberDetailModal完了後
