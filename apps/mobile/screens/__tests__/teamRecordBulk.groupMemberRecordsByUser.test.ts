// =============================================================================
// teamRecordBulk.groupMemberRecordsByUser.test.ts
// [Sprint Contract Phase A スケルトン] TeamRecordStyleDetailScreen 種目詳細画面
// (個人種目) の ItemTabs を「組」から「選手」単位へ変える新設の純粋関数。
// =============================================================================
//
// Sprint Contract 対応項目: #2
//   ItemTabs の単位を「組」から「選手」へ変更する。label(i) は選手のフルネーム
//   (苗字抽出はしない ← ユーザーが明示決定)。グルーピングは teamRecordBulk/ 配下の
//   新規純粋関数 (例 groupMemberRecordsByUser) が担う。
//
// 【重要】この関数はまだ実装されていない (Phase A 時点)。
// import パス・シグネチャは Sprint Contract の記述から妥当と判断した以下を仮定する:
//   groupMemberRecordsByUser(memberRecords: MemberRecord[]):
//     Array<{ memberUserId: string; memberName: string; records: MemberRecord[] }>
// Developer が異なるシグネチャ (例: 第2引数に members を取る等) を選んだ場合は
// Phase B でこのファイルの呼び出し箇所のみ追従させる。ただし下記の不変条件
// (グルーピング単位・グループ内順序・グループの出現順・非破壊性) はシグネチャに
// 依存しないので、そのまま維持する。
//
// トートロジー防止メモ: 「実装をコピーしてグルーピングし直す」のではなく、
// 「同じ memberUserId の MemberRecord が同じグループに集約されること」
// 「グループ内では入力順 (n本目の連番) が保たれること」という契約のみを検証する。

import { describe, expect, it } from "vitest";
import { groupMemberRecordsByUser } from "../teamRecordBulk/groupMemberRecordsByUser";
import type { MemberRecord } from "../teamRecordBulk/buildStyleEntries";

function memberRecord(overrides: Partial<MemberRecord> & Pick<MemberRecord, "id" | "memberUserId">): MemberRecord {
  return {
    memberName: "",
    time: 0,
    timeDisplayValue: "",
    reactionTime: "",
    isRelaying: false,
    note: "",
    splitTimes: [],
    ...overrides,
  };
}

describe("groupMemberRecordsByUser", () => {
  it("同じ memberUserId の MemberRecord が同一グループに集約される (選手Aの1本目/2本目)", () => {
    const records: MemberRecord[] = [
      memberRecord({ id: "mr-1", memberUserId: "user-a", memberName: "太郎", time: 30 }),
      memberRecord({ id: "mr-2", memberUserId: "user-a", memberName: "太郎", time: 31 }),
    ];

    const groups = groupMemberRecordsByUser(records);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.memberUserId).toBe("user-a");
    expect(groups[0]?.records.map((r) => r.id)).toEqual(["mr-1", "mr-2"]);
  });

  it("異なる memberUserId は別グループになる (選手A・選手Bが混在する入力)", () => {
    const records: MemberRecord[] = [
      memberRecord({ id: "mr-1", memberUserId: "user-a", memberName: "太郎" }),
      memberRecord({ id: "mr-2", memberUserId: "user-b", memberName: "次郎" }),
      memberRecord({ id: "mr-3", memberUserId: "user-a", memberName: "太郎" }),
    ];

    const groups = groupMemberRecordsByUser(records);

    expect(groups).toHaveLength(2);
    const userAGroup = groups.find((g) => g.memberUserId === "user-a");
    const userBGroup = groups.find((g) => g.memberUserId === "user-b");
    // 選手Aの1本目・2本目が両方とも選手Aのグループに残っている
    // (#5 のデータ消失バグとは別観点だが、グルーピング段階で本数が減っていないことの確認)
    expect(userAGroup?.records.map((r) => r.id)).toEqual(["mr-1", "mr-3"]);
    expect(userBGroup?.records.map((r) => r.id)).toEqual(["mr-2"]);
  });

  it("グループの並び順は入力配列内でその選手が最初に現れた順序を保つ (タブの並び順の根拠)", () => {
    const records: MemberRecord[] = [
      memberRecord({ id: "mr-1", memberUserId: "user-b", memberName: "次郎" }),
      memberRecord({ id: "mr-2", memberUserId: "user-a", memberName: "太郎" }),
      memberRecord({ id: "mr-3", memberUserId: "user-b", memberName: "次郎" }),
    ];

    const groups = groupMemberRecordsByUser(records);

    expect(groups.map((g) => g.memberUserId)).toEqual(["user-b", "user-a"]);
  });

  it("空配列を渡すと空配列を返す (選手0人の空状態 #7 の土台)", () => {
    expect(groupMemberRecordsByUser([])).toEqual([]);
  });

  it("入力配列を破壊しない (純粋関数であること)", () => {
    const records: MemberRecord[] = [
      memberRecord({ id: "mr-1", memberUserId: "user-a", memberName: "太郎" }),
    ];
    const snapshot = JSON.stringify(records);

    groupMemberRecordsByUser(records);

    expect(JSON.stringify(records)).toBe(snapshot);
  });

  it.todo(
    "[要 Developer 実装確認] memberName が空文字の行 (MemberSelectModal 経由の直後で " +
      "まだ氏名解決が済んでいない等、実運用では起こらない想定だが型上は許容される) を" +
      "渡した場合の挙動を、実装のフォールバック方針に合わせて確定する",
  );
});
