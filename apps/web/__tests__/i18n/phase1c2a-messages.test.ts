/**
 * Phase 1-C-2-A: authenticated 中優先度（独立性高）エリア 翻訳キー網羅テスト
 *
 * Sprint Contract 検証観点:
 *   [V-C2A-01] competition namespace の必須キーが ja/en 両方に存在する
 *   [V-C2A-02] settings namespace の必須キーが ja/en 両方に存在する
 *   [V-C2A-03] practiceLogTemplates namespace の必須キーが ja/en 両方に存在する
 *   [V-C2A-04] bulkBestTime namespace の必須キーが ja/en 両方に存在する
 *   [V-C2A-05] common.poolTypeLong / poolTypeShort が common namespace に追加されている
 *   [V-C2A-06] en.json の Phase 1-C-2-A namespace 内に日本語が含まれない
 *   [V-C2A-07] Phase 1-C-1 の必須キーがリグレッションしていない
 *   [V-C2A-08] ICU プレースホルダーが ja/en で対称である
 *   [V-C2A-09] ja/en キー集合が完全一致している
 *
 * NOTE: テスト本体は実装コードを参照しない。
 *       Sprint Contract で合意された namespace 構造・キー一覧に基づいて検証する。
 *       実装 (Web Developer) は ja.json / en.json に以下の namespace を追加する。
 *
 * 対象 namespace (Phase 1-C-2-A 追加分):
 *   - competition     (CompetitionClient.tsx)
 *   - settings        (SettingsClient.tsx + components/settings/ 配下 6 ファイル)
 *   - practiceLogTemplates (practice-log-templates/ + PracticeLogTemplateSelectModal)
 *   - bulkBestTime    (BulkBestTimeClient.tsx)
 *   - common 追加キー (poolTypeLong / poolTypeShort)
 *
 * 対象コンポーネント:
 *   competition:
 *     CompetitionClient.tsx → ページヘッダー / フィルタラベル / テーブルヘッダー /
 *                             空状態テキスト / 詳細モーダル / 編集・削除ボタン /
 *                             プール種別表示 (長水路(50m) / 短水路(25m)) / シェアボタン
 *   settings:
 *     SettingsClient.tsx            → ページヘッダー
 *     SubscriptionSettings.tsx      → セクションタイトル / プラン表示 / トライアル残日数 /
 *                                     past_due バナー / PricingCard タイトル・期間・バッジ・
 *                                     機能リスト・ボタン / ポータルボタン
 *     PricingCard.tsx               → props 経由の文字列（SettingsClient から渡す）
 *     GoogleCalendarSyncSettings.tsx→ セクションタイトル / 連携状態 / チェックボックスラベル /
 *                                     一括同期ボタン / 解除ボタン / 同期結果メッセージ
 *     EmailChangeSettings.tsx       → セクションタイトル / isDummyEmail 切替テキスト /
 *                                     モーダルタイトル / 送信中ボタン
 *     IdentityLinkSettings.tsx      → セクションタイトル / 連携済み/未連携ラベル /
 *                                     解除確認 / 解除ボタン / 連携ボタン
 *     AccountDeleteSettings.tsx     → セクションタイトル / 説明文 / 削除ボタン /
 *                                     ConfirmDialog の title/message/confirmLabel/cancelLabel
 *   practiceLogTemplates:
 *     page.tsx                      → ページヘッダー
 *     PracticeLogTemplateList.tsx   → 保存済みカウント / 空状態 / お気に入りセクション /
 *                                     上限到達メッセージ / 新規作成ボタン
 *     PracticeLogTemplateCard.tsx   → お気に入り追加/削除 / メニュー / 編集/削除 /
 *                                     使用回数 / ConfirmDialog
 *     PracticeLogTemplateCreateModal.tsx → モーダルタイトル / フォームラベル / ボタン
 *     PracticeLogTemplateSelectModal.tsx → モーダルタイトル / 空状態 / 管理ボタン
 *   bulkBestTime:
 *     BulkBestTimeClient.tsx        → ページヘッダー / 種目タブ / テーブルヘッダー /
 *                                     エラー / 成功 / 登録ボタン / 入力済み件数
 *
 * Out of Scope（このテストでは検証しない）:
 *   - window.alert / window.confirm の文字列
 *   - aria-label / title 属性の文字列
 *   - API エラーレスポンス文字列
 *   - PricingCard の ¥500 / ¥5,000（Phase 2 以降課題）
 *   - 種目名 (practice.styles.* を流用)
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
// [V-C2A-01] competition namespace の必須キー確認
//
// 対象コンポーネント:
//   CompetitionClient.tsx →
//     ページヘッダー: タイトル / 説明文
//     ローディング・エラー状態
//     フィルター: 期間ラベル / 全期間 / 年度表示 / 種目ラベル / 全種目 / プール種別ラベル /
//                 すべて / 引き継ぎラベル / 含める / クリア / フィルタをリセット
//     空状態（記録なし）: タイトル / 説明
//     空状態（条件一致なし）: タイトル / 説明
//     テーブルヘッダー: 日付 / 大会名 / 場所 / 種目 / 記録 / プール
//     プール種別表示: 長水路(50m) / 短水路(25m)（詳細モーダル用、competition 専用キー）
//     行操作: 編集 / 削除 / 削除中...
//     詳細モーダル: タイトル / 大会記録セクション / シェアボタン / 閉じるボタン
// ---------------------------------------------------------------------------

describe("[V-C2A-01] competition namespace の必須キー確認", () => {
  const COMPETITION_REQUIRED_KEYS = [
    // ページヘッダー
    "competition.header.title",
    "competition.header.description",
    // ローディング・エラー
    "competition.loading",
    "competition.error",
    // フィルター
    "competition.filter.periodLabel",
    "competition.filter.allPeriods",
    "competition.filter.fiscalYearSuffix",
    "competition.filter.styleLabel",
    "competition.filter.allStyles",
    "competition.filter.poolTypeLabel",
    "competition.filter.allPoolTypes",
    "competition.filter.relayLabel",
    "competition.filter.includeRelay",
    "competition.filter.clearLabel",
    "competition.filter.resetButton",
    // 空状態（記録なし）
    "competition.empty.noRecordsTitle",
    "competition.empty.noRecordsDesc",
    // 空状態（条件一致なし）
    "competition.empty.noMatchTitle",
    "competition.empty.noMatchDesc",
    // テーブルヘッダー
    "competition.table.date",
    "competition.table.competitionName",
    "competition.table.place",
    "competition.table.style",
    "competition.table.time",
    "competition.table.pool",
    // プール種別（詳細モーダル用 - メートル付き、competition 専用キー）
    "competition.poolType.long",
    "competition.poolType.short",
    // 行操作ボタン
    "competition.actions.edit",
    "competition.actions.delete",
    "competition.actions.deleting",
    // 詳細モーダル
    "competition.detail.title",
    "competition.detail.recordSection",
    "competition.detail.share",
    "competition.detail.close",
  ] as const;

  for (const key of COMPETITION_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません (Phase 1-C-2-A 未実装)`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません (Phase 1-C-2-A 未実装)`).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C2A-02] settings namespace の必須キー確認
//
// 対象コンポーネント:
//   SettingsClient.tsx →
//     ページヘッダー: タイトル / 説明
//   SubscriptionSettings.tsx →
//     セクションタイトル / ローディング
//     プラン表示: 現在のプランラベル / 各ステータスバッジ
//     トライアル残日数テキスト ({days}日 / {date}まで)
//     past_due バナー: タイトル / 説明 / お支払い更新リンク
//     解約予定テキスト
//     次回更新日テキスト
//     プレミアム機能リスト × 3
//     月額プラン: タイトル / 期間
//     年額プラン: タイトル / 期間 / バッジ
//     PricingCard 共通: 機能一覧 / 選択ボタン / 現在のプランボタン / 処理中ボタン
//     プラン管理ボタン / 処理中テキスト
//     エラー汎用メッセージ
//   GoogleCalendarSyncSettings.tsx →
//     セクションタイトル / 連携中バッジ
//     非連携状態: 説明文 / 連携ボタン
//     連携済み状態: 練習同期ラベル / 大会同期ラベル
//     一括同期: 説明 / 実行ボタン / 同期中テキスト / 同期完了タイトル /
//               練習記録件数テキスト / 大会記録件数テキスト / エラー件数テキスト
//     解除ボタン
//   EmailChangeSettings.tsx →
//     セクションタイトル
//     isDummyEmail=true: 未登録テキスト / 登録するボタン / モーダルタイトル / 入力ラベル / 送信ボタン
//     isDummyEmail=false: メール表示 / 変更するボタン / モーダルタイトル / 入力ラベル / 送信ボタン
//     確認メール送信済みメッセージ / 送信中テキスト / キャンセルボタン / 閉じるボタン
//   IdentityLinkSettings.tsx →
//     セクションタイトル
//     連携済みラベル / 未連携ラベル
//     解除確認テキスト / 確認ボタン / キャンセルボタン / 解除するボタン / 解除中テキスト
//     連携するボタン / 連携中テキスト
//     最低1つ必要な旨の注釈
//   AccountDeleteSettings.tsx →
//     セクションタイトル / 説明文 / 削除ボタン / 削除中テキスト
//     ConfirmDialog: title / message / confirmLabel / cancelLabel
// ---------------------------------------------------------------------------

describe("[V-C2A-02] settings namespace の必須キー確認", () => {
  const SETTINGS_REQUIRED_KEYS = [
    // SettingsClient: ページヘッダー
    "settings.header.title",
    "settings.header.description",
    // SubscriptionSettings: セクションタイトル
    "settings.subscription.title",
    "settings.subscription.loading",
    // SubscriptionSettings: 現在のプランラベル
    "settings.subscription.currentPlanLabel",
    // SubscriptionSettings: ステータスバッジ
    "settings.subscription.badge.trialing",
    "settings.subscription.badge.pastDue",
    "settings.subscription.badge.premium",
    "settings.subscription.badge.free",
    // SubscriptionSettings: トライアル残日数
    "settings.subscription.trialDaysRemaining",
    // SubscriptionSettings: 更新日
    "settings.subscription.nextRenewal",
    // SubscriptionSettings: 解約予定
    "settings.subscription.cancelScheduled",
    // SubscriptionSettings: past_due バナー
    "settings.subscription.pastDueBanner.title",
    "settings.subscription.pastDueBanner.description",
    "settings.subscription.pastDueBanner.updatePayment",
    // SubscriptionSettings: PricingCard テキスト（SubscriptionSettings が渡す）
    "settings.subscription.monthlyPlan.title",
    "settings.subscription.monthlyPlan.period",
    "settings.subscription.yearlyPlan.title",
    "settings.subscription.yearlyPlan.period",
    "settings.subscription.yearlyPlan.badge",
    // SubscriptionSettings: プレミアム機能リスト
    "settings.subscription.premiumFeature.aiUnlimited",
    "settings.subscription.premiumFeature.noAds",
    "settings.subscription.premiumFeature.freeTrial",
    // PricingCard 内テキスト（共通）
    "settings.subscription.pricingCard.selectButton",
    "settings.subscription.pricingCard.currentPlanButton",
    "settings.subscription.pricingCard.processingButton",
    // SubscriptionSettings: 管理ボタン
    "settings.subscription.managePlanButton",
    "settings.subscription.managePlanProcessing",
    // GoogleCalendarSyncSettings: セクションタイトル
    "settings.googleCalendar.title",
    "settings.googleCalendar.connectedBadge",
    // GoogleCalendarSyncSettings: 非連携状態
    "settings.googleCalendar.disconnected.description",
    "settings.googleCalendar.disconnected.connectButton",
    // GoogleCalendarSyncSettings: 連携済み状態
    "settings.googleCalendar.connected.syncPracticesLabel",
    "settings.googleCalendar.connected.syncCompetitionsLabel",
    // GoogleCalendarSyncSettings: 一括同期
    "settings.googleCalendar.bulkSync.description",
    "settings.googleCalendar.bulkSync.button",
    "settings.googleCalendar.bulkSync.syncing",
    "settings.googleCalendar.bulkSync.successTitle",
    "settings.googleCalendar.bulkSync.practicesSuccess",
    "settings.googleCalendar.bulkSync.competitionsSuccess",
    "settings.googleCalendar.bulkSync.errorCount",
    // GoogleCalendarSyncSettings: 解除ボタン
    "settings.googleCalendar.disconnectButton",
    // EmailChangeSettings: セクションタイトル
    "settings.email.title",
    // EmailChangeSettings: 未登録状態 (isDummyEmail=true)
    "settings.email.notRegistered",
    "settings.email.registerButton",
    "settings.email.modal.registerTitle",
    "settings.email.modal.registerLabel",
    "settings.email.modal.registerSubmit",
    // EmailChangeSettings: 登録済み状態 (isDummyEmail=false)
    "settings.email.changeButton",
    "settings.email.modal.changeTitle",
    "settings.email.modal.currentEmail",
    "settings.email.modal.changeLabel",
    "settings.email.modal.changeSubmit",
    // EmailChangeSettings: 共通
    "settings.email.modal.sending",
    "settings.email.modal.successMessage",
    "settings.email.modal.cancelButton",
    "settings.email.modal.closeButton",
    // IdentityLinkSettings: セクションタイトル
    "settings.identity.title",
    // IdentityLinkSettings: 連携状態
    "settings.identity.linked",
    "settings.identity.notLinked",
    // IdentityLinkSettings: 解除フロー
    "settings.identity.unlinkConfirmText",
    "settings.identity.unlinkConfirmButton",
    "settings.identity.unlinkCancelButton",
    "settings.identity.unlinkButton",
    "settings.identity.unlinking",
    // IdentityLinkSettings: 連携フロー
    "settings.identity.linkButton",
    "settings.identity.linking",
    // IdentityLinkSettings: 最低1つ必要の注釈
    "settings.identity.minOneRequired",
    // AccountDeleteSettings: セクションタイトル
    "settings.accountDelete.title",
    "settings.accountDelete.description",
    "settings.accountDelete.deleteButton",
    "settings.accountDelete.deleting",
    // AccountDeleteSettings: ConfirmDialog
    "settings.accountDelete.confirmDialog.title",
    "settings.accountDelete.confirmDialog.message",
    "settings.accountDelete.confirmDialog.confirmLabel",
    "settings.accountDelete.confirmDialog.cancelLabel",
  ] as const;

  for (const key of SETTINGS_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません (Phase 1-C-2-A 未実装)`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません (Phase 1-C-2-A 未実装)`).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C2A-03] practiceLogTemplates namespace の必須キー確認
//
// 対象コンポーネント:
//   page.tsx (PracticeLogTemplatesPage) →
//     ページヘッダー: タイトル
//   PracticeLogTemplateList.tsx →
//     保存済みカウント ({count}/{max})
//     空状態: テキスト / 作成ボタン
//     お気に入りセクション: タイトル
//     全テンプレートセクション: タイトル
//     上限到達ボタン / 新規作成ボタン
//   PracticeLogTemplateCard.tsx →
//     お気に入り追加 / お気に入り削除（aria-label、スコープ外だが menu 内テキストは対象）
//     メニュー: 編集 / お気に入りに追加 / お気に入りから削除 / 削除
//     使用回数テキスト ({count}回)
//     ConfirmDialog: title / message / confirmLabel
//   PracticeLogTemplateCreateModal.tsx →
//     作成モード: タイトル
//     編集モード: タイトル
//     フォームラベル: テンプレート名 / 種目 / カテゴリ / 距離 / 本数 / セット /
//                    サークル / タグ / メモ
//     ボタン: 作成 / 更新 / 作成中 / 更新中 / キャンセル
//   PracticeLogTemplateSelectModal.tsx →
//     モーダルタイトル
//     空状態: テキスト / 作成リンク
//     お気に入りセクション: タイトル
//     全テンプレートセクション: タイトル
//     管理ボタン
// ---------------------------------------------------------------------------

describe("[V-C2A-03] practiceLogTemplates namespace の必須キー確認", () => {
  const PRACTICE_LOG_TEMPLATES_REQUIRED_KEYS = [
    // page.tsx: ページヘッダー
    "practiceLogTemplates.page.title",
    // PracticeLogTemplateList: カウント
    "practiceLogTemplates.list.savedCount",
    // PracticeLogTemplateList: 空状態
    "practiceLogTemplates.list.emptyText",
    "practiceLogTemplates.list.emptyCreateButton",
    // PracticeLogTemplateList: セクションタイトル
    "practiceLogTemplates.list.favoritesTitle",
    "practiceLogTemplates.list.allTemplatesTitle",
    // PracticeLogTemplateList: 上限・新規作成
    "practiceLogTemplates.list.atLimitButton",
    "practiceLogTemplates.list.createNewButton",
    // PracticeLogTemplateCard: メニュー内テキスト
    "practiceLogTemplates.card.menuEdit",
    "practiceLogTemplates.card.menuAddFavorite",
    "practiceLogTemplates.card.menuRemoveFavorite",
    "practiceLogTemplates.card.menuDelete",
    // PracticeLogTemplateCard: 使用回数
    "practiceLogTemplates.card.useCount",
    // PracticeLogTemplateCard: ConfirmDialog
    "practiceLogTemplates.card.deleteConfirm.title",
    "practiceLogTemplates.card.deleteConfirm.message",
    "practiceLogTemplates.card.deleteConfirm.confirmLabel",
    // PracticeLogTemplateCreateModal: タイトル
    "practiceLogTemplates.createModal.createTitle",
    "practiceLogTemplates.createModal.editTitle",
    // PracticeLogTemplateCreateModal: フォームラベル
    "practiceLogTemplates.createModal.nameLabel",
    "practiceLogTemplates.createModal.namePlaceholder",
    "practiceLogTemplates.createModal.styleLabel",
    "practiceLogTemplates.createModal.categoryLabel",
    "practiceLogTemplates.createModal.distanceLabel",
    "practiceLogTemplates.createModal.repLabel",
    "practiceLogTemplates.createModal.setLabel",
    "practiceLogTemplates.createModal.circleLabel",
    "practiceLogTemplates.createModal.circleMinUnit",
    "practiceLogTemplates.createModal.circleSecUnit",
    "practiceLogTemplates.createModal.tagLabel",
    "practiceLogTemplates.createModal.tagPlaceholder",
    "practiceLogTemplates.createModal.noteLabel",
    "practiceLogTemplates.createModal.notePlaceholder",
    // PracticeLogTemplateCreateModal: ボタン
    "practiceLogTemplates.createModal.createButton",
    "practiceLogTemplates.createModal.editButton",
    "practiceLogTemplates.createModal.creatingButton",
    "practiceLogTemplates.createModal.updatingButton",
    "practiceLogTemplates.createModal.cancelButton",
    // PracticeLogTemplateSelectModal: タイトル
    "practiceLogTemplates.selectModal.title",
    // PracticeLogTemplateSelectModal: 空状態
    "practiceLogTemplates.selectModal.emptyText",
    "practiceLogTemplates.selectModal.emptyCreateLink",
    // PracticeLogTemplateSelectModal: セクションタイトル
    "practiceLogTemplates.selectModal.favoritesTitle",
    "practiceLogTemplates.selectModal.allTemplatesTitle",
    // PracticeLogTemplateSelectModal: 管理ボタン
    "practiceLogTemplates.selectModal.manageButton",
  ] as const;

  for (const key of PRACTICE_LOG_TEMPLATES_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません (Phase 1-C-2-A 未実装)`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません (Phase 1-C-2-A 未実装)`).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C2A-04] bulkBestTime namespace の必須キー確認
//
// 対象コンポーネント:
//   BulkBestTimeClient.tsx →
//     ページヘッダー: タイトル / 説明文
//     種目タブ: 自由形 / 平泳ぎ / 背泳ぎ / バタフライ / 個人メドレー
//     テーブルヘッダー: 距離 / タイム / 備考 / 引き継ぎ
//     エラー: 登録データなし / タイム形式不正
//     成功: {n}件登録完了
//     フッター: 入力済み件数 ({count}件)
//     ボタン: 一括登録する / 登録中...
//     オンボーディング戻りリンク
//
// NOTE: 種目名 (自由形/平泳ぎ/背泳ぎ/バタフライ/個人メドレー) は practice.styles.* を流用する。
//       STYLE_TABS の name は bulkBestTime.tabs.* で新規定義する。
// ---------------------------------------------------------------------------

describe("[V-C2A-04] bulkBestTime namespace の必須キー確認", () => {
  const BULK_BEST_TIME_REQUIRED_KEYS = [
    // ページヘッダー
    "bulkBestTime.header.title",
    "bulkBestTime.header.description",
    // 種目タブ
    "bulkBestTime.tabs.fr",
    "bulkBestTime.tabs.br",
    "bulkBestTime.tabs.ba",
    "bulkBestTime.tabs.fly",
    "bulkBestTime.tabs.im",
    // テーブルヘッダー
    "bulkBestTime.table.distance",
    "bulkBestTime.table.time",
    "bulkBestTime.table.note",
    "bulkBestTime.table.relay",
    // エラーメッセージ
    "bulkBestTime.error.noData",
    "bulkBestTime.error.invalidTimeFormat",
    "bulkBestTime.error.partialFailure",
    // 成功メッセージ
    "bulkBestTime.success.registered",
    // フッター
    "bulkBestTime.footer.inputCount",
    // ボタン
    "bulkBestTime.button.register",
    "bulkBestTime.button.registering",
    // オンボーディング戻りリンク
    "bulkBestTime.returnToOnboarding",
  ] as const;

  for (const key of BULK_BEST_TIME_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません (Phase 1-C-2-A 未実装)`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません (Phase 1-C-2-A 未実装)`).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C2A-05] common.poolTypeLong / poolTypeShort の追加確認
//
// 判断2（PM 確定）: competition と bulkBestTime で共通の「長水路」「短水路」を
// common namespace に追加し、両エリアから流用する。
// ただし competition 詳細モーダルの「長水路(50m)」「短水路(25m)」は
// competition.poolType.long / competition.poolType.short の competition 専用キーで残す。
// ---------------------------------------------------------------------------

describe("[V-C2A-05] common.poolTypeLong / common.poolTypeShort の追加確認", () => {
  const COMMON_POOL_TYPE_KEYS = [
    "common.poolTypeLong",
    "common.poolTypeShort",
  ] as const;

  for (const key of COMMON_POOL_TYPE_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません`).toContain(key);
    });
  }

  it("ja.json の common.poolTypeLong が「長水路」である", () => {
    const value = getNestedValue(
      jaMessages as unknown as Record<string, unknown>,
      "common.poolTypeLong",
    );
    expect(value, "ja.json の common.poolTypeLong が「長水路」ではありません").toBe("長水路");
  });

  it("ja.json の common.poolTypeShort が「短水路」である", () => {
    const value = getNestedValue(
      jaMessages as unknown as Record<string, unknown>,
      "common.poolTypeShort",
    );
    expect(value, "ja.json の common.poolTypeShort が「短水路」ではありません").toBe("短水路");
  });

  it("en.json の common.poolTypeLong に日本語が含まれない", () => {
    const value = getNestedValue(
      enMessages as unknown as Record<string, unknown>,
      "common.poolTypeLong",
    );
    if (value !== undefined) {
      expect(containsJapanese(value), "en.json の common.poolTypeLong に日本語が含まれています").toBe(false);
    }
  });

  it("en.json の common.poolTypeShort に日本語が含まれない", () => {
    const value = getNestedValue(
      enMessages as unknown as Record<string, unknown>,
      "common.poolTypeShort",
    );
    if (value !== undefined) {
      expect(containsJapanese(value), "en.json の common.poolTypeShort に日本語が含まれています").toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// [V-C2A-06] en.json の Phase 1-C-2-A namespace 内に日本語が含まれないこと
// ---------------------------------------------------------------------------

describe("[V-C2A-06] en.json の Phase 1-C-2-A namespace に日本語が含まれないこと", () => {
  const PHASE_1C2A_NAMESPACES = [
    "competition",
    "settings",
    "practiceLogTemplates",
    "bulkBestTime",
  ] as const;

  for (const ns of PHASE_1C2A_NAMESPACES) {
    it(`en.json の namespace "${ns}" に日本語が含まれない (翻訳漏れゼロ)`, () => {
      const messages = enMessages as Record<string, unknown>;
      const nsValue = messages[ns];
      if (!nsValue) {
        // namespace 未存在は [V-C2A-0x] の各キーテストが検出するためここではスキップ
        return;
      }
      expect(
        containsJapanese(nsValue),
        `en.json の "${ns}" に日本語が含まれています。翻訳漏れキーを確認してください。`,
      ).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C2A-07] Phase 1-C-1 の必須キーがリグレッションしていないこと
//
// Phase 1-C-1 で確立した namespace のキーが Phase 1-C-2-A 実装後も維持されていること。
// Phase 1-B 以前のキーは phase1c1-messages.test.ts で検証済みのため、
// ここでは Phase 1-C-1 固有の namespace のサンプルキーを確認する。
// ---------------------------------------------------------------------------

describe("[V-C2A-07] Phase 1-C-1 必須キーのリグレッション防止", () => {
  const PHASE_1C1_REGRESSION_KEYS = [
    // dashboard
    "dashboard.stats.monthlyPractice.title",
    "dashboard.calendar.title",
    "dashboard.announcements.title",
    "dashboard.dayDetail.addRecord",
    "dashboard.deleteConfirm.title",
    // practice
    "practice.details.badge",
    "practice.details.loading",
    "practice.styles.Fr",
    "practice.styles.Br",
    // mypage
    "mypage.title",
    "mypage.profile.title",
    // onboarding
    "onboarding.step1.title",
    "onboarding.step2.nameLabel",
    "onboarding.step3.title",
    "onboarding.step3.poolTypeShort",
    "onboarding.step3.poolTypeLong",
    // sidebar
    "sidebar.nav.dashboard",
    "sidebar.settings",
    // footer
    "footer.description",
    "footer.links.privacy",
    "footer.services.title",
  ] as const;

  for (const key of PHASE_1C1_REGRESSION_KEYS) {
    it(`ja.json に "${key}" が維持されている (Phase 1-C-1 リグレッションなし)`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `ja.json から "${key}" が消えています (Phase 1-C-1 からのリグレッション)`,
      ).toContain(key);
    });

    it(`en.json に "${key}" が維持されている (Phase 1-C-1 リグレッションなし)`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `en.json から "${key}" が消えています (Phase 1-C-1 からのリグレッション)`,
      ).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C2A-08] ICU プレースホルダーの ja/en 対称確認
//
// 以下のキーは {count} / {n} / {days} / {date} / {max} 等のプレースホルダーを含む。
// ja と en で同じ変数名が使われていることを確認する。
// ---------------------------------------------------------------------------

describe("[V-C2A-08] ICU Message Format プレースホルダーの ja/en 対称確認", () => {
  const ICU_KEYS_TO_CHECK = [
    // competition
    "competition.filter.fiscalYearSuffix",
    // settings
    "settings.subscription.trialDaysRemaining",
    "settings.googleCalendar.bulkSync.practicesSuccess",
    "settings.googleCalendar.bulkSync.competitionsSuccess",
    "settings.googleCalendar.bulkSync.errorCount",
    // practiceLogTemplates
    "practiceLogTemplates.list.savedCount",
    "practiceLogTemplates.card.useCount",
    "practiceLogTemplates.card.deleteConfirm.message",
    // bulkBestTime
    "bulkBestTime.success.registered",
    "bulkBestTime.footer.inputCount",
  ] as const;

  for (const key of ICU_KEYS_TO_CHECK) {
    it(`"${key}" の ICU プレースホルダーが ja/en で対称である`, () => {
      const jaVal = getNestedValue(jaMessages as unknown as Record<string, unknown>, key);
      const enVal = getNestedValue(enMessages as unknown as Record<string, unknown>, key);

      // キー自体が未実装の場合はスキップ（キー存在チェックは [V-C2A-0x] が担当）
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
// [V-C2A-09] Phase 1-C-2-A 実装後の ja/en キー集合完全一致
//
// Phase 1-C-2-A 実装完了後に ja.json と en.json のキー集合が一致していること。
// どちらかにキーが欠損・余剰している場合はこのテストで検出する。
// ---------------------------------------------------------------------------

describe("[V-C2A-09] Phase 1-C-2-A 実装後の ja/en キー集合完全一致", () => {
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
