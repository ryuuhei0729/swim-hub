# フェーズ3: formsディレクトリの整理 - 計画書

**作成日**: 2026-01-22
**ステータス**: 📋 計画中

---

## 📋 目次

1. [現状分析](#現状分析)
2. [リファクタリング対象](#リファクタリング対象)
3. [ステップ1: 共通コンポーネントの作成](#ステップ1-共通コンポーネントの作成)
4. [ステップ2: RecordFormの分割](#ステップ2-recordformの分割)
5. [ステップ3: PracticeLogFormの分割](#ステップ3-practicelogformの分割)
6. [ステップ4: RecordLogFormの分割](#ステップ4-recordlogformの分割)
7. [ステップ5: ImageUploaderの統合](#ステップ5-imageuploaderの統合)
8. [検証チェックリスト](#検証チェックリスト)

---

## 現状分析

### ファイルサイズ一覧

```
apps/web/components/forms/
├── RecordForm.tsx              (865行) 🔴 分割必須
├── PracticeLogForm.tsx         (848行) 🔴 分割必須
├── RecordLogForm.tsx           (804行) 🔴 分割必須
├── EntryLogForm.tsx            (488行) 🟡 検討
├── CompetitionBasicForm.tsx    (373行) ✅ 許容範囲
├── TagInput.tsx                (342行) ✅ 許容範囲
├── PracticeBasicForm.tsx       (314行) ✅ 許容範囲
├── TagManagementModal.tsx      (303行) ✅ 許容範囲
├── PracticeForm.tsx            (281行) ✅ 許容範囲
├── CompetitionImageUploader    (272行) 🟡 重複コード
├── PracticeImageUploader       (271行) 🟡 重複コード
├── TimeInputModal.tsx          (243行) ✅ 許容範囲
├── TeamCreateForm.tsx          (190行) ✅ OK
├── LapTimeDisplay.tsx          (150行) ✅ OK
└── TeamJoinForm.tsx            (83行)  ✅ OK
```

**合計**: 5,827行

### 主要な問題点

1. **巨大フォームコンポーネント（800行超）**
   - RecordForm, PracticeLogForm, RecordLogForm
   - 複数の責務が混在（フォーム、バリデーション、ファイルアップロード、時間計算等）

2. **重複コード**
   - `PracticeImageUploader` と `CompetitionImageUploader` が90%重複

3. **テスト困難**
   - 巨大コンポーネントはユニットテストが困難

---

## リファクタリング対象

### 優先度順

| 対象              | 現在  | 目標   | 削減率 | 優先度 |
| ----------------- | ----- | ------ | ------ | ------ |
| RecordForm        | 865行 | ~150行 | 83%    | 🔴 高  |
| PracticeLogForm   | 848行 | ~150行 | 82%    | 🔴 高  |
| RecordLogForm     | 804行 | ~150行 | 81%    | 🔴 高  |
| ImageUploader統合 | 543行 | ~200行 | 63%    | 🟡 中  |
| EntryLogForm      | 488行 | ~120行 | 75%    | 🟡 中  |

---

## ステップ1: 共通コンポーネントの作成

### 目標

フォーム間で共通して使われるコンポーネントを抽出し、再利用可能にする。

### 新しいディレクトリ構造

```
apps/web/components/forms/
├── index.ts                    # 公開APIエクスポート
│
├── shared/                     # 共通コンポーネント
│   ├── index.ts
│   ├── TimeInput/              # 時間入力コンポーネント
│   │   ├── TimeInput.tsx       # 共通時間入力UI
│   │   ├── TimeInputModal.tsx  # モーダル版（既存を移動）
│   │   ├── LapTimeInput.tsx    # ラップタイム入力
│   │   └── hooks/
│   │       └── useTimeInput.ts # 時間入力ロジック
│   │
│   ├── ImageUploader/          # 画像アップロード（重複解消）
│   │   ├── ImageUploader.tsx   # 汎用画像アップローダー
│   │   ├── ImagePreview.tsx    # プレビュー表示
│   │   ├── ImageDragDrop.tsx   # ドラッグ&ドロップ
│   │   └── hooks/
│   │       └── useImageUpload.ts
│   │
│   ├── StyleSelect/            # 種目選択
│   │   ├── StyleSelect.tsx
│   │   └── hooks/
│   │       └── useStyleSelect.ts
│   │
│   └── TagManager/             # タグ管理（既存を移動・整理）
│       ├── TagInput.tsx
│       ├── TagManagementModal.tsx
│       └── hooks/
│           └── useTagManager.ts
│
├── record/                     # 記録フォーム
├── practice-log/               # 練習ログフォーム
├── record-log/                 # 記録ログフォーム
└── ... (既存の小規模フォーム)
```

### 抽出する共通ロジック

#### 1. 時間入力ロジック (`useTimeInput.ts`)

```typescript
// forms/shared/TimeInput/hooks/useTimeInput.ts
export const useTimeInput = () => {
  // MM:SS.ms 形式のパース
  const parseTime = (timeString: string): number | null => {
    const match = timeString.match(/^(\d+):(\d{2})\.(\d{2})$/);
    if (!match) return null;
    const [, min, sec, ms] = match;
    return parseInt(min) * 60 + parseInt(sec) + parseInt(ms) / 100;
  };

  // 秒数を MM:SS.ms 形式にフォーマット
  const formatTime = (seconds: number): string => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 100);
    return `${min}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  // バリデーション
  const validateTime = (seconds: number): boolean => {
    return seconds > 0 && seconds < 86400; // 24時間以内
  };

  return { parseTime, formatTime, validateTime };
};
```

#### 2. 画像アップロードロジック (`useImageUpload.ts`)

```typescript
// forms/shared/ImageUploader/hooks/useImageUpload.ts
interface UseImageUploadOptions {
  maxImages?: number;
  maxSizeKB?: number;
  onUpload: (files: File[]) => Promise<void>;
}

export const useImageUpload = ({
  maxImages = 10,
  maxSizeKB = 5120,
  onUpload,
}: UseImageUploadOptions) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): string | null => {
    if (file.size > maxSizeKB * 1024) {
      return `ファイルサイズは${maxSizeKB / 1024}MB以下にしてください`;
    }
    if (!file.type.startsWith("image/")) {
      return "画像ファイルのみアップロードできます";
    }
    return null;
  };

  const handleFiles = async (files: FileList | File[]) => {
    // バリデーション & アップロード処理
  };

  return { isDragging, isUploading, error, handleFiles, setIsDragging };
};
```

### 推定工数

**3-4時間**

---

## ステップ2: RecordFormの分割

### 現状分析

RecordForm.tsx (865行) の責務:

- 種目選択
- 日付・大会名入力
- タイム入力（複数セット対応）
- ラップタイム入力
- プール種別選択
- バリデーション
- 送信処理

### 新しい構造

```
forms/record/
├── RecordForm.tsx              # メインフォーム（150行）
├── RecordFormProvider.tsx      # フォーム状態管理
├── index.ts
├── components/
│   ├── RecordBasicInfo.tsx     # 基本情報（種目、日付、大会名）
│   ├── RecordTimeInput.tsx     # タイム入力
│   ├── RecordSetManager.tsx    # セット管理（複数タイム）
│   ├── RecordLapTimes.tsx      # ラップタイム入力
│   ├── RecordPoolType.tsx      # プール種別選択
│   └── index.ts
├── hooks/
│   ├── useRecordForm.ts        # フォーム状態管理
│   ├── useRecordValidation.ts  # バリデーション
│   ├── useRecordSubmit.ts      # 送信処理
│   └── index.ts
└── utils/
    ├── recordCalculations.ts   # 計算ロジック
    └── recordValidators.ts     # バリデータ
```

### コンポーネント詳細

#### RecordForm.tsx (メイン: ~150行)

```typescript
'use client'

import { RecordFormProvider } from './RecordFormProvider'
import { RecordBasicInfo } from './components/RecordBasicInfo'
import { RecordTimeInput } from './components/RecordTimeInput'
import { RecordSetManager } from './components/RecordSetManager'
import { RecordLapTimes } from './components/RecordLapTimes'
import { RecordPoolType } from './components/RecordPoolType'
import { useRecordFormContext } from './hooks/useRecordForm'

interface RecordFormProps {
  initialData?: Partial<Record>
  onSubmit: (data: RecordFormData) => Promise<void>
  onCancel: () => void
}

export const RecordForm = ({ initialData, onSubmit, onCancel }: RecordFormProps) => {
  return (
    <RecordFormProvider initialData={initialData}>
      <RecordFormContent onSubmit={onSubmit} onCancel={onCancel} />
    </RecordFormProvider>
  )
}

const RecordFormContent = ({ onSubmit, onCancel }) => {
  const { formState, validation, handleSubmit } = useRecordFormContext()

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <RecordBasicInfo />
      <RecordPoolType />
      <RecordTimeInput />
      <RecordSetManager />
      <RecordLapTimes />

      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={onCancel}>キャンセル</Button>
        <Button type="submit" disabled={!validation.isValid}>保存</Button>
      </div>
    </form>
  )
}
```

#### useRecordForm.ts (~200行)

```typescript
"use client";

import { createContext, useContext, useReducer } from "react";
import { useRecordValidation } from "./useRecordValidation";

interface RecordFormState {
  styleId: number | null;
  competitionDate: string;
  competitionName: string;
  timeResult: number | null;
  poolType: "long" | "short";
  sets: RecordSet[];
  lapTimes: number[];
  isRelaying: boolean;
  note: string;
}

type RecordFormAction =
  | { type: "SET_FIELD"; field: keyof RecordFormState; value: any }
  | { type: "ADD_SET" }
  | { type: "REMOVE_SET"; index: number }
  | { type: "UPDATE_SET"; index: number; data: Partial<RecordSet> }
  | { type: "SET_LAP_TIMES"; lapTimes: number[] }
  | { type: "RESET" };

const recordFormReducer = (state: RecordFormState, action: RecordFormAction): RecordFormState => {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.field]: action.value };
    case "ADD_SET":
      return { ...state, sets: [...state.sets, createEmptySet()] };
    // ... 他のアクション
  }
};

export const useRecordForm = (initialData?: Partial<RecordFormState>) => {
  const [formState, dispatch] = useReducer(recordFormReducer, {
    ...defaultState,
    ...initialData,
  });

  const validation = useRecordValidation(formState);

  return {
    formState,
    validation,
    setField: (field, value) => dispatch({ type: "SET_FIELD", field, value }),
    addSet: () => dispatch({ type: "ADD_SET" }),
    removeSet: (index) => dispatch({ type: "REMOVE_SET", index }),
    updateSet: (index, data) => dispatch({ type: "UPDATE_SET", index, data }),
    setLapTimes: (lapTimes) => dispatch({ type: "SET_LAP_TIMES", lapTimes }),
    reset: () => dispatch({ type: "RESET" }),
    handleSubmit: (onSubmit) => async (e) => {
      e.preventDefault();
      if (validation.isValid) {
        await onSubmit(formState);
      }
    },
  };
};
```

### 推定工数

**4-5時間**

---

## ステップ3: PracticeLogFormの分割

### 現状分析

PracticeLogForm.tsx (848行) の責務:

- 練習セット入力（種目、本数、セット数、距離、サークル）
- 複数セット管理
- タグ管理
- メモ入力
- バリデーション
- 送信処理

### 新しい構造

```
forms/practice-log/
├── PracticeLogForm.tsx         # メインフォーム（150行）
├── PracticeLogProvider.tsx     # フォーム状態管理
├── index.ts
├── components/
│   ├── PracticeSetInput.tsx    # セット入力
│   ├── PracticeStyleSelect.tsx # 種目選択
│   ├── PracticeRepInput.tsx    # 本数・セット数入力
│   ├── PracticeCircleInput.tsx # サークル入力
│   ├── PracticeDistanceInput.tsx # 距離入力
│   ├── PracticeSetList.tsx     # セット一覧
│   └── index.ts
├── hooks/
│   ├── usePracticeLogForm.ts   # フォーム状態管理
│   ├── usePracticeLogSets.ts   # セット管理
│   ├── usePracticeLogSubmit.ts # 送信処理
│   └── index.ts
└── utils/
    └── practiceCalculations.ts # 距離計算等
```

### コンポーネント詳細

#### PracticeLogForm.tsx (メイン: ~150行)

```typescript
'use client'

import { PracticeLogProvider } from './PracticeLogProvider'
import { PracticeSetList } from './components/PracticeSetList'
import { PracticeSetInput } from './components/PracticeSetInput'
import { TagInput } from '../shared/TagManager/TagInput'
import { usePracticeLogFormContext } from './hooks/usePracticeLogForm'

interface PracticeLogFormProps {
  practiceId: string
  initialLogs?: PracticeLog[]
  onSubmit: (logs: PracticeLogFormData[]) => Promise<void>
  onCancel: () => void
}

export const PracticeLogForm = ({ practiceId, initialLogs, onSubmit, onCancel }: PracticeLogFormProps) => {
  return (
    <PracticeLogProvider practiceId={practiceId} initialLogs={initialLogs}>
      <PracticeLogFormContent onSubmit={onSubmit} onCancel={onCancel} />
    </PracticeLogProvider>
  )
}

const PracticeLogFormContent = ({ onSubmit, onCancel }) => {
  const { logs, addLog, removeLog, updateLog, handleSubmit } = usePracticeLogFormContext()

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <PracticeSetList logs={logs} onRemove={removeLog} onUpdate={updateLog} />
      <PracticeSetInput onAdd={addLog} />

      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={onCancel}>キャンセル</Button>
        <Button type="submit">保存</Button>
      </div>
    </form>
  )
}
```

### 推定工数

**3-4時間**

---

## ステップ4: RecordLogFormの分割

### 現状分析

RecordLogForm.tsx (804行) の責務:

- 記録ログ入力（セット番号、タイム、リアクションタイム）
- ラップタイム入力
- 複数セット管理
- バリデーション
- 送信処理

### 新しい構造

```
forms/record-log/
├── RecordLogForm.tsx           # メインフォーム（150行）
├── RecordLogProvider.tsx       # フォーム状態管理
├── index.ts
├── components/
│   ├── RecordLogSetInput.tsx   # セット入力
│   ├── RecordLogTimeInput.tsx  # タイム入力
│   ├── RecordLogReaction.tsx   # リアクションタイム
│   ├── RecordLogLapTimes.tsx   # ラップタイム入力
│   ├── RecordLogSetList.tsx    # セット一覧
│   └── index.ts
├── hooks/
│   ├── useRecordLogForm.ts     # フォーム状態管理
│   ├── useRecordLogSets.ts     # セット管理
│   ├── useRecordLogSubmit.ts   # 送信処理
│   └── index.ts
└── utils/
    └── recordLogCalculations.ts
```

### 推定工数

**3-4時間**

---

## ステップ5: ImageUploaderの統合

### 現状

- `PracticeImageUploader.tsx` (271行)
- `CompetitionImageUploader.tsx` (272行)
- **90%以上のコードが重複**（型名のみ異なる）

### 解決策

汎用 `ImageUploader` コンポーネントを作成し、型パラメータで対応。

### 新しい構造

```
forms/shared/ImageUploader/
├── ImageUploader.tsx           # 汎用アップローダー（200行）
├── ImagePreview.tsx            # プレビュー表示（80行）
├── ImageDragDrop.tsx           # ドラッグ&ドロップ（60行）
├── PracticeImageUploader.tsx   # Practice用ラッパー（20行）
├── CompetitionImageUploader.tsx # Competition用ラッパー（20行）
├── index.ts
└── hooks/
    ├── useImageUpload.ts       # アップロードロジック
    ├── useImageReorder.ts      # 並び替えロジック
    └── index.ts
```

### 実装例

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

export function ImageUploader<T extends BaseImage>({
  entityId,
  entityType,
  images,
  maxImages = 10,
  maxSizeKB = 5120,
  onUpload,
  onDelete,
  onReorder
}: ImageUploaderProps<T>) {
  const { isDragging, isUploading, handleFiles, setIsDragging } = useImageUpload({
    maxImages,
    maxSizeKB,
    currentCount: images.length,
    onUpload
  })

  return (
    <div className="space-y-4">
      <ImageDragDrop
        isDragging={isDragging}
        isUploading={isUploading}
        onDragChange={setIsDragging}
        onFiles={handleFiles}
        disabled={images.length >= maxImages}
      />
      <ImagePreview
        images={images}
        onDelete={onDelete}
        onReorder={onReorder}
      />
    </div>
  )
}

// forms/shared/ImageUploader/PracticeImageUploader.tsx
export const PracticeImageUploader = (props: Omit<ImageUploaderProps<PracticeImage>, 'entityType'>) => {
  return <ImageUploader<PracticeImage> entityType="practice" {...props} />
}

// forms/shared/ImageUploader/CompetitionImageUploader.tsx
export const CompetitionImageUploader = (props: Omit<ImageUploaderProps<CompetitionImage>, 'entityType'>) => {
  return <ImageUploader<CompetitionImage> entityType="competition" {...props} />
}
```

### 推定工数

**2-3時間**

---

## 📊 進捗サマリー

| ステップ | 対象                   | 現在        | 目標       | 削減率  | ステータス |
| -------- | ---------------------- | ----------- | ---------- | ------- | ---------- |
| 1        | 共通コンポーネント作成 | -           | -          | -       | ⏳ 未着手  |
| 2        | RecordForm             | 865行       | ~150行     | 83%     | ⏳ 未着手  |
| 3        | PracticeLogForm        | 848行       | ~150行     | 82%     | ⏳ 未着手  |
| 4        | RecordLogForm          | 804行       | ~150行     | 81%     | ⏳ 未着手  |
| 5        | ImageUploader統合      | 543行       | ~200行     | 63%     | ⏳ 未着手  |
| **合計** | -                      | **3,060行** | **~650行** | **79%** | **0%完了** |

---

## 🎯 実装順序（推奨）

1. **ステップ1: 共通コンポーネント作成** (3-4時間)
   - TimeInput, ImageUploader, StyleSelect の共通化
   - 後続のステップで再利用

2. **ステップ5: ImageUploader統合** (2-3時間)
   - 重複コード解消
   - シンプルなリファクタリング

3. **ステップ2: RecordForm分割** (4-5時間)
   - 最大のファイルから着手
   - パターンを確立

4. **ステップ3: PracticeLogForm分割** (3-4時間)
   - RecordFormのパターンを適用

5. **ステップ4: RecordLogForm分割** (3-4時間)
   - 同様のパターンを適用

**合計推定工数**: 16-20時間

---

## 検証チェックリスト

各ステップ完了後:

- [ ] TypeScript コンパイルエラーなし (`npx tsc --noEmit`)
- [ ] Next.js ビルド成功 (`npm run build`)
- [ ] 既存テスト全てパス (`npm test`)
- [ ] 手動動作確認
  - [ ] フォーム入力・送信
  - [ ] バリデーションエラー表示
  - [ ] 画像アップロード
  - [ ] タグ管理
- [ ] インポートパスの後方互換性確認

---

## 📝 ベストプラクティス

### フェーズ2で確立したパターンを適用

1. **ディレクトリ構造**: `component-name/` 配下に components/, hooks/, utils/
2. **後方互換性**: ルートレベルで再エクスポート
3. **カスタムフック**: 単一責任、テスト可能
4. **コンポーネント**: 150-250行以内

### フォーム固有のベストプラクティス

1. **Context + Reducer**: フォーム状態管理
2. **バリデーション分離**: `useXxxValidation` フック
3. **送信処理分離**: `useXxxSubmit` フック
4. **計算ロジック分離**: `utils/xxxCalculations.ts`

---

## 📚 参考

### 関連ドキュメント

- [REFACTORING_PLAN.md](./REFACTORING_PLAN.md) - 全体計画
- [REFACTORING_PHASE2_PROGRESS.md](./REFACTORING_PHASE2_PROGRESS.md) - フェーズ2の成功例

### 参考実装

- `team/member-management/` - コンポーネント分割の成功例
- `team/monthly-attendance/` - フック抽出の成功例

---

**最終更新**: 2026-01-22
**次回更新予定**: ステップ1完了後
