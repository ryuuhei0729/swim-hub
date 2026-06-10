/**
 * Phase 1-C-2-C-2: authenticated 中優先度（teams-admin 管理者専用コンポーネント）翻訳キー網羅テスト
 *
 * Sprint Contract 検証観点:
 *   [V-C2C2-01] teamsAdmin namespace の必須キーが ja/en 両方に存在する
 *   [V-C2C2-02] en.json の teamsAdmin namespace 内に日本語が含まれない
 *   [V-C2C2-03] Phase 1-C-1 / 1-C-2-A / 1-C-2-B / 1-C-2-C-1 リグレッション防止
 *   [V-C2C2-04] ICU プレースホルダーが ja/en で対称である
 *   [V-C2C2-05] ja/en キー集合が完全一致している
 *
 * NOTE: テスト本体は実装コードを参照しない。
 *       Sprint Contract で合意された namespace 構造・キー一覧に基づいて検証する。
 *       実装 (Web Developer) は ja.json / en.json に teamsAdmin namespace を追加する。
 *
 * 対象 namespace (Phase 1-C-2-C-2 追加分):
 *   - teamsAdmin (チーム管理者視点の全ページ・コンポーネント)
 *
 * 対象コンポーネントと責務:
 *
 * === app 層 (teams-admin/) ===
 *   AdminTeamsClient.tsx →
 *     ページヘッダー: タイトル (チーム管理) / 説明文 (管理者権限を持つチームの一覧)
 *     空状態: タイトル / 説明文 / (チーム作成は teams 側)
 *     管理者バッジ: ラベル
 *   TeamAdminClient.tsx →
 *     招待コードラベル
 *     チーム未発見エラー: タイトル / 説明文
 *     権限なしエラー: タイトル / 説明文
 *   PracticeLogClient.tsx (teams-admin/[teamId]/practices/[practiceId]/logs/) →
 *     ページタイトル / 戻るボタン
 *     参加者セクション / タイム記録セクション
 *     メニュー追加ボタン / 分割タイム追加ボタン
 *     保存ボタン (保存中...) / 記録削除ボタン (削除中...)
 *     動画アップロード関連ラベル
 *     OCR 読み取りボタン
 *   generateMetadata ([teamId]/page.tsx) →
 *     デフォルトタイトル (チーム管理)
 *   generateMetadata ([practiceId]/logs/page.tsx) →
 *     デフォルトタイトル (練習記録)
 *
 * === コンポーネント層 (components/team/ - 管理者向け) ===
 *   TeamAdminTabs.tsx →
 *     タブ: 出欠 / お知らせ / メンバー / グループ / 練習 / 大会 / 一括登録 / 設定
 *     ※ useTranslations フック制約のため配列定義を関数内へ移動が必要
 *   TeamSettings.tsx →
 *     セクションタイトル (チーム設定)
 *     チーム名ラベル / 説明ラベル / 説明なしテキスト
 *     チーム名必須エラー / 更新失敗エラー
 *     保存ボタン / 保存中テキスト / キャンセルボタン / 編集ボタン
 *   TeamAnnouncements.tsx →
 *     委譲のみ (AnnouncementList / AnnouncementForm / AnnouncementDetail)
 *   AnnouncementList.tsx →
 *     セクションタイトル (お知らせ) / 新規作成ボタン
 *     空状態テキスト
 *     下書きバッジ / 更新ラベル
 *     編集ボタン / 削除ボタン / 削除中テキスト
 *     読み込み失敗エラー / 再試行ボタン
 *     confirm() → ConfirmDialog 置き換えが必要 (Planner リスク #1)
 *   AnnouncementForm.tsx →
 *     モーダルタイトル (新規/編集): 新しいお知らせ / お知らせを編集
 *     閉じるボタン
 *     タイトルラベル / タイトルplaceholder
 *     内容ラベル / 内容placeholder
 *     開始日時ラベル / 終了日時ラベル
 *     終了日バリデーションエラー × 2 (過去 / 前後矛盾)
 *     下書きとして保存ボタン / キャンセルボタン / 公開ボタン
 *     保存中テキスト
 *   AnnouncementDetail.tsx →
 *     モーダルタイトル (お知らせ詳細)
 *     編集ボタン / 削除ボタン / 削除中テキスト / 閉じるボタン
 *     読み込み失敗エラー
 *     下書きバッジ / 作成ラベル / 更新ラベル / 表示期間ラベル
 *     開始ラベル (制限なし) / 終了ラベル (制限なし)
 *     期間外警告テキスト
 *     confirm() → ConfirmDialog 置き換えが必要 (Planner リスク #1)
 *   OcrScanModal.tsx →
 *     ステップタイトル: 画像から練習記録を読み取る / 画像を解析中 / 解析結果の確認
 *     ドロップゾーン: テキスト / ファイル形式説明
 *     バリデーションエラー: JPEG/PNG 以外 / 5MB 超過
 *     解析ボタン / キャンセルボタン
 *     解析中テキスト
 *     解析結果: セクションタイトル / 距離ラベル / 本数ラベル / サークルラベル
 *     テーブルヘッダー: No / メンバー / 種目
 *     未選択オプション / 選択済みサフィックス
 *     未割り当て警告テキスト
 *     やり直すボタン / フォームに反映ボタン
 *     破棄確認ダイアログ: タイトル / メッセージ ({count}件) / 確認ボタン / 戻るボタン
 *   AdminMonthlyAttendance.tsx →
 *     読み込み中テキスト / エラーテキスト
 *     未来イベントなしテキスト
 *     まとめて出欠状態を変更ボタン
 *   MembersTimeTable.tsx → ※一部すでに useTranslations 使用済み
 *     STYLES 配列の英語内部キー化 (Fr/Ba/Br/Fly/IM) → practice.styles.* 流用確認
 *
 * === コンポーネント層 (components/team/group-management/) ===
 *   TeamGroupManagement.tsx →
 *     ヘッダー: タイトル / 説明文
 *     グループ追加ボタン
 *     エラー表示テキスト
 *     空状態: タイトル / 説明文
 *     confirm() → ConfirmDialog 置き換えが必要 (Planner リスク #1)
 *   GroupFormModal.tsx →
 *     モーダルタイトル: グループを追加 / グループを編集
 *     カテゴリラベル / 既存から選択ボタン / 新規カテゴリボタン
 *     カテゴリ placeholder / カテゴリなしオプション
 *     カテゴリ説明テキスト
 *     グループ名ラベル / グループ名 placeholder (新規/編集)
 *     カンマ区切り説明テキスト
 *     キャンセルボタン / 保存中テキスト / 更新ボタン / 作成ボタン
 *   BulkAssignModal.tsx →
 *     モーダルタイトル ({category} — 一括振り分け)
 *     未割り当てゾーンラベル
 *     キャンセルボタン / 保存ボタン / 保存中テキスト
 *   CategorySection.tsx →
 *     未分類ラベル
 *     グループ数サフィックス ({count}グループ)
 *     一括振り分けボタン
 *   GroupMemberModal.tsx →
 *     モーダルタイトル ({groupName} のメンバー)
 *     検索 placeholder
 *     選択カウント ({selected}/{total} 人選択中)
 *     全選択ボタン / 全解除ボタン
 *     読み込み中テキスト / メンバーなしテキスト / 検索一致なしテキスト
 *     キャンセルボタン / 保存ボタン / 保存中テキスト
 *   GroupMemberListModal.tsx →
 *     メンバー数ラベル ({count}人のメンバー)
 *     空状態テキスト
 *   GroupCard.tsx →
 *     aria-label: メンバー一覧を表示 / メンバーを編集 / グループを編集 / グループを削除
 *     ※ aria-label のみで可視テキストなし
 *
 * === コンポーネント層 (components/admin-attendance/) ===
 *   EventListItem.tsx →
 *     受付中ボタン / 締切ボタン / 保存ボタン / 保存中テキスト
 *   BulkChangeModal.tsx →
 *     モーダルタイトル (まとめて出欠状態を変更)
 *     イベントなしテキスト
 *     ステータスラベル: 受付中 / 締切 / 未設定
 *     大会ラベル (括弧内)
 *     受付中にするボタン / 締切にするボタン
 *   AttendanceStatusModal.tsx →
 *     モーダルタイトル ({date}の出欠状況)
 *     読み込み中テキスト
 *   AttendanceGroupingDisplay.tsx →
 *     カテゴリヘッダー: 出席 ({count}名) / 欠席 / その他 / 未回答
 *     空状態テキスト (なし)
 *
 * === コンポーネント層 (components/bulk-register/) ===
 *   TemplateDownload.tsx →
 *     セクションタイトル (Excelテンプレートのダウンロード)
 *     練習一括登録: タイトル / ダウンロードボタン / 列説明テキスト
 *     大会一括登録: タイトル / ダウンロードボタン / 列説明テキスト
 *     ダウンロードエラー: 練習 / 大会
 *   FileUpload.tsx →
 *     セクションタイトル (ファイルをインポート)
 *     ファイルを選択ボタン
 *     説明テキスト / 読み込み中テキスト
 *   DataPreview.tsx →
 *     セクションタイトル (プレビュー)
 *     データ種別ラベル: 練習 / 大会
 *     エラーセクション: タイトル ({count}件) / リスト項目フォーマット
 *     練習テーブルヘッダー: 日付 / タイトル / 場所 / 備考
 *     大会テーブルヘッダー: 開始日 / 終了日 / 大会名 / 場所 / プール種別 / 備考
 *     「他 N 件」テキスト
 *     登録ボタン / 登録中テキスト
 *     プール種別: 25m / 50m
 *
 * Out of Scope:
 *   - window.confirm → ConfirmDialog 置き換えは Developer 実装時に対応 (Planner リスク #1)
 *   - window.alert → UI 通知 (toast 等) 置き換えは Developer 実装時に対応 (Planner リスク #2)
 *   - aria-label / title 属性のみでビジュアルテキストなしのもの (GroupCard のbutton title)
 *   - date-fns locale ハードコード (ja ロケール)
 *   - API エラーレスポンス文字列（サーバー由来）
 *   - console.error の文字列
 *   - SWIM_CATEGORIES の "Swim" / "Pull" / "Kick" (英語固定値)
 *   - SWIM_STYLES の内部 value ("Fr", "Ba" 等) — ラベル表示には practice.styles.* 流用
 *   - DataPreview のエラー行フォーマット ({sheet}シート {row}行目: {message}) → 動的結合
 *   - Phase 1-C-1 / 1-C-2-A / 1-C-2-B / 1-C-2-C-1 既存キーへの変更
 *
 * Boundary Cases (Planner が挙げたリスク):
 *   - TeamAdminTabs: 静的配列の useTranslations フック制約 → 配列定義を関数内に移動
 *   - MembersTimeTable: STYLES 配列がオブジェクトキーとして使用 → 英語内部キーへの変換マップ必要
 *   - PracticeLogClient: 約1200行、テンプレートリテラル動画エラー → 翻訳後のテンプレートリテラル禁止
 *   - confirm() / alert() の置き換え → ConfirmDialog / toast 実装が前提
 *   - generateMetadata: params が Promise<{locale: string}> → getTranslations({locale}) パターン
 *
 * 追加 QA 観点:
 *   - BulkAssignModal の動的タイトル ({category} — 一括振り分け) の ICU 対称
 *   - AttendanceGroupingDisplay の ({count}名) 補間
 *   - GroupMemberModal の ({selected}/{total} 人選択中) 補間
 *   - OcrScanModal の破棄確認ダイアログメッセージ ({count}件) 補間
 *   - CategorySection の ({count}グループ) 補間
 */

import { describe, it, expect } from "vitest";
import jaMessages from "../../../shared/messages/ja.json";
import enMessages from "../../../shared/messages/en.json";

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
    // ICU Message Format の変数名を抽出する。
    // 単純補間 ({count}) と plural/select 構文 ({count, plural, ...}) の両方に対応。
    // 正規表現: { の直後に続く識別子部分 (カンマ・空白・} で終わる前まで) を抽出する。
    const matches = value.match(/\{([a-zA-Z0-9_]+)/g);
    if (matches) {
      for (const m of matches) result.add(m.replace("{", ""));
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
// [V-C2C2-01] teamsAdmin namespace の必須キー確認
//
// 対象コンポーネント (管理者専用):
//   AdminTeamsClient.tsx → ページヘッダー / 空状態 / 管理者バッジ
//   TeamAdminClient.tsx → 招待コードラベル / チーム未発見 / 権限なし
//   TeamAdminTabs.tsx → タブ × 8 (useTranslations フック内移動が必要)
//   TeamSettings.tsx → ラベル / バリデーション / ボタン
//   AnnouncementList.tsx → ヘッダー / 下書き / ボタン / 空状態 / エラー
//   AnnouncementForm.tsx → モーダル / フォームラベル / バリデーション / ボタン
//   AnnouncementDetail.tsx → モーダル / バッジ / ラベル / 警告 / ボタン
//   OcrScanModal.tsx → ステップタイトル / ドロップゾーン / エラー / ボタン / テーブル
//   AdminMonthlyAttendance.tsx → ローディング / エラー / 空状態 / ボタン
//   TeamGroupManagement.tsx → ヘッダー / 空状態 / ボタン
//   GroupFormModal.tsx → タイトル / ラベル / ボタン
//   BulkAssignModal.tsx → タイトル / ゾーンラベル / ボタン
//   CategorySection.tsx → 未分類 / グループ数 / 一括振り分けボタン
//   GroupMemberModal.tsx → タイトル / 検索 / カウント / ボタン
//   GroupMemberListModal.tsx → メンバー数 / 空状態
//   GroupCard.tsx → aria-label × 3 (a11y 検証対象)
//   EventListItem.tsx → ステータスボタン / 保存ボタン
//   BulkChangeModal.tsx → タイトル / ステータス / ボタン
//   AttendanceStatusModal.tsx → タイトル / ローディング
//   AttendanceGroupingDisplay.tsx → カテゴリヘッダー × 4 / 空状態
//   TemplateDownload.tsx → タイトル / ボタン / 説明 / エラー
//   FileUpload.tsx → タイトル / ボタン / 説明
//   DataPreview.tsx → タイトル / ヘッダー / ボタン
// ---------------------------------------------------------------------------

describe("[V-C2C2-01] teamsAdmin namespace の必須キー確認", () => {
  const TEAMS_ADMIN_REQUIRED_KEYS = [
    // --------------------------------------------------------
    // AdminTeamsClient.tsx: ページヘッダー
    // --------------------------------------------------------
    "teamsAdmin.page.title",
    "teamsAdmin.page.description",

    // AdminTeamsClient.tsx: 空状態
    "teamsAdmin.page.emptyTitle",
    "teamsAdmin.page.emptyDescription",

    // AdminTeamsClient.tsx / TeamAdminClient.tsx: 管理者バッジ
    "teamsAdmin.badge.admin",

    // --------------------------------------------------------
    // TeamAdminClient.tsx: チーム未発見エラー
    // --------------------------------------------------------
    "teamsAdmin.client.notFound.title",
    "teamsAdmin.client.notFound.description",

    // TeamAdminClient.tsx: 権限なしエラー
    "teamsAdmin.client.unauthorized.title",
    "teamsAdmin.client.unauthorized.description",

    // TeamAdminClient.tsx: 招待コードラベル
    "teamsAdmin.client.inviteCodeLabel",

    // --------------------------------------------------------
    // TeamAdminTabs.tsx: タブ名 × 8
    // ※ useTranslations フック制約のため配列定義を関数内に移動して実装する
    // --------------------------------------------------------
    "teamsAdmin.tabs.attendance",
    "teamsAdmin.tabs.announcements",
    "teamsAdmin.tabs.members",
    "teamsAdmin.tabs.groups",
    "teamsAdmin.tabs.practices",
    "teamsAdmin.tabs.competitions",
    "teamsAdmin.tabs.bulkRegister",
    "teamsAdmin.tabs.settings",

    // --------------------------------------------------------
    // TeamSettings.tsx
    // --------------------------------------------------------
    "teamsAdmin.settings.title",
    "teamsAdmin.settings.nameLabel",
    "teamsAdmin.settings.descriptionLabel",
    "teamsAdmin.settings.noDescription",
    "teamsAdmin.settings.nameRequired",
    "teamsAdmin.settings.updateFailed",
    "teamsAdmin.settings.saveButton",
    "teamsAdmin.settings.saving",
    "teamsAdmin.settings.cancelButton",
    "teamsAdmin.settings.editButton",

    // --------------------------------------------------------
    // AnnouncementList.tsx
    // --------------------------------------------------------
    "teamsAdmin.announcementList.title",
    "teamsAdmin.announcementList.createButton",
    "teamsAdmin.announcementList.empty",
    "teamsAdmin.announcementList.draftBadge",
    "teamsAdmin.announcementList.updatedAtLabel",
    "teamsAdmin.announcementList.editButton",
    "teamsAdmin.announcementList.deleteButton",
    "teamsAdmin.announcementList.deleting",
    "teamsAdmin.announcementList.loadError",
    "teamsAdmin.announcementList.retry",
    // confirm() → ConfirmDialog で使用する確認ダイアログテキスト
    "teamsAdmin.announcementList.deleteConfirm.title",
    "teamsAdmin.announcementList.deleteConfirm.message",
    "teamsAdmin.announcementList.deleteConfirm.confirmButton",
    "teamsAdmin.announcementList.deleteConfirm.cancelButton",

    // --------------------------------------------------------
    // AnnouncementForm.tsx
    // --------------------------------------------------------
    "teamsAdmin.announcementForm.createTitle",
    "teamsAdmin.announcementForm.editTitle",
    "teamsAdmin.announcementForm.closeButton",
    "teamsAdmin.announcementForm.titleLabel",
    "teamsAdmin.announcementForm.titlePlaceholder",
    "teamsAdmin.announcementForm.contentLabel",
    "teamsAdmin.announcementForm.contentPlaceholder",
    "teamsAdmin.announcementForm.startAtLabel",
    "teamsAdmin.announcementForm.endAtLabel",
    "teamsAdmin.announcementForm.endAtPastError",
    "teamsAdmin.announcementForm.endAtBeforeStartError",
    "teamsAdmin.announcementForm.saveDraftButton",
    "teamsAdmin.announcementForm.cancelButton",
    "teamsAdmin.announcementForm.publishCreateButton",
    "teamsAdmin.announcementForm.publishUpdateButton",
    "teamsAdmin.announcementForm.saving",

    // --------------------------------------------------------
    // AnnouncementDetail.tsx
    // --------------------------------------------------------
    "teamsAdmin.announcementDetail.title",
    "teamsAdmin.announcementDetail.editButton",
    "teamsAdmin.announcementDetail.deleteButton",
    "teamsAdmin.announcementDetail.deleting",
    "teamsAdmin.announcementDetail.closeButton",
    "teamsAdmin.announcementDetail.loadError",
    "teamsAdmin.announcementDetail.draftBadge",
    "teamsAdmin.announcementDetail.createdAtLabel",
    "teamsAdmin.announcementDetail.updatedAtLabel",
    "teamsAdmin.announcementDetail.periodLabel",
    "teamsAdmin.announcementDetail.startLabel",
    "teamsAdmin.announcementDetail.endLabel",
    "teamsAdmin.announcementDetail.noLimit",
    "teamsAdmin.announcementDetail.outOfPeriodWarning",
    // confirm() → ConfirmDialog で使用する確認ダイアログテキスト
    "teamsAdmin.announcementDetail.deleteConfirm.title",
    "teamsAdmin.announcementDetail.deleteConfirm.message",
    "teamsAdmin.announcementDetail.deleteConfirm.confirmButton",
    "teamsAdmin.announcementDetail.deleteConfirm.cancelButton",

    // --------------------------------------------------------
    // OcrScanModal.tsx: ステップタイトル
    // --------------------------------------------------------
    "teamsAdmin.ocr.stepTitle.upload",
    "teamsAdmin.ocr.stepTitle.analyzing",
    "teamsAdmin.ocr.stepTitle.results",

    // OcrScanModal.tsx: アップロードステップ
    "teamsAdmin.ocr.upload.dropzoneText",
    "teamsAdmin.ocr.upload.dropzoneHint",
    "teamsAdmin.ocr.upload.invalidTypeError",
    "teamsAdmin.ocr.upload.fileSizeError",
    "teamsAdmin.ocr.upload.analyzeButton",
    "teamsAdmin.ocr.upload.cancelButton",

    // OcrScanModal.tsx: 解析中ステップ
    "teamsAdmin.ocr.analyzing.message",
    "teamsAdmin.ocr.analyzing.cancelButton",

    // OcrScanModal.tsx: 解析結果ステップ
    "teamsAdmin.ocr.results.sectionTitle",
    "teamsAdmin.ocr.results.distanceLabel",
    "teamsAdmin.ocr.results.repsLabel",
    "teamsAdmin.ocr.results.circleLabel",
    "teamsAdmin.ocr.results.col.no",
    "teamsAdmin.ocr.results.col.member",
    "teamsAdmin.ocr.results.col.style",
    "teamsAdmin.ocr.results.col.average",
    "teamsAdmin.ocr.results.col.repN",
    "teamsAdmin.ocr.results.unselectedOption",
    "teamsAdmin.ocr.results.alreadySelectedSuffix",
    "teamsAdmin.ocr.results.unassignedWarning",
    "teamsAdmin.ocr.results.retryButton",
    "teamsAdmin.ocr.results.cancelButton",
    "teamsAdmin.ocr.results.applyButton",

    // OcrScanModal.tsx: 破棄確認ダイアログ
    "teamsAdmin.ocr.discardConfirm.title",
    "teamsAdmin.ocr.discardConfirm.message",
    "teamsAdmin.ocr.discardConfirm.confirmButton",
    "teamsAdmin.ocr.discardConfirm.cancelButton",

    // --------------------------------------------------------
    // AdminMonthlyAttendance.tsx
    // --------------------------------------------------------
    "teamsAdmin.adminAttendance.loading",
    "teamsAdmin.adminAttendance.error",
    "teamsAdmin.adminAttendance.empty",
    "teamsAdmin.adminAttendance.bulkChangeButton",

    // --------------------------------------------------------
    // TeamGroupManagement.tsx
    // --------------------------------------------------------
    "teamsAdmin.groupManagement.title",
    "teamsAdmin.groupManagement.description",
    "teamsAdmin.groupManagement.addButton",
    "teamsAdmin.groupManagement.emptyTitle",
    "teamsAdmin.groupManagement.emptyDescription",
    // confirm() → ConfirmDialog で使用する確認ダイアログテキスト
    "teamsAdmin.groupManagement.deleteConfirm.title",
    "teamsAdmin.groupManagement.deleteConfirm.message",
    "teamsAdmin.groupManagement.deleteConfirm.confirmButton",
    "teamsAdmin.groupManagement.deleteConfirm.cancelButton",

    // --------------------------------------------------------
    // GroupFormModal.tsx
    // --------------------------------------------------------
    "teamsAdmin.groupForm.createTitle",
    "teamsAdmin.groupForm.editTitle",
    "teamsAdmin.groupForm.categoryLabel",
    "teamsAdmin.groupForm.selectExistingButton",
    "teamsAdmin.groupForm.newCategoryButton",
    "teamsAdmin.groupForm.noCategoryOption",
    "teamsAdmin.groupForm.categoryPlaceholder",
    "teamsAdmin.groupForm.categoryHint",
    "teamsAdmin.groupForm.nameLabel",
    "teamsAdmin.groupForm.namePlaceholderCreate",
    "teamsAdmin.groupForm.namePlaceholderEdit",
    "teamsAdmin.groupForm.multipleHint",
    "teamsAdmin.groupForm.cancelButton",
    "teamsAdmin.groupForm.saving",
    "teamsAdmin.groupForm.updateButton",
    "teamsAdmin.groupForm.createButton",

    // --------------------------------------------------------
    // BulkAssignModal.tsx
    // --------------------------------------------------------
    "teamsAdmin.bulkAssign.title",
    "teamsAdmin.bulkAssign.unassignedLabel",
    "teamsAdmin.bulkAssign.cancelButton",
    "teamsAdmin.bulkAssign.saveButton",
    "teamsAdmin.bulkAssign.saving",

    // --------------------------------------------------------
    // CategorySection.tsx
    // --------------------------------------------------------
    "teamsAdmin.categorySection.uncategorized",
    "teamsAdmin.categorySection.groupCount",
    "teamsAdmin.categorySection.bulkAssignButton",

    // --------------------------------------------------------
    // GroupMemberModal.tsx
    // --------------------------------------------------------
    "teamsAdmin.groupMember.title",
    "teamsAdmin.groupMember.searchPlaceholder",
    "teamsAdmin.groupMember.selectedCount",
    "teamsAdmin.groupMember.selectAll",
    "teamsAdmin.groupMember.deselectAll",
    "teamsAdmin.groupMember.loading",
    "teamsAdmin.groupMember.empty",
    "teamsAdmin.groupMember.noSearchResult",
    "teamsAdmin.groupMember.cancelButton",
    "teamsAdmin.groupMember.saveButton",
    "teamsAdmin.groupMember.saving",

    // --------------------------------------------------------
    // GroupMemberListModal.tsx
    // --------------------------------------------------------
    "teamsAdmin.groupMemberList.memberCount",
    "teamsAdmin.groupMemberList.empty",

    // --------------------------------------------------------
    // GroupCard.tsx: aria-label (a11y 検証対象)
    // --------------------------------------------------------
    "teamsAdmin.groupCard.viewMembersAriaLabel",
    "teamsAdmin.groupCard.manageAriaLabel",
    "teamsAdmin.groupCard.editAriaLabel",
    "teamsAdmin.groupCard.deleteAriaLabel",

    // --------------------------------------------------------
    // EventListItem.tsx
    // --------------------------------------------------------
    "teamsAdmin.eventListItem.openButton",
    "teamsAdmin.eventListItem.closedButton",
    "teamsAdmin.eventListItem.saveButton",
    "teamsAdmin.eventListItem.saving",

    // --------------------------------------------------------
    // BulkChangeModal.tsx
    // --------------------------------------------------------
    "teamsAdmin.bulkChange.title",
    "teamsAdmin.bulkChange.empty",
    "teamsAdmin.bulkChange.statusOpen",
    "teamsAdmin.bulkChange.statusClosed",
    "teamsAdmin.bulkChange.statusUnset",
    "teamsAdmin.bulkChange.competitionLabel",
    "teamsAdmin.bulkChange.openButton",
    "teamsAdmin.bulkChange.closedButton",

    // --------------------------------------------------------
    // AttendanceStatusModal.tsx
    // --------------------------------------------------------
    "teamsAdmin.attendanceStatus.loading",
    "teamsAdmin.attendanceStatus.titleSuffix",

    // --------------------------------------------------------
    // AttendanceGroupingDisplay.tsx
    // --------------------------------------------------------
    "teamsAdmin.attendanceGrouping.present",
    "teamsAdmin.attendanceGrouping.absent",
    "teamsAdmin.attendanceGrouping.other",
    "teamsAdmin.attendanceGrouping.unanswered",
    "teamsAdmin.attendanceGrouping.none",

    // --------------------------------------------------------
    // TemplateDownload.tsx
    // --------------------------------------------------------
    "teamsAdmin.templateDownload.title",
    "teamsAdmin.templateDownload.practice.title",
    "teamsAdmin.templateDownload.practice.downloadButton",
    "teamsAdmin.templateDownload.practice.columnHint",
    "teamsAdmin.templateDownload.practice.downloadError",
    "teamsAdmin.templateDownload.competition.title",
    "teamsAdmin.templateDownload.competition.downloadButton",
    "teamsAdmin.templateDownload.competition.columnHint",
    "teamsAdmin.templateDownload.competition.downloadError",

    // --------------------------------------------------------
    // FileUpload.tsx
    // --------------------------------------------------------
    "teamsAdmin.fileUpload.title",
    "teamsAdmin.fileUpload.selectButton",
    "teamsAdmin.fileUpload.hint",
    "teamsAdmin.fileUpload.loading",

    // --------------------------------------------------------
    // DataPreview.tsx
    // --------------------------------------------------------
    "teamsAdmin.dataPreview.title",
    "teamsAdmin.dataPreview.practiceType",
    "teamsAdmin.dataPreview.competitionType",
    "teamsAdmin.dataPreview.errorTitle",
    "teamsAdmin.dataPreview.practiceCount",
    "teamsAdmin.dataPreview.competitionCount",
    "teamsAdmin.dataPreview.practice.col.date",
    "teamsAdmin.dataPreview.practice.col.title",
    "teamsAdmin.dataPreview.practice.col.place",
    "teamsAdmin.dataPreview.practice.col.note",
    "teamsAdmin.dataPreview.competition.col.startDate",
    "teamsAdmin.dataPreview.competition.col.endDate",
    "teamsAdmin.dataPreview.competition.col.name",
    "teamsAdmin.dataPreview.competition.col.place",
    "teamsAdmin.dataPreview.competition.col.poolType",
    "teamsAdmin.dataPreview.competition.col.note",
    "teamsAdmin.dataPreview.moreItems",
    "teamsAdmin.dataPreview.registerButton",
    "teamsAdmin.dataPreview.registering",
    "teamsAdmin.dataPreview.poolShort",
    "teamsAdmin.dataPreview.poolLong",

    // --------------------------------------------------------
    // AdminMonthlyAttendance.tsx (追加キー: Phase 1-C-2-C-2 新規)
    // --------------------------------------------------------
    "teamsAdmin.adminAttendance.eventDefault.competition",
    "teamsAdmin.adminAttendance.eventDefault.practice",

    // --------------------------------------------------------
    // TeamGroupManagement.tsx (追加キー: Phase 1-C-2-C-2 新規)
    // --------------------------------------------------------
    "teamsAdmin.groupManagement.memberCount",

    // --------------------------------------------------------
    // GroupMemberListModal.tsx (追加キー: Phase 1-C-2-C-2 新規)
    // --------------------------------------------------------
    "teamsAdmin.groupMemberList.noNameLabel",
    "teamsAdmin.groupMemberList.viewDetailAriaLabel",

    // --------------------------------------------------------
    // PracticeLogClient.tsx
    // --------------------------------------------------------
    "teamsAdmin.practiceLog.backButton",
    "teamsAdmin.practiceLog.participantsSection",
    "teamsAdmin.practiceLog.timesSection",
    "teamsAdmin.practiceLog.addMenuButton",
    "teamsAdmin.practiceLog.addSplitButton",
    "teamsAdmin.practiceLog.saveButton",
    "teamsAdmin.practiceLog.saving",
    "teamsAdmin.practiceLog.deleteButton",
    "teamsAdmin.practiceLog.deleting",
    "teamsAdmin.practiceLog.ocrButton",

    // PracticeLogClient.tsx (追加キー: Phase 1-C-2-C-2 新規)
    "teamsAdmin.practiceLog.pageTitle",
    "teamsAdmin.practiceLog.titleAdd",
    "teamsAdmin.practiceLog.titleEdit",
    "teamsAdmin.practiceLog.subtitle",
    "teamsAdmin.practiceLog.printButton",
    "teamsAdmin.practiceLog.closeError",
    "teamsAdmin.practiceLog.cancelButton",
    "teamsAdmin.practiceLog.menuTitle",
    "teamsAdmin.practiceLog.style1Label",
    "teamsAdmin.practiceLog.style2Label",
    "teamsAdmin.practiceLog.distanceLabel",
    "teamsAdmin.practiceLog.repsLabel",
    "teamsAdmin.practiceLog.setsLabel",
    "teamsAdmin.practiceLog.circleMinLabel",
    "teamsAdmin.practiceLog.circleSecLabel",
    "teamsAdmin.practiceLog.selectUsersButton",
    "teamsAdmin.practiceLog.selectedCount",
    "teamsAdmin.practiceLog.videoLabel",
    "teamsAdmin.practiceLog.videoHas",
    "teamsAdmin.practiceLog.videoSelect",
    "teamsAdmin.practiceLog.tagLabel",
    "teamsAdmin.practiceLog.memoLabel",
    "teamsAdmin.practiceLog.memoPlaceholder",
    "teamsAdmin.practiceLog.timeInputSummary",
    "teamsAdmin.practiceLog.timeInputOptional",
    "teamsAdmin.practiceLog.timeInputButton",
    "teamsAdmin.practiceLog.recordedTimesTitle",
    "teamsAdmin.practiceLog.recordedCount",
    "teamsAdmin.practiceLog.setRepLabel",
    "teamsAdmin.practiceLog.userSelectModalTitle",
    "teamsAdmin.practiceLog.selectAllButton",
    "teamsAdmin.practiceLog.selectPresentButton",
    "teamsAdmin.practiceLog.deselectButton",
    "teamsAdmin.practiceLog.userSelectFooterCount",
    "teamsAdmin.practiceLog.confirmButton",
    "teamsAdmin.practiceLog.attendingBadge",
    "teamsAdmin.practiceLog.adminBadge",
    "teamsAdmin.practiceLog.overwriteConfirm.title",
    "teamsAdmin.practiceLog.overwriteConfirm.message",
    "teamsAdmin.practiceLog.overwriteConfirm.confirmLabel",
    "teamsAdmin.practiceLog.overwriteConfirm.cancelLabel",
    "teamsAdmin.practiceLog.overwriteConfirm.tertiaryLabel",
    "teamsAdmin.practiceLog.errorAtLeastOne",
    "teamsAdmin.practiceLog.errorSave",
    "teamsAdmin.practiceLog.errorSaveWithMessage",
    "teamsAdmin.practiceLog.errorVideoUpload",

    // --------------------------------------------------------
    // BulkRegister (追加キー: Phase 1-C-2-C-2 新規)
    // --------------------------------------------------------
    "teamsAdmin.bulkRegister.wrapperTitle",
    "teamsAdmin.bulkRegister.unauthorized.title",
    "teamsAdmin.bulkRegister.unauthorized.description",
    "teamsAdmin.bulkRegister.result.title",
    "teamsAdmin.bulkRegister.result.practicesCreated",
    "teamsAdmin.bulkRegister.result.competitionsCreated",
    "teamsAdmin.bulkRegister.result.errors",

    // --------------------------------------------------------
    // common (追加キー: Phase 1-C-2-C-2 新規)
    // --------------------------------------------------------
    "teamsAdmin.common.close",
  ] as const;

  for (const key of TEAMS_ADMIN_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `ja.json に "${key}" が存在しません (Phase 1-C-2-C-2 未実装)`,
      ).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `en.json に "${key}" が存在しません (Phase 1-C-2-C-2 未実装)`,
      ).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C2C2-02] en.json の teamsAdmin namespace 内に日本語が含まれないこと
// ---------------------------------------------------------------------------

describe("[V-C2C2-02] en.json の teamsAdmin namespace に日本語が含まれないこと", () => {
  it('en.json の namespace "teamsAdmin" に日本語が含まれない (翻訳漏れゼロ)', () => {
    const messages = enMessages as Record<string, unknown>;
    const nsValue = messages["teamsAdmin"];
    if (!nsValue) {
      // namespace 未存在は [V-C2C2-01] の各キーテストが検出するためここではスキップ
      return;
    }
    expect(
      containsJapanese(nsValue),
      'en.json の "teamsAdmin" に日本語が含まれています。翻訳漏れキーを確認してください。',
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// [V-C2C2-03] Phase 1-C-1 / 1-C-2-A / 1-C-2-B / 1-C-2-C-1 必須キーのリグレッション防止
//
// Phase 1-C-2-C-2 実装後も以前のフェーズのキーが維持されていることを確認。
// ---------------------------------------------------------------------------

describe("[V-C2C2-03] Phase 1-C-1 / 1-C-2-A / 1-C-2-B / 1-C-2-C-1 必須キーのリグレッション防止", () => {
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
    // Phase 1-C-2-B: goals
    "goals.page.title",
    "goals.list.empty",
    "goals.create.title",
    "goals.milestone.empty",
    "goals.form.competitionLabel",
    // Phase 1-C-2-C-1: teams (メンバー向け)
    "teams.page.title",
    "teams.tabs.attendance",
    "teams.tabs.members",
    "teams.members.title",
    "teams.attendanceStatus.present",
    "teams.attendanceStatus.absent",
  ] as const;

  for (const key of REGRESSION_KEYS) {
    it(`ja.json に "${key}" が維持されている`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `ja.json から "${key}" が消えています (Phase 1-C-1/1-C-2-A/1-C-2-B/1-C-2-C-1 からのリグレッション)`,
      ).toContain(key);
    });

    it(`en.json に "${key}" が維持されている`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `en.json から "${key}" が消えています (Phase 1-C-1/1-C-2-A/1-C-2-B/1-C-2-C-1 からのリグレッション)`,
      ).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C2C2-04] ICU Message Format プレースホルダーの ja/en 対称確認
//
// teamsAdmin namespace 内で {variable} プレースホルダーを使用するキーを確認する。
// ---------------------------------------------------------------------------

describe("[V-C2C2-04] ICU Message Format プレースホルダーの ja/en 対称確認", () => {
  const ICU_KEYS_TO_CHECK = [
    // OcrScanModal 破棄確認: {count}件
    "teamsAdmin.ocr.discardConfirm.message",
    // BulkAssignModal タイトル: {category} — 一括振り分け
    "teamsAdmin.bulkAssign.title",
    // CategorySection グループ数: {count}グループ
    "teamsAdmin.categorySection.groupCount",
    // GroupMemberModal 選択カウント: {selected}/{total} 人選択中
    "teamsAdmin.groupMember.selectedCount",
    // GroupMemberListModal メンバー数: {count}人のメンバー
    "teamsAdmin.groupMemberList.memberCount",
    // AttendanceGroupingDisplay カテゴリヘッダー: 出席 ({count}名) 等
    "teamsAdmin.attendanceGrouping.present",
    "teamsAdmin.attendanceGrouping.absent",
    "teamsAdmin.attendanceGrouping.other",
    "teamsAdmin.attendanceGrouping.unanswered",
    // DataPreview エラー件数: {count}件
    "teamsAdmin.dataPreview.errorTitle",
    // DataPreview 練習/大会件数
    "teamsAdmin.dataPreview.practiceCount",
    "teamsAdmin.dataPreview.competitionCount",
    // DataPreview 残件数
    "teamsAdmin.dataPreview.moreItems",
  ] as const;

  for (const key of ICU_KEYS_TO_CHECK) {
    it(`"${key}" の ICU プレースホルダーが ja/en で対称である`, () => {
      const jaVal = getNestedValue(jaMessages as unknown as Record<string, unknown>, key);
      const enVal = getNestedValue(enMessages as unknown as Record<string, unknown>, key);

      // キー自体が未実装の場合はスキップ（キー存在チェックは [V-C2C2-01] が担当）
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
// [V-C2C2-01-DYNAMIC] teamsAdmin namespace 全キー動的網羅
//
// TEAMS_ADMIN_REQUIRED_KEYS がハードコード漏れを起こすリスクを補完するため、
// ja.json の teamsAdmin namespace を動的に走査して en.json との対称性を検証する。
// Web Developer が新規キーを追加しても自動で検出できる。
// ---------------------------------------------------------------------------

describe("[V-C2C2-01-DYNAMIC] teamsAdmin namespace 全キー動的網羅", () => {
  const jaTeamsAdminKeys = flattenKeys(
    (jaMessages as unknown as Record<string, unknown>)["teamsAdmin"] as Record<
      string,
      unknown
    >,
    "teamsAdmin",
  ).sort();
  const enTeamsAdminKeys = flattenKeys(
    (enMessages as unknown as Record<string, unknown>)["teamsAdmin"] as Record<
      string,
      unknown
    >,
    "teamsAdmin",
  ).sort();

  it("ja.json と en.json の teamsAdmin キー集合が完全一致する", () => {
    expect(
      enTeamsAdminKeys,
      `ja/en で teamsAdmin キー集合が一致しません。\nja only: ${jaTeamsAdminKeys.filter((k) => !enTeamsAdminKeys.includes(k)).join(", ")}\nen only: ${enTeamsAdminKeys.filter((k) => !jaTeamsAdminKeys.includes(k)).join(", ")}`,
    ).toEqual(jaTeamsAdminKeys);
  });

  test.each(jaTeamsAdminKeys)(
    "%s が ja/en 両方に存在し空文字でない",
    (key) => {
      const jaVal = getNestedValue(
        jaMessages as unknown as Record<string, unknown>,
        key,
      );
      const enVal = getNestedValue(
        enMessages as unknown as Record<string, unknown>,
        key,
      );
      expect(jaVal, `ja.json の "${key}" が空または未定義です`).toBeTruthy();
      expect(enVal, `en.json の "${key}" が空または未定義です`).toBeTruthy();
    },
  );
});

// ---------------------------------------------------------------------------
// [V-C2C2-04-DYNAMIC] ICU プレースホルダー動的対称チェック
//
// teamsAdmin namespace 内の全文字列キーを動的に走査し、
// ICU プレースホルダーが ja/en で対称かを検証する。
// Phase 1-C-2-C-2 で追加された新規キーも自動でカバーする。
// ---------------------------------------------------------------------------

describe("[V-C2C2-04-DYNAMIC] ICU プレースホルダー動的対称チェック (teamsAdmin 全キー)", () => {
  const jaTeamsAdminKeys = flattenKeys(
    (jaMessages as unknown as Record<string, unknown>)["teamsAdmin"] as Record<
      string,
      unknown
    >,
    "teamsAdmin",
  );

  test.each(jaTeamsAdminKeys)(
    "%s の ICU プレースホルダーが ja/en で対称",
    (key) => {
      const jaVal = getNestedValue(
        jaMessages as unknown as Record<string, unknown>,
        key,
      );
      const enVal = getNestedValue(
        enMessages as unknown as Record<string, unknown>,
        key,
      );

      // 片方が未定義の場合は [V-C2C2-01-DYNAMIC] が検出するためここではスキップ
      if (typeof jaVal !== "string" || typeof enVal !== "string") return;

      const jaPlaceholders = extractPlaceholders(jaVal);
      const enPlaceholders = extractPlaceholders(enVal);

      for (const placeholder of jaPlaceholders) {
        expect(
          enPlaceholders.has(placeholder),
          `"${key}": ja には ${placeholder} があるが en にはない (ja: "${jaVal}", en: "${enVal}")`,
        ).toBe(true);
      }

      for (const placeholder of enPlaceholders) {
        expect(
          jaPlaceholders.has(placeholder),
          `"${key}": en には ${placeholder} があるが ja にはない (ja: "${jaVal}", en: "${enVal}")`,
        ).toBe(true);
      }
    },
  );
});

// ---------------------------------------------------------------------------
// [V-C2C2-05] Phase 1-C-2-C-2 実装後の ja/en キー集合完全一致
//
// Phase 1-C-2-C-2 実装完了後に ja.json と en.json のキー集合が一致していること。
// ---------------------------------------------------------------------------

describe("[V-C2C2-05] Phase 1-C-2-C-2 実装後の ja/en キー集合完全一致", () => {
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
