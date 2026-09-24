// 個人種目の種目詳細画面で「組」タブを「選手」タブへ読み替えるための純粋関数群。
// DB には「組」概念が無く (buildStyleEntries.ts が同一 style_id を1つの StyleEntry に
// 畳み込む)、個人種目の StyleEntry.memberRecords はフラットな配列でしかない。
// この配列を memberUserId でグルーピングし、画面のタブ・パネル描画から独立してテストできる
// 形にする。
//
// 戻り値の形 (MemberRecordGroup: memberUserId / memberName / records) は
// Sprint Contract Phase A のテストスケルトン (teamRecordBulk.groupMemberRecordsByUser.test.ts)
// が仮定したシグネチャに合わせている。
import type { MemberRecord } from "./buildStyleEntries";

export interface MemberRecordGroup {
  /** グループの主キー。TeamMembershipWithUser.user_id と対応する */
  memberUserId: string;
  /** タブ表示名 (フルネームのまま。苗字抽出は行わない) */
  memberName: string;
  /** この選手が持つ MemberRecord (選択順 = 入力配列内でその選手が現れた順を保持) */
  records: MemberRecord[];
}

/**
 * memberRecords を memberUserId でグルーピングする。
 * 順序は memberRecords の配列順 (= 選択順) を保持する。1人が複数本 (予選・決勝等) を
 * 持つ場合は同一グループの records に追記される。入力配列は変更しない (純粋関数)。
 */
export function groupMemberRecordsByUser(
  memberRecords: MemberRecord[],
): MemberRecordGroup[] {
  const groups: MemberRecordGroup[] = [];
  const groupByUserId = new Map<string, MemberRecordGroup>();

  for (const mr of memberRecords) {
    const existing = groupByUserId.get(mr.memberUserId);
    if (existing) {
      existing.records.push(mr);
      continue;
    }
    const group: MemberRecordGroup = {
      memberUserId: mr.memberUserId,
      memberName: mr.memberName,
      records: [mr],
    };
    groups.push(group);
    groupByUserId.set(mr.memberUserId, group);
  }

  return groups;
}

/**
 * ある MemberRecord に入力済みのデータが1つでもあるかどうか。
 * タブの × (選手解除) を押したときに確認ダイアログを出すかどうかの判定に使う
 * (入力済みデータを黙って消さないため)。
 */
export function hasMemberRecordData(mr: MemberRecord): boolean {
  return (
    mr.time > 0 ||
    mr.timeDisplayValue.trim() !== "" ||
    mr.reactionTime.trim() !== "" ||
    mr.note.trim() !== "" ||
    mr.splitTimes.length > 0 ||
    !!mr.videoAsset
  );
}
