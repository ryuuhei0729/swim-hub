/**
 * Phase 1-C-2-C-1: authenticated 中優先度（teams エリア + メンバー向け共通コンポーネント）翻訳キー網羅テスト
 *
 * Sprint Contract 検証観点:
 *   [V-C2C1-01] teams namespace の必須キーが ja/en 両方に存在する
 *   [V-C2C1-02] en.json の teams namespace 内に日本語が含まれない
 *   [V-C2C1-03] Phase 1-C-1 / 1-C-2-A / 1-C-2-B リグレッション防止
 *   [V-C2C1-04] ICU プレースホルダーが ja/en で対称である
 *   [V-C2C1-05] ja/en キー集合が完全一致している
 *   [V-C2C1-06] common namespace への追加キー（招待コード関連）が存在する
 *
 * NOTE: テスト本体は実装コードを参照しない。
 *       Sprint Contract で合意された namespace 構造・キー一覧に基づいて検証する。
 *       実装 (Web Developer) は ja.json / en.json に teams namespace を追加する。
 *
 * 対象 namespace (Phase 1-C-2-C-1 追加分):
 *   - teams (チームメンバー視点の全ページ・コンポーネント)
 *
 * 対象コンポーネントと責務:
 *
 * === app 層 (teams/) ===
 *   TeamsClient.tsx →
 *     ページヘッダー: タイトル (マイチーム) / 説明文
 *     承認待ちセクション: セクションタイトル ({count}件) / 読み込み中テキスト /
 *                         招待コードラベル / 承認待ちテキスト (招待コードあり/なし)
 *     空状態: タイトル / 説明文 / チーム作成ボタン / チーム参加ボタン
 *     管理者バッジ: ラベル
 *   TeamDetailClient.tsx →
 *     チームが見つからない: タイトル / 説明文
 *     招待コードラベル
 *   error.tsx (teams/) →
 *     エラータイトル / エラー説明文 / 再試行ボタン
 *   loading.tsx (teams/) →
 *     ローディングテキスト
 *   error.tsx (teams/[teamId]/) →
 *     エラータイトル / エラー説明文 / 再試行ボタン
 *   loading.tsx (teams/[teamId]/) →
 *     ローディングテキスト
 *   RecordClient.tsx →
 *     ページタイトル / 戻るボタン
 *     参加者ヘッダー / タイム記録セクション / 分割タイム追加 /
 *     記録保存ボタン / 記録削除ボタン / 削除中テキスト
 *     リレー種目ラベル / ゾーン配分テキスト
 *     無料プラン上限通知テキスト
 *   buildStyleEntries.ts →
 *     種目エントリーのラベル (Out of Scope: 水泳種目名は practice.styles.* 流用)
 *   relayEvents.ts →
 *     リレー種目名 × 多数 (Out of Scope: スポーツ固有の英語略称は i18n 対象外)
 *
 * === コンポーネント層 (components/team/ - メンバー向け) ===
 *   TeamTabs.tsx →
 *     タブ: 出欠 / メンバー / 練習 / 大会
 *   TeamCreateModal.tsx →
 *     エラーヘッダー: エラー見出し / 閉じるボタン
 *     (フォーム文字列は forms/ 配下 TeamCreateForm が担当 - 別途対応)
 *   TeamJoinModal.tsx →
 *     モーダルタイトル (チームに参加)
 *     (フォーム文字列は forms/ 配下 TeamJoinForm が担当 - 別途対応)
 *   TeamMembers.tsx →
 *     ヘッダー: タイトル ({count}人) / メンバー招待ボタン
 *     参加日ラベル
 *     空状態テキスト
 *     招待モーダル: タイトル / 説明文 / 招待コードラベル / コピーボタン / 閉じるボタン
 *     エラー: メッセージ / 再試行ボタン
 *   TeamPractices.tsx →
 *     ヘッダータイトル / 練習追加ボタン
 *     空状態テキスト
 *     練習カード: 日付ラベル / 場所ラベル / ログなしテキスト / 詳細ボタン / 管理ボタン
 *     エラー: メッセージ / 再試行ボタン
 *   TeamPracticeDetailModal.tsx →
 *     モーダルタイトル / 閉じるボタン
 *     場所ラベル / メモラベル / ログセクションタイトル / 種目ラベル / 距離ラベル
 *     ログなしテキスト
 *   TeamCompetitions.tsx →
 *     ヘッダータイトル / 大会追加ボタン
 *     空状態テキスト
 *     大会カード: 日付ラベル / 場所ラベル / エントリーステータスラベル /
 *                 エントリーボタン / 記録一覧ボタン / 管理ボタン
 *     エントリーステータス: 受付前 / 受付中 / 締切
 *     エラー: メッセージ / 再試行ボタン
 *   TeamCompetitionEntryModal.tsx →
 *     モーダルタイトル / 閉じるボタン
 *     エントリーフォームラベル (種目 / エントリータイム)
 *     ボタン: 登録 / 更新 / 削除 / キャンセル
 *   TeamCompetitionRecordsModal.tsx →
 *     モーダルタイトル / 閉じるボタン
 *     記録なしテキスト
 *     テーブルヘッダー: 選手名 / タイム
 *   TeamRecords.tsx →
 *     ヘッダータイトル
 *     空状態テキスト / エラーテキスト
 *     テーブルヘッダー: 種目 / 距離 / タイム / 大会 / 日付
 *   MemberDetailModal.tsx →
 *     モーダルタイトル / 閉じるボタン
 *     ベストタイムセクション: タイトル / 空状態テキスト
 *     テーブルヘッダー: 種目 / 距離 / タイム / 日付
 *     ロールラベル: 管理者 / メンバー
 *     脱退ボタン / 除名ボタン
 *   MyMonthlyAttendance (wrapper) →
 *     読み込み中テキスト / エラーテキスト
 *     月ラベル ({year}年{month}月)
 *   member-management/components/PendingMembersSection.tsx →
 *     セクションタイトル / 承認ボタン / 却下ボタン / 空状態テキスト
 *   member-management/components/MemberStatsHeader.tsx →
 *     ヘッダータイトル ({count}人)
 *   member-management/components/MembersTimeTable.tsx →
 *     テーブルヘッダー: 名前 / 各種目 (practice.styles.* 流用) / 総距離
 *     空状態テキスト
 *   member-management/components/MemberGroupSorter.tsx →
 *     グループ並び替えラベル
 *   member-management/hooks/useMembershipActions.ts →
 *     承認成功 / 承認失敗 / 却下成功 / 却下失敗 (toast メッセージ)
 *   member-management/hooks/useMembers.ts →
 *     データ取得失敗メッセージ
 *   member-management/hooks/usePendingMembers.ts →
 *     データ取得失敗メッセージ
 *   member-management/hooks/useMemberSort.ts →
 *     ソートオプション: 名前順 / 参加日順 / ロール順 (Out of Scope 候補)
 *   monthly-attendance/components/MonthList.tsx →
 *     セクションタイトル / 空状態テキスト
 *     月の出欠率ラベル
 *   monthly-attendance/components/RecentAttendance.tsx →
 *     セクションタイトル / 空状態テキスト / 保存ボタン
 *   monthly-attendance/components/MonthDetailModal.tsx →
 *     モーダルタイトル / 閉じるボタン / 保存ボタン / 保存中テキスト
 *     エラーテキスト / ローディングテキスト
 *   monthly-attendance/components/StatusBadge.tsx →
 *     ステータス: 出席 / 欠席 / 遅刻 / 早退 / 未回答
 *   monthly-attendance/components/AttendanceStatusModal.tsx →
 *     モーダルタイトル / 閉じるボタン
 *     出欠ステータス列ヘッダー / メンバー列ヘッダー
 *   monthly-attendance/components/AttendanceGroupingDisplay.tsx →
 *     グルーピング表示: カテゴリラベル
 *   monthly-attendance/hooks/useAttendanceEdit.ts →
 *     保存失敗メッセージ
 *   monthly-attendance/hooks/useAttendanceStatus.ts →
 *     データ取得失敗メッセージ
 *   monthly-attendance/hooks/useMonthDetail.ts →
 *     データ取得失敗メッセージ
 *   monthly-attendance/hooks/useMonthList.ts →
 *     データ取得失敗メッセージ
 *   monthly-attendance/hooks/useRecentAttendance.ts →
 *     データ取得失敗メッセージ / 保存成功メッセージ
 *   entry/CompetitionCard.tsx →
 *     エントリーステータスラベル / 場所ラベル
 *   entry/EntryForm.tsx →
 *     フォームラベル: 種目 / エントリータイム
 *     ボタン: 登録 / 更新 / 削除 / キャンセル / 処理中
 *   entry/EntryItem.tsx →
 *     エントリー済みラベル
 *   entry/EntryList.tsx →
 *     空状態テキスト
 *   shared/hooks/useMemberBestTimes.ts →
 *     データ取得失敗メッセージ
 *   shared/hooks/useTimeValidation.ts →
 *     バリデーションエラーメッセージ (タイム形式不正 / 必須)
 *
 * Out of Scope（前フェーズから継承）:
 *   - window.alert / window.confirm のハードコード
 *   - aria-label / title 属性
 *   - date-fns locale ハードコード (ja ロケール)
 *   - API エラーレスポンス文字列（サーバー由来）
 *   - AI Bias 系（既存コードの問題）
 *   - Phase 1-C-1 / 1-C-2-A / 1-C-2-B 既存キーへの変更
 *   - relayEvents.ts の種目名 (英語略称固定値: 4x100m Fr 等)
 *   - buildStyleEntries.ts の水泳種目名 (practice.styles.* 流用)
 *   - TeamMemberManagement の index.ts / index 再エクスポート
 *   - title 属性 (「コピー」「管理者」等の title= 値) ← スコープ外
 *   - console.error の文字列
 *   - 1-C-2-C-2 スコープ (teamsAdmin 管理者専用コンポーネント)
 *
 * Boundary Cases:
 *   - 承認待ち件数 0 件時のセクション非表示
 *   - 承認待ちに招待コードが null の場合のフォールバックテキスト
 *   - チーム一覧が空の場合の空状態 (displayTeams.length === 0 かつ pendingTeams.length === 0)
 *   - メンバー 0 人のチーム
 *   - 練習・大会記録が 0 件の場合
 *   - 出欠ステータス「未回答」(null / undefined) の表示
 *
 * Risks:
 *   - 規模が大きいため、実装時に漏れキーが発生する可能性がある
 *   - monthly-attendance/ の hooks に日本語エラー文字列が多数あり、
 *     useTranslations をフックに渡す設計が必要
 *   - RelayEvents.ts の種目名は英語固定のため i18n 対象外と明示が必要
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
// [V-C2C1-01] teams namespace の必須キー確認
//
// 対象コンポーネント:
//   TeamsClient.tsx → ページヘッダー / 承認待ちセクション / 空状態 / 管理者バッジ
//   TeamDetailClient.tsx → チーム未発見エラー / 招待コードラベル
//   error.tsx (teams/) → エラータイトル / 説明 / 再試行
//   loading.tsx (teams/) → ローディングテキスト
//   error.tsx (teams/[teamId]/) → エラータイトル / 説明 / 再試行
//   loading.tsx (teams/[teamId]/) → ローディングテキスト
//   TeamTabs.tsx → タブ名 × 4
//   TeamCreateModal.tsx → エラーヘッダー / 閉じるボタン
//   TeamJoinModal.tsx → モーダルタイトル
//   TeamMembers.tsx → ヘッダー / 招待モーダル / 空状態 / エラー / 参加日
//   TeamPractices.tsx → ヘッダー / 空状態 / 練習カード / エラー
//   TeamPracticeDetailModal.tsx → ラベル一式
//   TeamCompetitions.tsx → ヘッダー / 大会カード / 空状態 / エラー
//   TeamCompetitionEntryModal.tsx → フォーム一式
//   TeamCompetitionRecordsModal.tsx → タイトル / テーブルヘッダー / 空状態
//   TeamRecords.tsx → ヘッダー / テーブル / 空状態 / エラー
//   MemberDetailModal.tsx → ラベル一式 / ロール / ボタン
//   MyMonthlyAttendance → ローディング / エラー / 月ラベル
//   PendingMembersSection.tsx → セクション / ボタン / 空状態
//   MemberStatsHeader.tsx → ヘッダー
//   MembersTimeTable.tsx → テーブルヘッダー / 空状態
//   MonthList.tsx → セクション / 空状態
//   RecentAttendance.tsx → セクション / 空状態 / 保存ボタン
//   MonthDetailModal.tsx → モーダル一式
//   StatusBadge.tsx → ステータス × 5
//   AttendanceStatusModal.tsx → モーダル / テーブルヘッダー
//   AttendanceGroupingDisplay.tsx → カテゴリラベル
//   CompetitionCard.tsx → ステータスラベル / 場所ラベル
//   EntryForm.tsx → フォームラベル / ボタン
//   EntryItem.tsx → エントリー済みラベル
//   EntryList.tsx → 空状態テキスト
//   各種 hooks → エラーメッセージ / 成功メッセージ
// ---------------------------------------------------------------------------

describe("[V-C2C1-01] teams namespace の必須キー確認", () => {
  const TEAMS_REQUIRED_KEYS = [
    // --------------------------------------------------------
    // TeamsClient.tsx: ページヘッダー
    // --------------------------------------------------------
    "teams.page.title",
    "teams.page.description",

    // TeamsClient.tsx: 承認待ちセクション
    "teams.pending.sectionTitle",
    "teams.pending.loading",
    "teams.pending.inviteCodeLabel",
    "teams.pending.waitingWithCode",
    "teams.pending.waitingNoCode",

    // TeamsClient.tsx: 空状態
    "teams.empty.title",
    "teams.empty.description",
    "teams.empty.createButton",
    "teams.empty.joinButton",

    // TeamsClient.tsx / AdminTeamsClient.tsx: 管理者バッジ
    "teams.badge.admin",

    // --------------------------------------------------------
    // TeamDetailClient.tsx: チーム未発見エラー
    // --------------------------------------------------------
    "teams.detail.notFound.title",
    "teams.detail.notFound.description",

    // TeamDetailClient.tsx: 招待コードラベル (detail ページ)
    "teams.detail.inviteCodeLabel",

    // --------------------------------------------------------
    // error.tsx (teams/) および (teams/[teamId]/)
    // --------------------------------------------------------
    "teams.error.title",
    "teams.error.description",
    "teams.error.retry",

    // --------------------------------------------------------
    // loading.tsx (teams/) および (teams/[teamId]/)
    // --------------------------------------------------------
    "teams.loading.text",

    // --------------------------------------------------------
    // TeamTabs.tsx: タブ名
    // --------------------------------------------------------
    "teams.tabs.attendance",
    "teams.tabs.members",
    "teams.tabs.practices",
    "teams.tabs.competitions",

    // --------------------------------------------------------
    // TeamCreateModal.tsx: エラーヘッダー
    // --------------------------------------------------------
    "teams.createModal.errorTitle",
    "teams.createModal.errorClose",

    // --------------------------------------------------------
    // TeamJoinModal.tsx: タイトル
    // --------------------------------------------------------
    "teams.joinModal.title",

    // --------------------------------------------------------
    // TeamMembers.tsx
    // --------------------------------------------------------
    "teams.members.title",
    "teams.members.inviteButton",
    "teams.members.joinedAt",
    "teams.members.empty",
    "teams.members.error",
    "teams.members.retry",

    // TeamMembers.tsx: 招待モーダル
    "teams.members.inviteModal.title",
    "teams.members.inviteModal.description",
    "teams.members.inviteModal.codeLabel",
    "teams.members.inviteModal.copyButton",
    "teams.members.inviteModal.closeButton",

    // --------------------------------------------------------
    // TeamPractices.tsx
    // --------------------------------------------------------
    "teams.practices.title",
    "teams.practices.addButton",
    "teams.practices.empty",
    "teams.practices.error",
    "teams.practices.retry",
    "teams.practices.card.detailButton",
    "teams.practices.card.manageButton",
    "teams.practices.card.noLogs",

    // --------------------------------------------------------
    // TeamPracticeDetailModal.tsx
    // --------------------------------------------------------
    "teams.practiceDetail.title",
    "teams.practiceDetail.close",
    "teams.practiceDetail.placeLabel",
    "teams.practiceDetail.noteLabel",
    "teams.practiceDetail.logsTitle",
    "teams.practiceDetail.styleLabel",
    "teams.practiceDetail.distanceLabel",
    "teams.practiceDetail.noLogs",

    // --------------------------------------------------------
    // TeamCompetitions.tsx
    // --------------------------------------------------------
    "teams.competitions.title",
    "teams.competitions.addButton",
    "teams.competitions.empty",
    "teams.competitions.error",
    "teams.competitions.retry",
    "teams.competitions.card.entryButton",
    "teams.competitions.card.recordsButton",
    "teams.competitions.card.manageButton",
    "teams.competitions.entryStatus.before",
    "teams.competitions.entryStatus.open",
    "teams.competitions.entryStatus.closed",

    // --------------------------------------------------------
    // TeamCompetitionEntryModal.tsx
    // --------------------------------------------------------
    "teams.competitionEntry.title",
    "teams.competitionEntry.close",
    "teams.competitionEntry.styleLabel",
    "teams.competitionEntry.entryTimeLabel",
    "teams.competitionEntry.registerButton",
    "teams.competitionEntry.updateButton",
    "teams.competitionEntry.deleteButton",
    "teams.competitionEntry.cancelButton",
    "teams.competitionEntry.processing",

    // --------------------------------------------------------
    // TeamCompetitionRecordsModal.tsx
    // --------------------------------------------------------
    "teams.competitionRecords.title",
    "teams.competitionRecords.close",
    "teams.competitionRecords.empty",
    "teams.competitionRecords.col.member",
    "teams.competitionRecords.col.time",

    // --------------------------------------------------------
    // TeamRecords.tsx
    // --------------------------------------------------------
    "teams.records.title",
    "teams.records.empty",
    "teams.records.error",
    "teams.records.col.style",
    "teams.records.col.distance",
    "teams.records.col.time",
    "teams.records.col.competition",
    "teams.records.col.date",

    // --------------------------------------------------------
    // MemberDetailModal.tsx
    // --------------------------------------------------------
    "teams.memberDetail.title",
    "teams.memberDetail.close",
    "teams.memberDetail.bestTimesTitle",
    "teams.memberDetail.bestTimesEmpty",
    "teams.memberDetail.col.style",
    "teams.memberDetail.col.distance",
    "teams.memberDetail.col.time",
    "teams.memberDetail.col.date",
    "teams.memberDetail.role.admin",
    "teams.memberDetail.role.member",
    "teams.memberDetail.leaveButton",
    "teams.memberDetail.removeButton",

    // --------------------------------------------------------
    // MyMonthlyAttendance (wrapper 部分)
    // --------------------------------------------------------
    "teams.attendance.loading",
    "teams.attendance.error",
    "teams.attendance.monthLabel",

    // --------------------------------------------------------
    // member-management/components/PendingMembersSection.tsx
    // --------------------------------------------------------
    "teams.pendingMembers.sectionTitle",
    "teams.pendingMembers.approveButton",
    "teams.pendingMembers.rejectButton",
    "teams.pendingMembers.empty",

    // member-management/components/MemberStatsHeader.tsx
    "teams.memberStats.title",

    // member-management/components/MembersTimeTable.tsx
    "teams.membersTimeTable.col.name",
    "teams.membersTimeTable.col.totalDistance",
    "teams.membersTimeTable.empty",

    // member-management/components/MemberGroupSorter.tsx
    "teams.memberGroupSorter.label",

    // member-management/hooks/useMembershipActions.ts
    "teams.membershipActions.approveSuccess",
    "teams.membershipActions.approveError",
    "teams.membershipActions.rejectSuccess",
    "teams.membershipActions.rejectError",

    // member-management/hooks/useMembers.ts
    "teams.membersHook.loadError",

    // member-management/hooks/usePendingMembers.ts
    "teams.pendingMembersHook.loadError",

    // --------------------------------------------------------
    // monthly-attendance/components/MonthList.tsx
    // --------------------------------------------------------
    "teams.monthList.title",
    "teams.monthList.empty",
    "teams.monthList.attendanceRateLabel",

    // monthly-attendance/components/RecentAttendance.tsx
    "teams.recentAttendance.title",
    "teams.recentAttendance.empty",
    "teams.recentAttendance.saveButton",

    // monthly-attendance/components/MonthDetailModal.tsx
    "teams.monthDetail.title",
    "teams.monthDetail.close",
    "teams.monthDetail.saveButton",
    "teams.monthDetail.saving",
    "teams.monthDetail.error",
    "teams.monthDetail.loading",

    // monthly-attendance/components/StatusBadge.tsx
    "teams.attendanceStatus.present",
    "teams.attendanceStatus.absent",
    "teams.attendanceStatus.late",
    "teams.attendanceStatus.early",
    "teams.attendanceStatus.unknown",

    // monthly-attendance/components/AttendanceStatusModal.tsx
    "teams.attendanceStatusModal.title",
    "teams.attendanceStatusModal.close",
    "teams.attendanceStatusModal.col.member",
    "teams.attendanceStatusModal.col.status",

    // monthly-attendance/components/AttendanceGroupingDisplay.tsx
    "teams.attendanceGrouping.categoryLabel",

    // monthly-attendance/hooks/useAttendanceEdit.ts
    "teams.attendanceEditHook.saveError",

    // monthly-attendance/hooks/useAttendanceStatus.ts
    "teams.attendanceStatusHook.loadError",

    // monthly-attendance/hooks/useMonthDetail.ts
    "teams.monthDetailHook.loadError",

    // monthly-attendance/hooks/useMonthList.ts
    "teams.monthListHook.loadError",

    // monthly-attendance/hooks/useRecentAttendance.ts
    "teams.recentAttendanceHook.loadError",
    "teams.recentAttendanceHook.saveSuccess",

    // --------------------------------------------------------
    // entry/CompetitionCard.tsx
    // --------------------------------------------------------
    "teams.entryCompetitionCard.placeLabel",
    "teams.entryCompetitionCard.statusBefore",
    "teams.entryCompetitionCard.statusOpen",
    "teams.entryCompetitionCard.statusClosed",

    // entry/EntryForm.tsx
    "teams.entryForm.styleLabel",
    "teams.entryForm.entryTimeLabel",
    "teams.entryForm.registerButton",
    "teams.entryForm.updateButton",
    "teams.entryForm.deleteButton",
    "teams.entryForm.cancelButton",
    "teams.entryForm.processing",

    // entry/EntryItem.tsx
    "teams.entryItem.enteredLabel",

    // entry/EntryList.tsx
    "teams.entryList.empty",

    // --------------------------------------------------------
    // shared/hooks/useMemberBestTimes.ts
    // --------------------------------------------------------
    "teams.memberBestTimesHook.loadError",

    // shared/hooks/useTimeValidation.ts
    "teams.timeValidation.required",
    "teams.timeValidation.invalid",

    // --------------------------------------------------------
    // RecordClient.tsx (teams/[teamId]/competitions/[competitionId]/records/)
    // --------------------------------------------------------
    "teams.record.pageTitle",
    "teams.record.backButton",
    "teams.record.participantsHeader",
    "teams.record.timesHeader",
    "teams.record.addSplitButton",
    "teams.record.saveButton",
    "teams.record.deleteButton",
    "teams.record.deleting",
    "teams.record.freePlanLimitNotice",
    "teams.record.relayLabel",
    "teams.record.zoneLabel",
  ] as const;

  for (const key of TEAMS_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません (Phase 1-C-2-C-1 未実装)`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません (Phase 1-C-2-C-1 未実装)`).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C2C1-02] en.json の teams namespace 内に日本語が含まれないこと
// ---------------------------------------------------------------------------

describe("[V-C2C1-02] en.json の teams namespace に日本語が含まれないこと", () => {
  it('en.json の namespace "teams" に日本語が含まれない (翻訳漏れゼロ)', () => {
    const messages = enMessages as Record<string, unknown>;
    const nsValue = messages["teams"];
    if (!nsValue) {
      // namespace 未存在は [V-C2C1-01] の各キーテストが検出するためここではスキップ
      return;
    }
    expect(
      containsJapanese(nsValue),
      'en.json の "teams" に日本語が含まれています。翻訳漏れキーを確認してください。',
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// [V-C2C1-03] Phase 1-C-1 / 1-C-2-A / 1-C-2-B 必須キーのリグレッション防止
//
// Phase 1-C-2-C-1 実装後も以前のフェーズのキーが維持されていることを確認。
// ---------------------------------------------------------------------------

describe("[V-C2C1-03] Phase 1-C-1 / 1-C-2-A / 1-C-2-B 必須キーのリグレッション防止", () => {
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
  ] as const;

  for (const key of REGRESSION_KEYS) {
    it(`ja.json に "${key}" が維持されている`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `ja.json から "${key}" が消えています (Phase 1-C-1/1-C-2-A/1-C-2-B からのリグレッション)`,
      ).toContain(key);
    });

    it(`en.json に "${key}" が維持されている`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `en.json から "${key}" が消えています (Phase 1-C-1/1-C-2-A/1-C-2-B からのリグレッション)`,
      ).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-C2C1-04] ICU Message Format プレースホルダーの ja/en 対称確認
//
// teams namespace 内で {variable} プレースホルダーを使用するキーを確認する。
// ---------------------------------------------------------------------------

describe("[V-C2C1-04] ICU Message Format プレースホルダーの ja/en 対称確認", () => {
  const ICU_KEYS_TO_CHECK = [
    // 承認待ち件数: {count}件
    "teams.pending.sectionTitle",
    // メンバー人数: {count}人
    "teams.members.title",
    "teams.memberStats.title",
    // 月ラベル: {year}年{month}月
    "teams.attendance.monthLabel",
    // 出欠率: {rate}% 等
    "teams.monthList.attendanceRateLabel",
  ] as const;

  for (const key of ICU_KEYS_TO_CHECK) {
    it(`"${key}" の ICU プレースホルダーが ja/en で対称である`, () => {
      const jaVal = getNestedValue(jaMessages as unknown as Record<string, unknown>, key);
      const enVal = getNestedValue(enMessages as unknown as Record<string, unknown>, key);

      // キー自体が未実装の場合はスキップ（キー存在チェックは [V-C2C1-01] が担当）
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
// [V-C2C1-05] Phase 1-C-2-C-1 実装後の ja/en キー集合完全一致
//
// Phase 1-C-2-C-1 実装完了後に ja.json と en.json のキー集合が一致していること。
// ---------------------------------------------------------------------------

describe("[V-C2C1-05] Phase 1-C-2-C-1 実装後の ja/en キー集合完全一致", () => {
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

// ---------------------------------------------------------------------------
// [V-C2C1-06] common namespace への追加キー確認
//
// teams エリアで共通利用される値が common namespace に集約されていること。
// 現時点で検討されるキー:
//   - common.inviteCode: 「招待コード」ラベル (TeamsClient / TeamDetailClient / TeamMembers で重複)
// ---------------------------------------------------------------------------

describe("[V-C2C1-06] common namespace への追加キー確認", () => {
  const COMMON_ADDITIONAL_KEYS = [
    // 招待コードラベルは teams エリア横断で使用
    "common.inviteCode",
  ] as const;

  for (const key of COMMON_ADDITIONAL_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(keys, `ja.json に "${key}" が存在しません`).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(keys, `en.json に "${key}" が存在しません`).toContain(key);
    });
  }

  it('en.json の common.inviteCode に日本語が含まれない', () => {
    const value = getNestedValue(
      enMessages as unknown as Record<string, unknown>,
      "common.inviteCode",
    );
    if (value !== undefined) {
      expect(
        containsJapanese(value),
        "en.json の common.inviteCode に日本語が含まれています",
      ).toBe(false);
    }
  });
});
