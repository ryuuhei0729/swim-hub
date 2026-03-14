# 練習テンプレート機能 仕様書

## 1. 概要

### 1.1 背景

週3回以上練習するヘビーユーザーにとって、毎回同じような練習メニューを手入力するのは非効率。よく使う練習メニューをテンプレートとして保存し、ワンタップで呼び出せる機能を提供する。

### 1.2 目的

- 練習記録の入力時間を50%以上削減
- ユーザーの継続利用率向上
- 入力ミスの削減

### 1.3 対象ユーザー

- 週3回以上練習記録をつける競泳選手
- 決まったメニューを繰り返すユーザー

### 1.4 スコープ

- **対象**: Practice_Log（メニュー単位）のテンプレート
- **対象外**: Practice（日単位）のテンプレートは作成しない

---

## 2. ユーザーストーリー

```
AS A 競泳選手
I WANT TO よく使う練習メニューをテンプレートとして保存したい
SO THAT 毎回の入力時間を短縮できる
```

```
AS A 競泳選手
I WANT TO テンプレートから練習ログを作成したい
SO THAT ワンタップでメニューを追加できる
```

```
AS A 競泳選手
I WANT TO マイルストーン作成時にテンプレートにも追加したい
SO THAT 目標達成のための練習をすぐ呼び出せる
```

---

## 3. 機能要件

### 3.1 テンプレート管理

| 機能                         | 説明                                     | 優先度 |
| ---------------------------- | ---------------------------------------- | ------ |
| テンプレート作成             | 練習ログからテンプレートを作成           | P0     |
| テンプレート一覧表示         | 保存済みテンプレートの一覧               | P0     |
| テンプレートから練習ログ作成 | テンプレートを選択してPractice_Logを作成 | P0     |
| テンプレート削除             | 不要なテンプレートを削除                 | P1     |
| テンプレートのお気に入り     | 頻繁に使うものをピン留め                 | P2     |

### 3.2 テンプレートに保存する項目

| 項目                      | 保存対象 | 備考                                 |
| ------------------------- | -------- | ------------------------------------ |
| テンプレート名            | ○        | ユーザーが設定（例：「朝練キック」） |
| 種目（style）             | ○        | Fr, Ba, Br, Fly, IM                  |
| カテゴリ（swim_category） | ○        | Swim, Pull, Kick                     |
| 距離（distance）          | ○        | 25, 50, 100, 200...                  |
| 本数（rep_count）         | ○        | 1〜99                                |
| セット数（set_count）     | ○        | 1〜99                                |
| サークル（circle）        | ○        | 秒数（任意）                         |
| メモ（note）              | ○        | 任意                                 |
| タグ（tag_ids）           | ○        | UUID配列（JSONB）                    |

**保存しないもの:**

- 日付（作成時に指定）
- タイム（実績なので保存しない）
- 場所（Practice単位の情報）

### 3.3 テンプレートの使用上限（将来的に実装）

| プラン             | 上限数 |
| ------------------ | ------ |
| 無料ユーザー       | 10個   |
| プレミアム（将来） | 無制限 |

### 3.4 マイルストーンとの連携

マイルストーン作成時に「テンプレートにも追加する」オプションを提供。
チェックONの場合、マイルストーンのパラメータをそのまま `practice_log_templates` にコピーする。

- マイルストーンとの紐づけ（FK）は持たない
- 単純にデータをコピーするだけ
- マイルストーン削除してもテンプレートは残る

---

## 4. データモデル

### 4.1 テーブル設計

#### practice_log_templates テーブル

```sql
CREATE TABLE practice_log_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  style VARCHAR(10) NOT NULL,
  swim_category VARCHAR(10) NOT NULL DEFAULT 'Swim',
  distance INTEGER NOT NULL DEFAULT 50,
  rep_count INTEGER NOT NULL DEFAULT 1,
  set_count INTEGER NOT NULL DEFAULT 1,
  circle INTEGER,
  note TEXT,
  tag_ids UUID[] DEFAULT '{}',
  is_favorite BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX idx_practice_log_templates_user_id
  ON practice_log_templates(user_id);
CREATE INDEX idx_practice_log_templates_use_count
  ON practice_log_templates(user_id, use_count DESC);

-- RLS
ALTER TABLE practice_log_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own templates"
  ON practice_log_templates
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 4.2 TypeScript型定義

```typescript
// apps/shared/types/template.ts

export interface PracticeLogTemplate {
  id: string;
  user_id: string;
  name: string;
  style: string;
  swim_category: "Swim" | "Pull" | "Kick";
  distance: number;
  rep_count: number;
  set_count: number;
  circle: number | null;
  note: string | null;
  tag_ids: string[];
  is_favorite: boolean;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

// 作成用の入力型
export interface CreatePracticeLogTemplateInput {
  name: string;
  style: string;
  swim_category: "Swim" | "Pull" | "Kick";
  distance: number;
  rep_count: number;
  set_count: number;
  circle?: number;
  note?: string;
  tag_ids?: string[];
}
```

---

## 5. UI/UX設計

### 5.1 テンプレート作成の導線

#### パターンA: 練習履歴からテンプレート化

```
練習履歴 → 記録の「...」メニュー → 「テンプレートとして保存」
         ↓
    テンプレート名入力モーダル
         ↓
       保存完了
```

#### パターンB: マイルストーン作成時

```
Goal詳細 → マイルストーン作成モーダル
         ↓
    ☑ テンプレートにも追加する
         ↓
    マイルストーン作成 + テンプレート作成
```

#### パターンC: テンプレート管理画面から新規作成

```
設定 → テンプレート管理 → 「+新規作成」
     ↓
   フォーム入力
     ↓
   保存完了
```

### 5.2 テンプレートから練習ログ作成の導線

**※ 練習の新規作成はダッシュボードからのみ行う**

練習記録の詳細モーダル内で、最初から2つのボタンを並べて表示する：

```
┌─────────────────────────────────────────┐
│ ⚡ 練習記録                    ✏️  🗑️   │
├─────────────────────────────────────────┤
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │  [📋 テンプレートから] [✏️ 新規] │    │  ← 最初から2つ表示
│  │                                 │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**変更前（クリック数: 2）**

```
「+ 練習メニューを追加」クリック → 選択肢表示 → 選択
```

**変更後（クリック数: 1）**

```
「📋 テンプレートから」or「✏️ 新規」を直接クリック
```

#### 既存UIの変更点

**PracticeLogForm の「📌 マイルストーンから作成」ボタン → 廃止**

- 変更後: DayDetailModal の「テンプレートから作成」に統合

### 5.3 画面モックアップ

#### テンプレート選択モーダル

```
┌────────────────────────────────────┐
│  テンプレートを選択          ✕    │
├────────────────────────────────────┤
│  ★ よく使うテンプレート            │
│  ┌──────────────────────────────┐ │
│  │ 朝練キック                   > │ │
│  │ 100m × 10本 × 3セット Fr Kick │ │
│  └──────────────────────────────┘ │
│  ┌──────────────────────────────┐ │
│  │ メインSwim                   > │ │
│  │ 50m × 20本 × 2セット Fr Swim  │ │
│  └──────────────────────────────┘ │
│                                    │
│  すべてのテンプレート              │
│  ┌──────────────────────────────┐ │
│  │ バタフライドリル              > │ │
│  │ 25m × 8本 × 4セット Fly Swim  │ │
│  └──────────────────────────────┘ │
│  ┌──────────────────────────────┐ │
│  │ ゴールセット                 > │ │
│  │ 50m × 6本 × 3セット Fr Swim   │ │
│  └──────────────────────────────┘ │
├────────────────────────────────────┤
│  [ テンプレートを管理 ]            │
└────────────────────────────────────┘
```

#### テンプレート管理画面

```
┌────────────────────────────────────┐
│  ← テンプレート管理                │
├────────────────────────────────────┤
│  保存済み: 5/10                    │
│                                    │
│  ┌──────────────────────────────┐ │
│  │ ★ 朝練キック            ⋮   │ │
│  │    100m × 10本 × 3セット      │ │
│  │    Fr Kick  サークル 1'30"    │ │
│  └──────────────────────────────┘ │
│                                    │
│  ┌──────────────────────────────┐ │
│  │ ☆ メインSwim            ⋮   │ │
│  │    50m × 20本 × 2セット       │ │
│  │    Fr Swim  サークル 0'50"    │ │
│  └──────────────────────────────┘ │
│                                    │
├────────────────────────────────────┤
│  [ + 新しいテンプレートを作成 ]    │
└────────────────────────────────────┘

「⋮」メニュー:
  - お気に入りに追加/解除
  - 削除
```

#### マイルストーン作成モーダル（変更箇所）

```
┌─────────────────────────────────────┐
│  マイルストーン作成                  │
├─────────────────────────────────────┤
│  タイトル: [50m×6本 ゴールセット   ] │
│  種目: [Fr ▼]  カテゴリ: [Swim ▼]   │
│  距離: [50]m × [6]本 × [3]セット    │
│  サークル: [1]分[30]秒              │
│  目標平均: [35.0]秒                 │
│  期限: [2026/02/28]                 │
│                                      │
│  ☑ テンプレートにも追加する         │  ← NEW
│    （練習作成時にすぐ使えます）      │
│                                      │
│  [キャンセル]        [作成]          │
└─────────────────────────────────────┘
```

---

## 6. API設計

### 6.1 API クラス

```typescript
// apps/shared/api/templates.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PracticeLogTemplate, CreatePracticeLogTemplateInput } from "../types/template";

export class TemplateAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * テンプレート一覧を取得
   */
  async getTemplates(): Promise<PracticeLogTemplate[]> {
    const { data, error } = await this.supabase
      .from("practice_log_templates")
      .select("*")
      .order("is_favorite", { ascending: false })
      .order("use_count", { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * テンプレートを作成
   */
  async createTemplate(input: CreatePracticeLogTemplateInput): Promise<PracticeLogTemplate> {
    const { data, error } = await this.supabase
      .from("practice_log_templates")
      .insert({
        name: input.name,
        style: input.style,
        swim_category: input.swim_category,
        distance: input.distance,
        rep_count: input.rep_count,
        set_count: input.set_count,
        circle: input.circle || null,
        note: input.note || null,
        tag_ids: input.tag_ids || [],
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * テンプレートを使用（use_count更新）
   */
  async useTemplate(templateId: string): Promise<void> {
    const { error } = await this.supabase
      .from("practice_log_templates")
      .update({
        use_count: this.supabase.rpc("increment", { row_id: templateId }),
        last_used_at: new Date().toISOString(),
      })
      .eq("id", templateId);

    if (error) throw error;
  }

  /**
   * テンプレートを削除
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const { error } = await this.supabase
      .from("practice_log_templates")
      .delete()
      .eq("id", templateId);

    if (error) throw error;
  }

  /**
   * お気に入りを切り替え
   */
  async toggleFavorite(templateId: string): Promise<void> {
    const { data: current } = await this.supabase
      .from("practice_log_templates")
      .select("is_favorite")
      .eq("id", templateId)
      .single();

    const { error } = await this.supabase
      .from("practice_log_templates")
      .update({ is_favorite: !current?.is_favorite })
      .eq("id", templateId);

    if (error) throw error;
  }
}
```

### 6.2 use_count インクリメント用RPC

```sql
CREATE OR REPLACE FUNCTION increment_template_use_count(template_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE practice_log_templates
  SET use_count = use_count + 1,
      last_used_at = now(),
      updated_at = now()
  WHERE id = template_id AND user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 7. 実装計画

### 7.1 フェーズ分け

#### Phase 1: 基盤構築（1週目）

- [ ] DBマイグレーション作成
- [ ] 型定義追加
- [ ] TemplateAPI クラス実装
- [ ] React Query hooks 実装

#### Phase 2: テンプレート管理UI（2週目）

- [ ] テンプレート管理ページ作成（/settings/templates）
- [ ] テンプレート一覧コンポーネント
- [ ] テンプレート削除機能
- [ ] お気に入り機能

#### Phase 3: 練習作成連携（3週目）

- [ ] テンプレート選択モーダル作成
- [ ] DayDetailModal への導線追加
- [ ] 練習履歴から「テンプレートとして保存」機能
- [ ] use_count の自動更新
- [ ] 既存の「マイルストーンから作成」ボタンを廃止

#### Phase 4: マイルストーン連携（3週目後半）

- [ ] MilestoneCreateModal に「テンプレートにも追加」チェックボックス追加
- [ ] マイルストーン作成時のテンプレート自動作成処理

### 7.2 ファイル構成

```
apps/
├── shared/
│   ├── api/
│   │   └── practiceLogTemplates.ts              # NEW: API クラス
│   ├── types/
│   │   └── practiceLogTemplate.ts               # NEW: 型定義
│   └── hooks/
│       └── queries/
│           └── practiceLogTemplates.ts          # NEW: React Query hooks
│
└── web/
    ├── app/
    │   └── (authenticated)/
    │       └── settings/
    │           └── practice-log-templates/      # NEW: テンプレート管理ページ
    │               ├── page.tsx
    │               └── _components/
    │                   ├── PracticeLogTemplateList.tsx
    │                   └── PracticeLogTemplateCard.tsx
    │
    └── components/
        └── practice-log-templates/              # NEW
            ├── PracticeLogTemplateSelectModal.tsx
            └── SaveAsPracticeLogTemplateModal.tsx
```

---

## 8. 成功指標（KPI）

| 指標               | 目標値                      | 測定方法           |
| ------------------ | --------------------------- | ------------------ |
| テンプレート作成率 | アクティブユーザーの30%以上 | テーブルの作成数   |
| テンプレート使用率 | 作成者の50%が週1回以上使用  | use_count の増加   |
| 練習入力時間削減   | 平均50%削減                 | ユーザーアンケート |

---

## 9. 将来の拡張

- チームテンプレート（チーム管理者が作成、メンバーが使用）
- テンプレートのインポート/エクスポート
- AI推奨テンプレート（頻出パターンから自動提案）

---

## 変更履歴

| 日付       | バージョン | 変更内容                                                                  | 担当 |
| ---------- | ---------- | ------------------------------------------------------------------------- | ---- |
| 2026-01-28 | 1.0        | 初版作成                                                                  | -    |
| 2026-01-28 | 1.1        | 練習履歴ページからの追加導線を削除                                        | -    |
| 2026-01-28 | 1.2        | マイルストーン連携を追加                                                  | -    |
| 2026-01-28 | 2.0        | データモデルを簡略化（practice_log_templates 1テーブルのみ）              | -    |
| 2026-01-28 | 2.1        | メモ（note）とタグ（tag_ids）を保存対象に追加                             | -    |
| 2026-01-28 | 2.2        | UI改善: 「テンプレートから」「新規」ボタンを最初から表示（1クリック削減） | -    |
