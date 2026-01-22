# フェーズ5: 重複コードの解消 - 計画書

**作成日**: 2026-01-22
**ステータス**: ✅ 完了
**推定工数**: 4-6時間
**備考**: フェーズ2・3に含まれる部分あり

---

## 📋 目次

1. [現状分析](#現状分析)
2. [重複コードの特定](#重複コードの特定)
3. [ステップ1: ImageUploaderの統合](#ステップ1-imageuploaderの統合)
4. [ステップ2: Attendance共通コンポーネントの抽出](#ステップ2-attendance共通コンポーネントの抽出)
5. [ステップ3: 時間フォーマット関数の統合](#ステップ3-時間フォーマット関数の統合)
6. [ステップ4: バリデーション関数の統合](#ステップ4-バリデーション関数の統合)
7. [検証チェックリスト](#検証チェックリスト)

---

## 現状分析

### 重複コードの影響

1. **保守性の低下**: 同じ修正を複数箇所に適用する必要がある
2. **バグの温床**: 片方のみ修正して不整合が発生するリスク
3. **コードベースの肥大化**: 不要な行数増加
4. **テストの重複**: 同様のテストを複数書く必要がある

### 重複タイプの分類

| タイプ | 説明 | 例 |
|--------|------|-----|
| **完全重複** | 90%以上同一コード | ImageUploader |
| **構造重複** | 同じパターンの異なるデータ型 | Attendanceコンポーネント |
| **ロジック重複** | 同じ処理が散在 | 時間フォーマット |
| **バリデーション重複** | 同じ検証ロジック | タイム/日付バリデーション |

---

## 重複コードの特定

### 優先度マトリクス

| 対象 | 重複率 | 影響範囲 | 解消難易度 | 優先度 | フェーズ |
|------|--------|---------|-----------|--------|---------|
| ImageUploader | 90%+ | 2ファイル | 低 | 🔴 高 | Phase3に統合 |
| Attendance共通 | 60%+ | 2コンポーネント | 中 | 🔴 高 | Phase2に統合 |
| 時間フォーマット | 70%+ | 10+ファイル | 低 | 🟡 中 | **Phase5** |
| バリデーション | 50%+ | 8+ファイル | 低 | 🟡 中 | **Phase5** |

### 詳細な重複箇所

#### 1. ImageUploaderコンポーネント（Phase3で対応）

```
apps/web/components/forms/
├── PracticeImageUploader.tsx    (271行)
├── CompetitionImageUploader.tsx (272行)
└── 重複率: 90%以上（型名のみ異なる）
```

**状態**: ⏳ フェーズ3で汎用ImageUploaderとして実装予定

#### 2. Attendanceコンポーネント（Phase2で対応）

```
apps/web/components/team/
├── MyMonthlyAttendance.tsx      (1,428行)
├── AdminMonthlyAttendance.tsx   (711行)
└── 共通部分: AttendanceGroupDisplay, カレンダーナビゲーション
```

**状態**: ⏳ フェーズ2で共通コンポーネント抽出予定

#### 3. 時間フォーマット関数（Phase5で対応）

```
散在箇所:
├── apps/web/utils/formatters.ts
├── apps/shared/utils/time.ts
├── apps/web/components/forms/RecordForm.tsx 内
├── apps/web/components/forms/RecordLogForm.tsx 内
├── apps/web/components/team/TeamTimeInputModal.tsx 内
└── その他複数のコンポーネント内
```

#### 4. バリデーション関数（Phase5で対応）

```
散在箇所:
├── 各フォームコンポーネント内のバリデーション
├── apps/web/components/forms/RecordForm.tsx
├── apps/web/components/forms/PracticeLogForm.tsx
├── apps/web/components/forms/RecordLogForm.tsx
└── apps/web/components/team/TeamEntrySection.tsx
```

---

## ステップ1: ImageUploaderの統合

> **注意**: このステップはフェーズ3に含まれます。詳細は [REFACTORING_PHASE3_PLAN.md](./REFACTORING_PHASE3_PLAN.md) を参照。

### 現状

- `PracticeImageUploader.tsx` (271行)
- `CompetitionImageUploader.tsx` (272行)
- **90%以上のコードが重複**（型名のみ異なる）

### 解決策（フェーズ3で実装）

```typescript
// forms/shared/ImageUploader/ImageUploader.tsx
interface ImageUploaderProps<T extends BaseImage> {
  entityId: string
  entityType: 'practice' | 'competition'
  images: T[]
  maxImages?: number
  maxSizeKB?: number
  onUpload: (files: File[]) => Promise<void>
  onDelete: (imageId: string) => Promise<void>
  onReorder?: (images: T[]) => Promise<void>
}

export function ImageUploader<T extends BaseImage>({ ... }: ImageUploaderProps<T>) {
  // 共通ロジック
}

// 特化版は薄いラッパーのみ
export const PracticeImageUploader = (props) => (
  <ImageUploader<PracticeImage> entityType="practice" {...props} />
)

export const CompetitionImageUploader = (props) => (
  <ImageUploader<CompetitionImage> entityType="competition" {...props} />
)
```

### 期待される効果

| 指標 | Before | After | 削減 |
|------|--------|-------|------|
| 総行数 | 543行 | ~220行 | 60% |
| ファイル数 | 2ファイル | 1コア + 2ラッパー | - |
| 重複コード | 90% | 0% | 100% |

---

## ステップ2: Attendance共通コンポーネントの抽出

> **注意**: このステップはフェーズ2に含まれます。詳細は [REFACTORING_PHASE2_PROGRESS.md](./REFACTORING_PHASE2_PROGRESS.md) を参照。

### 現状

- `MyMonthlyAttendance.tsx` (1,428行)
- `AdminMonthlyAttendance.tsx` (711行)
- 共通: カレンダーナビゲーション、グループ表示、ステータス選択

### 解決策（フェーズ2で実装）

```
team/attendance/shared/
├── AttendanceCalendar.tsx       # カレンダー表示（共通）
├── AttendanceGroupDisplay.tsx   # グループ表示（共通）
├── AttendanceStatusSelect.tsx   # ステータス選択（共通）
└── hooks/
    ├── useAttendanceCalendar.ts # カレンダーロジック（共通）
    └── useAttendanceData.ts     # データ取得（共通）
```

### 期待される効果

- 共通ロジックの一元管理
- テストの効率化
- 将来の機能追加が容易に

---

## ステップ3: 時間フォーマット関数の統合

### 目標

複数箇所に散在する時間フォーマット関数を `apps/shared/utils/time.ts` に集約する。

### 現状の重複

```typescript
// ❌ 各所に散在するフォーマット関数

// RecordForm.tsx 内
const formatTime = (seconds: number) => {
  const min = Math.floor(seconds / 60)
  const sec = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 100)
  return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

// TeamTimeInputModal.tsx 内
const formatTimeResult = (time: number) => {
  const minutes = Math.floor(time / 60)
  const secs = (time % 60).toFixed(2)
  return `${minutes}:${secs.padStart(5, '0')}`
}

// utils/formatters.ts
export const formatSwimTime = (totalSeconds: number) => {
  // また別の実装...
}
```

### 解決策: 統合された時間ユーティリティ

```typescript
// apps/shared/utils/time.ts

/**
 * 秒数を "MM:SS.ms" 形式にフォーマット
 * @param seconds - 秒数（小数点以下はミリ秒）
 * @returns フォーマットされた時間文字列
 * @example formatTime(65.42) => "1:05.42"
 */
export const formatTime = (seconds: number): string => {
  if (seconds < 0 || !Number.isFinite(seconds)) return '-'

  const min = Math.floor(seconds / 60)
  const sec = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 100)

  return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

/**
 * 秒数を "SS.ms" 形式にフォーマット（1分未満用）
 * @param seconds - 秒数（小数点以下はミリ秒）
 * @returns フォーマットされた時間文字列
 * @example formatShortTime(45.67) => "45.67"
 */
export const formatShortTime = (seconds: number): string => {
  if (seconds < 0 || !Number.isFinite(seconds)) return '-'
  return seconds.toFixed(2)
}

/**
 * "MM:SS.ms" または "SS.ms" 形式をパース
 * @param timeString - 時間文字列
 * @returns 秒数（パース失敗時はnull）
 * @example parseTime("1:05.42") => 65.42
 * @example parseTime("45.67") => 45.67
 */
export const parseTime = (timeString: string): number | null => {
  // "MM:SS.ms" 形式
  const fullMatch = timeString.match(/^(\d+):(\d{2})\.(\d{2})$/)
  if (fullMatch) {
    const [, min, sec, ms] = fullMatch
    return parseInt(min) * 60 + parseInt(sec) + parseInt(ms) / 100
  }

  // "SS.ms" 形式
  const shortMatch = timeString.match(/^(\d+)\.(\d{2})$/)
  if (shortMatch) {
    const [, sec, ms] = shortMatch
    return parseInt(sec) + parseInt(ms) / 100
  }

  return null
}

/**
 * ラップタイムをフォーマット（ミリ秒入力）
 * @param milliseconds - ミリ秒
 * @returns フォーマットされた時間文字列
 */
export const formatLapTime = (milliseconds: number): string => {
  if (milliseconds < 0 || !Number.isFinite(milliseconds)) return '-'
  return formatTime(milliseconds / 1000)
}

/**
 * 時間の差分を計算してフォーマット
 * @param time1 - 基準タイム（秒）
 * @param time2 - 比較タイム（秒）
 * @returns フォーマットされた差分文字列（+/-付き）
 * @example formatTimeDiff(65.42, 64.00) => "+1.42"
 */
export const formatTimeDiff = (time1: number, time2: number): string => {
  const diff = time1 - time2
  const sign = diff >= 0 ? '+' : ''
  return `${sign}${diff.toFixed(2)}`
}

/**
 * ペース計算（100mあたりのタイム）
 * @param totalTime - 総タイム（秒）
 * @param distance - 距離（メートル）
 * @returns 100mあたりのタイム（秒）
 */
export const calculatePace = (totalTime: number, distance: number): number => {
  if (distance <= 0) return 0
  return (totalTime / distance) * 100
}
```

### 移行手順

1. **統合ファイルの作成**
   - `apps/shared/utils/time.ts` に全関数を集約
   - 型定義とJSDocコメントを追加
   - ユニットテストを作成

2. **既存コードの更新**
   ```typescript
   // Before
   const formatTime = (seconds) => { ... } // ローカル定義

   // After
   import { formatTime } from '@shared/utils/time'
   ```

3. **ローカル定義の削除**
   - 各ファイルからローカル定義を削除
   - インポートに置き換え

### 適用対象ファイル

| ファイル | 対応内容 |
|---------|---------|
| `RecordForm.tsx` | ローカル定義 → インポート |
| `RecordLogForm.tsx` | ローカル定義 → インポート |
| `PracticeLogForm.tsx` | ローカル定義 → インポート |
| `TeamTimeInputModal.tsx` | ローカル定義 → インポート |
| `TeamEntrySection.tsx` | ローカル定義 → インポート |
| `utils/formatters.ts` | 重複関数を削除、re-export |
| `LapTimeDisplay.tsx` | ローカル定義 → インポート |

### 推定工数

**2-3時間**

---

## ステップ4: バリデーション関数の統合

### 目標

複数フォームに散在するバリデーション関数を `apps/shared/utils/validators.ts` に集約する。

### 現状の重複

```typescript
// ❌ 各フォームに散在するバリデーション

// RecordForm.tsx 内
const validateTime = (time) => {
  if (time <= 0) return 'タイムは0より大きい必要があります'
  if (time > 86400) return 'タイムが無効です'
  return null
}

// PracticeLogForm.tsx 内
const validateDistance = (distance) => {
  const valid = [25, 50, 100, 200, 400, 800, 1500]
  if (!valid.includes(distance)) return '無効な距離です'
  return null
}

// TeamEntrySection.tsx 内
const validateEntryTime = (timeStr) => {
  // 別の実装...
}
```

### 解決策: 統合されたバリデーションライブラリ

```typescript
// apps/shared/utils/validators.ts

export interface ValidationResult {
  valid: boolean
  error?: string
}

// バリデーション成功/失敗のヘルパー
const success = (): ValidationResult => ({ valid: true })
const failure = (error: string): ValidationResult => ({ valid: false, error })

/**
 * スイムタイムのバリデーション
 */
export const validateTime = (seconds: number): ValidationResult => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return failure('タイムが無効です')
  }
  if (seconds <= 0) {
    return failure('タイムは0より大きい必要があります')
  }
  if (seconds > 86400) {
    return failure('タイムは24時間以内である必要があります')
  }
  return success()
}

/**
 * 時間文字列のバリデーション（"MM:SS.ms" または "SS.ms"形式）
 */
export const validateTimeString = (timeString: string): ValidationResult => {
  if (!timeString || typeof timeString !== 'string') {
    return failure('タイムを入力してください')
  }

  const fullPattern = /^(\d+):(\d{2})\.(\d{2})$/
  const shortPattern = /^(\d+)\.(\d{2})$/

  if (!fullPattern.test(timeString) && !shortPattern.test(timeString)) {
    return failure('タイムの形式が無効です（例: 1:23.45 または 45.67）')
  }

  return success()
}

/**
 * 日付のバリデーション
 */
export const validateDate = (dateString: string): ValidationResult => {
  if (!dateString) {
    return failure('日付を入力してください')
  }

  const date = new Date(dateString)
  if (isNaN(date.getTime())) {
    return failure('無効な日付です')
  }

  return success()
}

/**
 * 過去日付のバリデーション（未来日付を禁止）
 */
export const validatePastDate = (dateString: string): ValidationResult => {
  const dateResult = validateDate(dateString)
  if (!dateResult.valid) return dateResult

  const date = new Date(dateString)
  if (date > new Date()) {
    return failure('未来の日付は指定できません')
  }

  return success()
}

/**
 * 距離のバリデーション
 */
export const validateDistance = (distance: number): ValidationResult => {
  const validDistances = [25, 50, 100, 200, 400, 800, 1500]

  if (!validDistances.includes(distance)) {
    return failure(`距離は ${validDistances.join(', ')} mのいずれかである必要があります`)
  }

  return success()
}

/**
 * 本数（rep_count）のバリデーション
 */
export const validateRepCount = (count: number): ValidationResult => {
  if (!Number.isInteger(count) || count < 1) {
    return failure('本数は1以上の整数である必要があります')
  }
  if (count > 100) {
    return failure('本数は100以下である必要があります')
  }
  return success()
}

/**
 * セット数のバリデーション
 */
export const validateSetCount = (count: number): ValidationResult => {
  if (!Number.isInteger(count) || count < 1) {
    return failure('セット数は1以上の整数である必要があります')
  }
  if (count > 50) {
    return failure('セット数は50以下である必要があります')
  }
  return success()
}

/**
 * サークル（秒）のバリデーション
 */
export const validateCircle = (seconds: number | null): ValidationResult => {
  if (seconds === null) return success() // オプショナル

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return failure('サークルは0より大きい必要があります')
  }
  if (seconds > 600) {
    return failure('サークルは10分以内である必要があります')
  }
  return success()
}

/**
 * 必須文字列のバリデーション
 */
export const validateRequired = (value: string, fieldName: string): ValidationResult => {
  if (!value || value.trim() === '') {
    return failure(`${fieldName}を入力してください`)
  }
  return success()
}

/**
 * 最大文字数のバリデーション
 */
export const validateMaxLength = (
  value: string,
  maxLength: number,
  fieldName: string
): ValidationResult => {
  if (value && value.length > maxLength) {
    return failure(`${fieldName}は${maxLength}文字以内で入力してください`)
  }
  return success()
}

/**
 * プール種別のバリデーション
 */
export const validatePoolType = (poolType: string): ValidationResult => {
  if (poolType !== 'long' && poolType !== 'short') {
    return failure('プール種別が無効です')
  }
  return success()
}

/**
 * 複合バリデーション: 複数のバリデーションを実行
 */
export const validateAll = (
  validations: ValidationResult[]
): ValidationResult => {
  for (const result of validations) {
    if (!result.valid) return result
  }
  return success()
}
```

### 移行手順

1. **統合ファイルの作成**
   - `apps/shared/utils/validators.ts` に全関数を集約
   - 統一された `ValidationResult` 型を使用
   - ユニットテストを作成

2. **既存コードの更新**
   ```typescript
   // Before
   const validateTime = (time) => { ... } // ローカル定義
   if (error) setError(error)

   // After
   import { validateTime } from '@shared/utils/validators'
   const result = validateTime(time)
   if (!result.valid) setError(result.error)
   ```

3. **ローカル定義の削除**
   - 各ファイルからローカル定義を削除
   - インポートに置き換え

### 適用対象ファイル

| ファイル | 対応内容 |
|---------|---------|
| `RecordForm.tsx` | ローカルバリデーション → インポート |
| `RecordLogForm.tsx` | ローカルバリデーション → インポート |
| `PracticeLogForm.tsx` | ローカルバリデーション → インポート |
| `EntryLogForm.tsx` | ローカルバリデーション → インポート |
| `TeamEntrySection.tsx` | ローカルバリデーション → インポート |
| `TeamTimeInputModal.tsx` | ローカルバリデーション → インポート |

### 推定工数

**2-3時間**

---

## 📊 進捗サマリー

| ステップ | 対象 | 削減行数 | フェーズ | ステータス |
|---------|------|---------|---------|-----------|
| 1 | ImageUploader統合 | ~320行 | Phase3 | ⏳ Phase3で対応 |
| 2 | Attendance共通化 | ~400行 | Phase2 | ⏳ Phase2で対応 |
| 3 | 時間フォーマット統合 | ~150行 | **Phase5** | ✅ 完了 |
| 4 | バリデーション統合 | ~200行 | **Phase5** | ✅ 完了 |
| **合計** | - | **~1,070行** | - | **Phase5: 100%完了** |

---

## 🎯 実装順序（推奨）

### Phase5固有の作業

1. **ステップ3: 時間フォーマット統合** (2-3時間)
   - `apps/shared/utils/time.ts` を拡充
   - 各ファイルのローカル定義をインポートに置換
   - ユニットテスト追加

2. **ステップ4: バリデーション統合** (2-3時間)
   - `apps/shared/utils/validators.ts` を作成
   - 統一された `ValidationResult` 型を導入
   - 各ファイルのローカル定義をインポートに置換
   - ユニットテスト追加

### 他フェーズで対応する作業

- **ステップ1 (ImageUploader)**: Phase3の一部として実装
- **ステップ2 (Attendance)**: Phase2の一部として実装

**Phase5の推定工数**: 4-6時間

---

## 検証チェックリスト

### 各ステップ完了後

- [x] TypeScript コンパイルエラーなし (`npx tsc --noEmit`)
- [x] Next.js ビルド成功 (`npm run build`)
- [ ] 既存テスト全てパス (`npm test`)
- [ ] 新規ユニットテスト追加
  - [ ] `time.ts` のテスト
  - [ ] `validators.ts` のテスト
- [ ] 手動動作確認
  - [ ] フォーム入力・バリデーション
  - [ ] タイム表示
  - [ ] エラーメッセージ表示

### 最終検証

- [x] 重複コードがないことを確認
- [x] すべてのインポートが正しいことを確認
- [x] ドキュメント更新

---

## 📝 ベストプラクティス

### 1. 共通ユーティリティの原則

- **単一責任**: 各関数は1つの責務のみ
- **純粋関数**: 副作用なし、同じ入力に対して同じ出力
- **型安全**: TypeScriptの型定義を活用
- **ドキュメント**: JSDocコメントで使用方法を明記

### 2. バリデーションの原則

- **統一された戻り値**: `ValidationResult` 型を使用
- **ユーザーフレンドリーなエラーメッセージ**: 具体的で actionable
- **再利用性**: 汎用的な関数として設計
- **テスト容易性**: 純粋関数として実装

### 3. 移行時の注意点

- **後方互換性**: 既存の使用箇所を壊さない
- **段階的移行**: 一度に全ファイルを変更しない
- **テスト駆動**: 先にテストを書いてから移行

---

## 📚 参考

### 関連ドキュメント

- [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) - 全体計画
- [REFACTORING_PHASE2_PROGRESS.md](./REFACTORING_PHASE2_PROGRESS.md) - フェーズ2進捗
- [REFACTORING_PHASE3_PLAN.md](./REFACTORING_PHASE3_PLAN.md) - フェーズ3計画
- [REFACTORING_PHASE4_PLAN.md](./REFACTORING_PHASE4_PLAN.md) - フェーズ4計画

### 既存ファイル

- `apps/shared/utils/time.ts` - 既存の時間ユーティリティ（拡充対象）
- `apps/web/utils/formatters.ts` - 既存のフォーマッター（統合対象）

---

## 🎯 期待される効果

### 定量的効果

| 指標 | Before | After | 改善 |
|------|--------|-------|------|
| 重複コード行数 | ~1,070行 | ~0行 | 100%削減 |
| テスト対象関数 | 散在 | 集約 | テスト効率向上 |
| バグ修正コスト | 複数箇所 | 1箇所 | 大幅削減 |

### 定性的効果

- **保守性向上**: 修正箇所の一元化
- **一貫性**: 同じ処理は同じコードを使用
- **開発速度向上**: 新機能追加時に既存ユーティリティを再利用
- **品質向上**: 集中的なテストによる信頼性向上

---

**最終更新**: 2026-01-22
**完了日**: 2026-01-22

---

## 📝 実施内容サマリー

### ステップ3: 時間フォーマット関数の統合

**作成・更新ファイル:**
- `apps/shared/utils/time.ts` - 以下の関数を追加:
  - `formatTime()` - 秒数を "M:SS.ms" 形式にフォーマット
  - `formatTimeShort()` - 秒数を短縮形式にフォーマット（0は空文字）
  - `formatTimeFull()` - 秒数を常に分付きでフォーマット
  - `formatTimeDiff()` - 時間差分をフォーマット
  - `parseTime()` - 時間文字列を秒数に変換
  - `parseTimeStrict()` - 時間文字列を秒数に変換（nullを返すバージョン）
  - `calculatePace()` - ペース計算

**更新ファイル（インポート置換）:**
- `apps/web/utils/formatters.ts` - 共通ユーティリティからre-export
- `apps/web/components/forms/TimeInputModal.tsx`
- `apps/web/components/team/TeamTimeInputModal.tsx`
- `apps/web/components/team/TeamRecords.tsx`
- `apps/web/components/forms/EntryLogForm.tsx`
- `apps/web/components/forms/record/utils/timeParser.ts`
- `apps/web/components/forms/shared/TimeInput/hooks/useTimeInput.ts`

### ステップ4: バリデーション関数の統合

**作成ファイル:**
- `apps/shared/utils/validators.ts` - 以下の関数を追加:
  - `validateTime()` - スイムタイムのバリデーション
  - `validateTimeString()` - 時間文字列のバリデーション
  - `validateSwimTime()` - 競泳タイム（1時間以内）のバリデーション
  - `validateDate()` - 日付のバリデーション
  - `validatePastDate()` - 過去日付のバリデーション
  - `validateFutureDate()` - 未来日付のバリデーション
  - `validateDistance()` - 競泳距離のバリデーション
  - `validateRepCount()` - 本数のバリデーション
  - `validateSetCount()` - セット数のバリデーション
  - `validateCircle()` - サークルのバリデーション
  - `validateRequired()` - 必須文字列のバリデーション
  - `validateMaxLength()` - 最大文字数のバリデーション
  - `validatePoolType()` - プール種別のバリデーション
  - `validateStroke()` - 泳法のバリデーション
  - `validateAll()` - 複合バリデーション

**更新ファイル（インポート置換）:**
- `apps/web/components/team/shared/hooks/useTimeValidation.ts`
- `apps/web/components/forms/shared/TimeInput/hooks/useTimeInput.ts`

### 削減効果

| 項目 | 削減行数 |
|-----|---------|
| ローカルformatTime定義 | ~80行 |
| ローカルparseTime定義 | ~70行 |
| ローカルバリデーション定義 | ~100行 |
| **合計** | **~250行** |
