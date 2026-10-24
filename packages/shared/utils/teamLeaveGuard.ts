// =============================================================================
// チーム脱退の事前ガード - Swim Hub共通パッケージ
// =============================================================================
// 「最後の管理者が脱退するとチームが孤児になる」のを防ぐ判定。
// web (TeamSettingsTab) と mobile (TeamSettingsTab) の「危険な操作」セクションが
// 共にこれを呼ぶ。判定式を両アプリに手書きすると片方だけ更新されて静かに壊れる。
//
// DB 側にこのガードは無い。よって呼び出し側は null 以外が返ったとき
// TeamMembersAPI.leave() を「呼ばずに」止めること。呼んでから失敗を期待すると
// 実際には成功してしまう。
// =============================================================================

/** 脱退をブロックする理由。i18n キー teams.settingsTab.lastAdminCannotLeave に対応 */
export type LeaveBlockReason = "lastAdmin";

/** 判定に必要な最小のメンバー情報 (TeamMembershipWithUser 等から構造的に満たされる) */
export interface LeaveGuardMember {
  user_id: string;
  role: "admin" | "user";
}

/**
 * 脱退をブロックすべきか判定する。null なら脱退してよい。
 *
 * ブロックするのは「自分が管理者」かつ「他に管理者が居ない」かつ
 * 「自分以外にメンバーが残る」の3条件が揃ったときだけ。
 * 自分が唯一のメンバーなら守るべきチームが残らないので通す
 * (ここでブロックすると1人チームから永久に抜けられなくなる)。
 */
export function getLeaveBlockReason(
  members: readonly LeaveGuardMember[],
  userId: string,
): LeaveBlockReason | null {
  const self = members.find((member) => member.user_id === userId);
  // 名簿取得前・除名直後は判定材料が無い。ここで塞ぐと「押しても何も起きない」になる
  if (!self || self.role !== "admin") return null;

  const others = members.filter((member) => member.user_id !== userId);
  if (others.length === 0) return null;

  const hasOtherAdmin = others.some((member) => member.role === "admin");
  return hasOtherAdmin ? null : "lastAdmin";
}
