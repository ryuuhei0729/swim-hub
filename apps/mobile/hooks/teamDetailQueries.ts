// =============================================================================
// チーム詳細まわりの React Query キーと共通設定（モバイル版）
// =============================================================================
//
// チームのメンバー一覧・グループ管理・大会のエントリー/記録モーダルは、以前は
// 開くたびに useEffect で取得し直していて、そのたびにスピナーが出ていた。
// React Query のキャッシュに載せることで、2回目以降は前回のデータをすぐ表示し、
// 裏で最新に取り直す (stale-while-revalidate)。
//
// キャッシュは端末にも保存される (lib/queryPersistence.ts)。保存は JSON なので、
// クエリのデータに Map / Set / Date を入れないこと (復元すると空オブジェクトや
// 文字列になって壊れる)。必要なら useMemo で組み立て直す。

import type { QueryClient } from "@tanstack/react-query";
import { teamKeys } from "@apps/shared/hooks/queries/keys";

export const teamDetailKeys = {
  /** グループ関連すべて。グループやその所属を書き換えたらこの配下をまとめて落とす */
  groups: (teamId: string) => [...teamKeys.detail(teamId), "groups"] as const,
  /** グループ一覧 (所属人数つき) */
  groupsWithCount: (teamId: string) => [...teamDetailKeys.groups(teamId), "withCount"] as const,
  /** メンバーの絞り込み・並べ替え用: グループ一覧と全所属 */
  groupFilter: (teamId: string) => [...teamDetailKeys.groups(teamId), "filter"] as const,
  /** あるグループに所属するメンバー */
  groupMembers: (teamId: string, groupId: string) =>
    [...teamDetailKeys.groups(teamId), "members", groupId] as const,
  /** グループへの割り当て対象として選べるメンバー */
  selectableMembers: (teamId: string) =>
    [...teamKeys.detail(teamId), "selectableMembers"] as const,
  /**
   * メンバー全員のベストタイム。顔ぶれ (userIdsKey) が変わったら別のキャッシュになる。
   *
   * ⚠️ teamKeys.detail(teamId) の配下に置かないこと。配下に置くと、権限変更などの
   * team_memberships の realtime 通知やチームタブのフォーカスのたびに (どちらも
   * teamKeys.detail を無効化する)、チーム全員分の records を引き直してしまう。
   * ベストタイムは顔ぶれと記録でしか変わらず、顔ぶれはキーに含まれている。
   */
  memberBestTimes: (teamId: string, userIdsKey: string) =>
    [...teamKeys.all, "memberBestTimes", teamId, userIdsKey] as const,
  /** 出欠まわりで使うチーム名簿 (fetchTeamMembers)。出欠管理画面と閲覧モーダルで共有する */
  roster: (teamId: string) => ["teamAttendance", "members", teamId] as const,
  /** 出欠の閲覧モーダル: そのイベントの全員の出欠 */
  eventAttendance: (eventType: "practice" | "competition", eventId: string) =>
    [...teamKeys.all, "eventAttendance", eventType, eventId] as const,
  /** 大会のエントリー一覧 */
  competitionEntries: (competitionId: string) =>
    [...teamKeys.all, "competitionEntries", competitionId] as const,
  /** 大会の記録一覧 (個人 + リレー) */
  competitionRecords: (competitionId: string) =>
    [...teamKeys.all, "competitionRecords", competitionId] as const,
} as const;

/** グループやその所属を書き換えたあとに、グループ関連のキャッシュをまとめて取り直す */
export function invalidateTeamGroups(queryClient: QueryClient, teamId: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: teamDetailKeys.groups(teamId) });
}
