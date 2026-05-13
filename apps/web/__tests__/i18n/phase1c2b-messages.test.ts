/**
 * Phase 1-C-2-B: authenticated 中優先度（goals エリア）翻訳キー網羅テスト
 *
 * Sprint Contract 検証観点:
 *   [V-C2B-01] goals namespace の必須キーが ja/en 両方に存在する
 *   [V-C2B-02] en.json の goals namespace 内に日本語が含まれない
 *   [V-C2B-03] Phase 1-C-1 / 1-C-2-A の必須キーがリグレッションしていない
 *   [V-C2B-04] ICU プレースホルダーが ja/en で対称である
 *   [V-C2B-05] ja/en キー集合が完全一致している
 *
 * NOTE: テスト本体は実装コードを参照しない。
 *       Sprint Contract で合意された namespace 構造・キー一覧に基づいて検証する。
 *       実装 (Web Developer) は ja.json / en.json に goals namespace を追加する。
 *
 * 対象 namespace (Phase 1-C-2-B 追加分):
 *   - goals (goals エリア全体)
 *
 * 対象コンポーネントと責務:
 *   GoalsClient.tsx →
 *     ページヘッダー: タイトル / 説明文 / 新規目標作成ボタン
 *     目標一覧エラー: エラーメッセージ / 再読み込みボタン
 *     目標詳細エラー: エラーメッセージ / 再読み込みボタン
 *     目標未選択状態: テキスト
 *   GoalList.tsx →
 *     空状態: テキスト / サブテキスト
 *     達成バッジ: ラベル
 *     目標タイム行: ラベル
 *   GoalDetail.tsx →
 *     目標タイム: ラベル
 *     初期タイム: ラベル / 未設定テキスト
 *     達成率: ラベル
 *     マイルストーンセクション: タイトル
 *     マイルストーン達成率: ラベル
 *     マイルストーン追加ボタン
 *   GoalCreateModal.tsx →
 *     モーダルタイトル
 *     ボタン: 作成 / キャンセル
 *   GoalEditModal.tsx →
 *     モーダルタイトル
 *     ボタン: 更新 / キャンセル
 *   GoalReflectionModal.tsx →
 *     モーダルタイトル
 *     期限到来文 / 概要ブロック
 *     達成判定ラベル
 *     達成ボタン / 未達成ボタン
 *     振り返りラベル / 選択肢 × 5
 *     その他ラベル / placeholder
 *     ボタン: スキップ / 保存
 *     大会日ラベル / マイルストーン達成テキスト
 *   MilestoneList.tsx →
 *     空状態: テキスト / サブテキスト
 *     期限ラベル / 達成日ラベル
 *     達成バッジ
 *   MilestoneCreateModal.tsx →
 *     モーダルタイトル
 *     テンプレートにも追加チェックボックス: ラベル / サブテキスト
 *     ボタン: 作成 / キャンセル
 *   MilestoneEditModal.tsx →
 *     モーダルタイトル
 *     ボタン: 更新 / キャンセル
 *   MilestoneSelectorModal.tsx →
 *     モーダルタイトル
 *     ローディング中テキスト
 *     空状態テキスト
 *   GoalSetCalculatorModal.tsx →
 *     モーダルタイトル
 *     自動取得情報セクション: タイトル / 目標ラベル / 大会水路ラベル / 年齢ラベル / 性別ラベル
 *     年齢未設定エラー / 性別未設定エラー
 *     プロフィール設定誘導文
 *     ゴールセット実施水路ラベル / 短水路オプション / 長水路オプション
 *     計算結果: ゴールセット目標ラベル / 50m平均説明
 *     計算中テキスト / 警告テキスト
 *     ボタン: この値を使用 / キャンセル
 *     大会水路: 長水路 / 短水路
 *     性別: 男子 / 女子
 *     年齢単位
 *   ReflectionModal.tsx →
 *     モーダルタイトル
 *     期限到来文 / 概要ブロック
 *     振り返りラベル / 選択肢 × 5
 *     その他ラベル / placeholder
 *     次のアクション: ラベル / 新しいマイルストーン作成ボタン
 *     ボタン: スキップ / 保存
 *     期限ラベル
 *   ProgressBar.tsx →
 *     (ハードコード文字列なし - 翻訳対象外)
 *   GoalForm.tsx →
 *     大会ラベル / 既存大会選択ラジオ / 新規大会作成ラジオ
 *     大会選択placeholder / 大会名placeholder / 場所placeholder
 *     大会日ラベル
 *     種目ラベル / 種目選択placeholder
 *     目標タイムラベル / 目標タイムplaceholder
 *     初期タイムラベル / 初期タイムplaceholder
 *     ベストタイムから取得ボタン
 *   MilestoneForm.tsx →
 *     テンプレートラベル / テンプレート選択placeholder
 *     タイプラベル / タイプ選択肢 × 3（ラベル + 説明）
 *     テンプレート適用中注記
 *     タイトルラベル
 *   MilestoneParamsForm.tsx →
 *     TimeParamsForm: 距離ラベル / 種目ラベル / S/P/Kラベル / 目標タイムラベル
 *                     バリデーションエラー × 2
 *     RepsTimeParamsForm: 距離ラベル / 本数ラベル / セット数ラベル / 平均目標タイムラベル
 *                         種目ラベル / S/P/Kラベル / サークル(分)ラベル / サークル(秒)ラベル
 *                         バリデーションエラー
 *     SetParamsForm: 距離ラベル / 本数ラベル / セット数ラベル
 *                    種目ラベル / S/P/Kラベル / サークル(分)ラベル / サークル(秒)ラベル
 *   DeadlineInput.tsx →
 *     期限日ラベル (デフォルト)
 *     目標の期限と揃えるボタン
 *
 * Out of Scope（前フェーズから継承）:
 *   - window.alert / window.confirm のハードコード文字列
 *   - aria-label / title 属性
 *   - date-fns locale ハードコード
 *   - API エラーレスポンス文字列（サーバー由来）
 *   - SWIM_CATEGORIES: "Swim" / "Pull" / "Kick" は英語固定値なのでスコープ外
 *   - SWIM_STYLES / POOL_TYPES の constants.ts ハードコードラベル
 *     (getDefaultTitle の秒数サフィックスも同様)
 *   - GoalReflectionModal / ReflectionModal の `その他: ${otherNote}` 文字列 (動的結合)
 *   - ProgressBar コンポーネント (描画のみ)
 *
 * Boundary Cases:
 *   - 目標タイムの「未設定」テキスト (start_time が null の場合)
 *   - マイルストーン 0/n 表示 (goal.milestones 空の場合)
 *   - ゴールセット計算時の「年齢未設定」「性別未設定」エラー (profile 未設定)
 *   - DeadlineInput の label prop デフォルト値「期限日（任意）」
 */

import { describe, it, expect } from "vitest";
import jaMessages from "../../messages/ja.json";
import enMessages from "../../messages/en.json";

// ---------------------------------------------------------------------------
// ヘルパー: ネストしたキーをフラットなパスで列挙
// ---------------------------------------------------------------------------

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// ヘルパー: 値の中に日本語文字が含まれるかチェック
// ---------------------------------------------------------------------------

function containsJapanese(value: unknown): boolean {
  if (typeof value === "string") {
    return /[぀-ヿ一-鿿＀-￯]/.test(value);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>).some(containsJapanese);
  }
  return false;
}

// ---------------------------------------------------------------------------
// ヘルパー: ICU Message Format の {variable} プレースホルダーを抽出
// ---------------------------------------------------------------------------

function extractPlaceholders(value: unknown): Set<string> {
  const result = new Set<string>();
  if (typeof value === "string") {
    const matches = value.match(/\{[a-zA-Z0-9_]+\}/g);
    if (matches) {
      for (const m of matches) result.add(m);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// ヘルパー: ネストされたキーパスで値を取得
// ---------------------------------------------------------------------------

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current: unknown, segment: string) => {
    if (current !== null && typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

// ---------------------------------------------------------------------------
// [V-C2B-01] goals namespace の必須キー確認
//
// 対象コンポーネント:
//   GoalsClient.tsx →
//     ページヘッダー (desktop): タイトル / 説明文 / 新規目標作成ボタン
//     目標一覧エラー: エラーメッセージ / 再読み込みボタン
//     目標詳細エラー: エラーメッセージ / 再読み込みボタン
//     目標未選択状態: テキスト
//   GoalList.tsx →
//     空状態: テキスト / サブテキスト
//     達成バッジ: ラベル
//     目標タイム行: ラベル接頭辞
//   GoalDetail.tsx →
//     目標タイムラベル / 初期タイムラベル / 未設定テキスト
//     達成率ラベル
//     マイルストーンセクションタイトル / マイルストーン達成率ラベル
//     マイルストーン追加ボタン
//   GoalCreateModal.tsx → タイトル / 作成ボタン / キャンセルボタン
//   GoalEditModal.tsx → タイトル / 更新ボタン / キャンセルボタン
//   GoalReflectionModal.tsx →
//     タイトル / 期限到来文 / 目標ラベル / 初期タイムラベル / 大会日ラベル
//     マイルストーン達成テキスト / 達成判定ラベル
//     達成ボタン / 未達成ボタン
//     振り返りラベル / 選択肢 × 5
//     その他ラベル / placeholder
//     スキップボタン / 保存ボタン
//   MilestoneList.tsx →
//     空状態: テキスト / サブテキスト
//     期限ラベル / 達成日ラベル / 達成バッジ
//   MilestoneCreateModal.tsx →
//     タイトル / テンプレート追加チェックボックスラベル / サブテキスト
//     作成ボタン / キャンセルボタン
//   MilestoneEditModal.tsx →
//     タイトル / 更新ボタン / キャンセルボタン
//   MilestoneSelectorModal.tsx →
//     タイトル / ローディングテキスト / 空状態テキスト
//   GoalSetCalculatorModal.tsx →
//     タイトル / 自動取得情報セクションタイトル
//     目標ラベル / 大会水路ラベル / 年齢ラベル / 性別ラベル
//     ローディングテキスト / 年齢未設定エラー / 性別未設定エラー
//     プロフィール設定誘導テキスト
//     ゴールセット実施水路ラベル / 短水路オプション / 長水路オプション
//     計算結果: ゴールセット目標ラベル / 50m平均説明テキスト
//     計算中テキスト / 警告テキスト
//     この値を使用ボタン / キャンセルボタン
//     大会水路: 長水路表示 / 短水路表示
//     性別表示: 男子 / 女子
//     年齢単位 (歳)
//   ReflectionModal.tsx →
//     タイトル / 期限到来文
//     振り返りラベル / 選択肢 × 5
//     その他ラベル / placeholder
//     次のアクションラベル / 新しいマイルストーン作成ボタン
//     スキップボタン / 保存ボタン
//     期限ラベル
//   GoalForm.tsx →
//     大会ラベル / 既存大会ラジオ / 新規大会ラジオ
//     大会選択placeholder / 大会名placeholder / 場所placeholder
//     大会日ラベル
//     種目ラベル / 種目placeholder
//     目標タイムラベル / 目標タイムplaceholder
//     初期タイムラベル / 初期タイムplaceholder
//     ベストタイムから取得ボタン
//   MilestoneForm.tsx →
//     テンプレートラベル / テンプレート選択placeholder
//     タイプラベル
//     タイプ選択肢: タイム目標ラベル+説明 / 練習平均タイム目標ラベル+説明 / サークルイン目標ラベル+説明
//     テンプレート適用中注記
//     タイトルラベル
//   MilestoneParamsForm.tsx →
//     共通: 距離ラベル / 種目ラベル / S/P/Kラベル
//     TimeParamsForm: 目標タイムラベル / バリデーション × 2
//     RepsTimeParamsForm: 本数ラベル / セット数ラベル / 平均目標タイムラベル
//                         サークル(分)ラベル / サークル(秒)ラベル / バリデーション
//     SetParamsForm: 本数ラベル / セット数ラベル
//                    サークル(分)ラベル / サークル(秒)ラベル
//   DeadlineInput.tsx →
//     期限日ラベル (デフォルト) / 目標の期限と揃えるボタン
// ---------------------------------------------------------------------------

describe("[V-C2B-01] goals namespace の必須キー確認", () => {
  const GOALS_REQUIRED_KEYS = [
    // --------------------------------------------------------
    // GoalsClient.tsx: ページヘッダー
    // --------------------------------------------------------
    "goals.page.title",
    "goals.page.description",
    "goals.page.createButton",

    // GoalsClient.tsx: 目標一覧エラー
    "goals.list.loadError",
    "goals.list.retry",

    // GoalsClient.tsx: 目標詳細エラー
    "goals.detail.loadError",
    "goals.detail.retry",

    // GoalsClient.tsx: 目標未選択
    "goals.page.selectHint",

    // --------------------------------------------------------
    // GoalList.tsx: 空状態
    // --------------------------------------------------------
    "goals.list.empty",
    "goals.list.emptyDesc",

    // GoalList.tsx: 達成バッジ
    "goals.list.achievedBadge",

    // GoalList.tsx: 目標タイム接頭辞
    "goals.list.targetTimePrefix",

    // --------------------------------------------------------
    // GoalDetail.tsx
    // --------------------------------------------------------
    "goals.detail.targetTime",
    "goals.detail.initialTime",
    "goals.detail.notSet",
    "goals.detail.achievement",
    "goals.detail.milestoneSection",
    "goals.detail.milestoneRatio",
    "goals.detail.milestoneAdd",

    // --------------------------------------------------------
    // GoalCreateModal.tsx
    // --------------------------------------------------------
    "goals.create.title",
    "goals.create.submitButton",
    "goals.create.cancelButton",

    // --------------------------------------------------------
    // GoalEditModal.tsx
    // --------------------------------------------------------
    "goals.edit.title",
    "goals.edit.submitButton",
    "goals.edit.cancelButton",

    // --------------------------------------------------------
    // GoalReflectionModal.tsx
    // --------------------------------------------------------
    "goals.goalReflection.title",
    "goals.goalReflection.expiredDesc",
    "goals.goalReflection.targetLabel",
    "goals.goalReflection.initialTimeLabel",
    "goals.goalReflection.competitionDateLabel",
    "goals.goalReflection.milestoneAchievedText",
    "goals.goalReflection.achievedQuestion",
    "goals.goalReflection.achievedButton",
    "goals.goalReflection.notAchievedButton",
    "goals.goalReflection.reflectionLabel",
    "goals.goalReflection.options.goalTooHigh",
    "goals.goalReflection.options.periodTooShort",
    "goals.goalReflection.options.practiceInsufficient",
    "goals.goalReflection.options.conditionPoor",
    "goals.goalReflection.options.other",
    "goals.goalReflection.otherLabel",
    "goals.goalReflection.otherPlaceholder",
    "goals.goalReflection.skipButton",
    "goals.goalReflection.saveButton",

    // --------------------------------------------------------
    // MilestoneList.tsx
    // --------------------------------------------------------
    "goals.milestone.empty",
    "goals.milestone.emptyDesc",
    "goals.milestone.deadlineLabel",
    "goals.milestone.achievedDateLabel",
    "goals.milestone.achievedBadge",

    // --------------------------------------------------------
    // MilestoneCreateModal.tsx
    // --------------------------------------------------------
    "goals.milestoneCreate.title",
    "goals.milestoneCreate.addToTemplateLabel",
    "goals.milestoneCreate.addToTemplateSubtext",
    "goals.milestoneCreate.submitButton",
    "goals.milestoneCreate.cancelButton",

    // --------------------------------------------------------
    // MilestoneEditModal.tsx
    // --------------------------------------------------------
    "goals.milestoneEdit.title",
    "goals.milestoneEdit.submitButton",
    "goals.milestoneEdit.cancelButton",

    // --------------------------------------------------------
    // MilestoneSelectorModal.tsx
    // --------------------------------------------------------
    "goals.milestoneSelector.title",
    "goals.milestoneSelector.loading",
    "goals.milestoneSelector.empty",

    // --------------------------------------------------------
    // GoalSetCalculatorModal.tsx
    // --------------------------------------------------------
    "goals.goalSetCalculator.title",
    "goals.goalSetCalculator.autoFetchTitle",
    "goals.goalSetCalculator.targetLabel",
    "goals.goalSetCalculator.poolTypeLabel",
    "goals.goalSetCalculator.ageLabel",
    "goals.goalSetCalculator.genderLabel",
    "goals.goalSetCalculator.loading",
    "goals.goalSetCalculator.ageNotSetError",
    "goals.goalSetCalculator.genderNotSetError",
    "goals.goalSetCalculator.profileSettingHint",
    "goals.goalSetCalculator.practicePoolTypeLabel",
    "goals.goalSetCalculator.poolTypeShort",
    "goals.goalSetCalculator.poolTypeLong",
    "goals.goalSetCalculator.resultLabel",
    "goals.goalSetCalculator.resultDescription",
    "goals.goalSetCalculator.calculating",
    "goals.goalSetCalculator.warningText",
    "goals.goalSetCalculator.confirmButton",
    "goals.goalSetCalculator.cancelButton",
    "goals.goalSetCalculator.poolTypeLongDisplay",
    "goals.goalSetCalculator.poolTypeShortDisplay",
    "goals.goalSetCalculator.genderMale",
    "goals.goalSetCalculator.genderFemale",
    "goals.goalSetCalculator.ageUnit",

    // --------------------------------------------------------
    // ReflectionModal.tsx
    // --------------------------------------------------------
    "goals.reflection.title",
    "goals.reflection.expiredDesc",
    "goals.reflection.reflectionLabel",
    "goals.reflection.options.goalTooHigh",
    "goals.reflection.options.periodTooShort",
    "goals.reflection.options.practiceInsufficient",
    "goals.reflection.options.conditionPoor",
    "goals.reflection.options.other",
    "goals.reflection.otherLabel",
    "goals.reflection.otherPlaceholder",
    "goals.reflection.nextActionLabel",
    "goals.reflection.createMilestoneButton",
    "goals.reflection.skipButton",
    "goals.reflection.saveButton",
    "goals.reflection.deadlineLabel",

    // --------------------------------------------------------
    // GoalForm.tsx
    // --------------------------------------------------------
    "goals.form.competitionLabel",
    "goals.form.existingCompetitionRadio",
    "goals.form.newCompetitionRadio",
    "goals.form.selectCompetitionPlaceholder",
    "goals.form.competitionNamePlaceholder",
    "goals.form.competitionPlacePlaceholder",
    "goals.form.competitionDateLabel",
    "goals.form.styleLabel",
    "goals.form.selectStylePlaceholder",
    "goals.form.targetTimeLabel",
    "goals.form.targetTimePlaceholder",
    "goals.form.startTimeLabel",
    "goals.form.startTimePlaceholder",
    "goals.form.getBestTimeButton",

    // --------------------------------------------------------
    // MilestoneForm.tsx
    // --------------------------------------------------------
    "goals.milestoneForm.templateLabel",
    "goals.milestoneForm.templatePlaceholder",
    "goals.milestoneForm.typeLabel",
    "goals.milestoneForm.type.time.label",
    "goals.milestoneForm.type.time.description",
    "goals.milestoneForm.type.repsTime.label",
    "goals.milestoneForm.type.repsTime.description",
    "goals.milestoneForm.type.set.label",
    "goals.milestoneForm.type.set.description",
    "goals.milestoneForm.templateAppliedNote",
    "goals.milestoneForm.titleLabel",

    // --------------------------------------------------------
    // MilestoneParamsForm.tsx: 共通ラベル
    // --------------------------------------------------------
    "goals.paramsForm.distanceLabel",
    "goals.paramsForm.styleLabel",
    "goals.paramsForm.swimCategoryLabel",

    // MilestoneParamsForm.tsx: TimeParamsForm 固有
    "goals.paramsForm.targetTimeLabel",
    "goals.paramsForm.timeRequired",
    "goals.paramsForm.timeInvalid",

    // MilestoneParamsForm.tsx: RepsTimeParamsForm 固有
    "goals.paramsForm.repsLabel",
    "goals.paramsForm.setsLabel",
    "goals.paramsForm.averageTimeLabel",
    "goals.paramsForm.circleMinLabel",
    "goals.paramsForm.circleSecLabel",
    "goals.paramsForm.averageTimeRequired",

    // MilestoneParamsForm.tsx: SetParamsForm も repsLabel / setsLabel / circleMinLabel / circleSecLabel を使用
    // (上記で定義済み)

    // --------------------------------------------------------
    // DeadlineInput.tsx
    // --------------------------------------------------------
    "goals.deadlineInput.defaultLabel",
    "goals.deadlineInput.alignButton",
  ] as const;

  for (const key of GOALS_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません (Phase 1-C-2-B 未実装)`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません (Phase 1-C-2-B 未実装)`).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C2B-02] en.json の goals namespace 内に日本語が含まれないこと
// ---------------------------------------------------------------------------

describe("[V-C2B-02] en.json の goals namespace に日本語が含まれないこと", () => {
  it('en.json の namespace "goals" に日本語が含まれない (翻訳漏れゼロ)', () => {
    const messages = enMessages as Record<string, unknown>;
    const nsValue = messages["goals"];
    if (!nsValue) {
      // namespace 未存在は [V-C2B-01] の各キーテストが検出するためここではスキップ
      return;
    }
    expect(
      containsJapanese(nsValue),
      'en.json の "goals" に日本語が含まれています。翻訳漏れキーを確認してください。',
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// [V-C2B-03] Phase 1-C-1 / 1-C-2-A の必須キーがリグレッションしていないこと
//
// Phase 1-C-1 で確立した namespace と Phase 1-C-2-A 追加 namespace の
// サンプルキーが Phase 1-C-2-B 実装後も維持されていること。
// ---------------------------------------------------------------------------

describe("[V-C2B-03] Phase 1-C-1 / 1-C-2-A 必須キーのリグレッション防止", () => {
  const REGRESSION_KEYS = [
    // Phase 1-C-1: dashboard
    "dashboard.stats.monthlyPractice.title",
    "dashboard.calendar.title",
    "dashboard.announcements.title",
    "dashboard.dayDetail.addRecord",
    "dashboard.deleteConfirm.title",
    // Phase 1-C-1: practice
    "practice.details.badge",
    "practice.details.loading",
    "practice.styles.Fr",
    "practice.styles.Br",
    // Phase 1-C-1: mypage
    "mypage.title",
    "mypage.profile.title",
    // Phase 1-C-1: onboarding
    "onboarding.step1.title",
    "onboarding.step2.nameLabel",
    "onboarding.step3.title",
    // Phase 1-C-1: sidebar
    "sidebar.nav.dashboard",
    "sidebar.settings",
    // Phase 1-C-1: footer
    "footer.description",
    "footer.links.privacy",
    // Phase 1-C-2-A: competition
    "competition.header.title",
    "competition.filter.periodLabel",
    "competition.table.date",
    "competition.detail.title",
    // Phase 1-C-2-A: settings
    "settings.header.title",
    "settings.subscription.title",
    "settings.googleCalendar.title",
    "settings.email.title",
    "settings.identity.title",
    "settings.accountDelete.title",
    // Phase 1-C-2-A: practiceLogTemplates
    "practiceLogTemplates.page.title",
    "practiceLogTemplates.list.emptyText",
    "practiceLogTemplates.createModal.createTitle",
    // Phase 1-C-2-A: bulkBestTime
    "bulkBestTime.header.title",
    "bulkBestTime.button.register",
    // Phase 1-C-2-A: common追加キー
    "common.poolTypeLong",
    "common.poolTypeShort",
  ] as const;

  for (const key of REGRESSION_KEYS) {
    it(`ja.json に "${key}" が維持されている`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `ja.json から "${key}" が消えています (Phase 1-C-1/1-C-2-A からのリグレッション)`,
      ).toContain(key);
    });

    it(`en.json に "${key}" が維持されている`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `en.json から "${key}" が消えています (Phase 1-C-1/1-C-2-A からのリグレッション)`,
      ).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C2B-04] ICU プレースホルダーの ja/en 対称確認
//
// goals namespace 内で {variable} プレースホルダーを使用するキーを確認する。
// 以下のキーは {achieved} / {total} / {count} / {date} 等を含む可能性がある。
// ---------------------------------------------------------------------------

describe("[V-C2B-04] ICU Message Format プレースホルダーの ja/en 対称確認", () => {
  // NOTE: 実装後に実際のプレースホルダーが確定する。
  //       以下は想定されるプレースホルダーキーをリストアップ。
  //       対称性チェックは両方に undefined でない場合のみ実行。
  const ICU_KEYS_TO_CHECK = [
    // マイルストーン達成テキスト: {achieved}/{total} 等
    "goals.goalReflection.milestoneAchievedText",
    // 達成率パーセント: 現時点ではシンプルな文字列の可能性が高いが念のため
    "goals.goalSetCalculator.ageLabel",
    "goals.goalSetCalculator.resultDescription",
  ] as const;

  for (const key of ICU_KEYS_TO_CHECK) {
    it(`"${key}" の ICU プレースホルダーが ja/en で対称である`, () => {
      const jaVal = getNestedValue(jaMessages as unknown as Record<string, unknown>, key);
      const enVal = getNestedValue(enMessages as unknown as Record<string, unknown>, key);

      // キー自体が未実装の場合はスキップ（キー存在チェックは [V-C2B-01] が担当）
      if (jaVal === undefined || enVal === undefined) {
        return;
      }

      const jaPlaceholders = extractPlaceholders(jaVal);
      const enPlaceholders = extractPlaceholders(enVal);

      for (const placeholder of jaPlaceholders) {
        expect(
          enPlaceholders.has(placeholder),
          `"${key}": ja には ${placeholder} があるが en にはない`,
        ).toBe(true);
      }

      for (const placeholder of enPlaceholders) {
        expect(
          jaPlaceholders.has(placeholder),
          `"${key}": en には ${placeholder} があるが ja にはない`,
        ).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C2B-05] Phase 1-C-2-B 実装後の ja/en キー集合完全一致
//
// Phase 1-C-2-B 実装完了後に ja.json と en.json のキー集合が一致していること。
// どちらかにキーが欠損・余剰している場合はこのテストで検出する。
// ---------------------------------------------------------------------------

describe("[V-C2B-05] Phase 1-C-2-B 実装後の ja/en キー集合完全一致", () => {
  it("ja.json のすべてのキーが en.json に存在する (en 欠損ゼロ)", () => {
    const jaKeys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
    const enKeys = new Set(flattenKeys(enMessages as unknown as Record<string, unknown>));
    const missingInEn = jaKeys.filter((k) => !enKeys.has(k));
    expect(
      missingInEn,
      `en.json に以下のキーが欠損しています:\n${missingInEn.join("\n")}`,
    ).toHaveLength(0);
  });

  it("en.json のすべてのキーが ja.json に存在する (ja 欠損ゼロ = 余剰キー検出)", () => {
    const enKeys = flattenKeys(enMessages as unknown as Record<string, unknown>);
    const jaKeys = new Set(flattenKeys(jaMessages as unknown as Record<string, unknown>));
    const missingInJa = enKeys.filter((k) => !jaKeys.has(k));
    expect(
      missingInJa,
      `ja.json に以下のキーが欠損しています:\n${missingInJa.join("\n")}`,
    ).toHaveLength(0);
  });
});
