// =============================================================================
// teamLeaveGuard.test.ts — QA Sprint Contract Phase A スケルトン
// =============================================================================
//
// 対象: apps/shared/utils/teamLeaveGuard.ts (未実装・Phase B で Developer が新規作成)
//
// ■ なぜ shared の純関数として要求するか
//   PM 裁定 C「最後の管理者の脱退はブロックする」は web と mobile の両方の
//   設定タブ「危険な操作」セクションで判定される。判定式を両アプリに手書きすると
//   CLAUDE.md「同一のドメイン対応表を2箇所にハードコードするな」に抵触し、
//   片方だけ条件が更新されて静かに壊れる。唯一の定義元を shared に置き、
//   web/mobile はそれを呼ぶだけにすること。
//
//   また、画面に埋め込むと jsdom で TeamSettingsTab 全体 (useAuth /
//   useTeamsQuery / mutation) を起こさないと境界値が踏めない。純関数なら
//   「管理者2人」「最後の管理者+他メンバーあり」「唯一のメンバー」といった
//   境界を直接踏める。既存 utils/teamAdminView.ts と同じ抽出方針。
//
// ■ 要求シグネチャ (Phase B の Developer はこの形で実装すること)
//     export type LeaveBlockReason = "lastAdmin";
//     export function getLeaveBlockReason(
//       members: readonly { user_id: string; role: "admin" | "user" }[],
//       userId: string,
//     ): LeaveBlockReason | null;
//
//   返り値が null のときだけ脱退ボタンが実行に進む。null 以外のときは
//   TeamMembersAPI.leave() を**呼ばずに**エラー文言を出すこと
//   (「呼んでから失敗させる」形にすると、DB 側にガードが無い以上は成功してしまう)。
//
// ■ Sprint Contract 検証観点
//   [V-A09] 自分が最後の管理者 かつ 他にメンバーが残る → "lastAdmin" (ブロック)
//   [V-A10] 管理者が自分以外にも居る → null (脱退できる)
//   [V-A11] 自分が一般メンバー → 管理者が何人でも null
//   [V-A12] 自分が唯一のメンバー (管理者) → null。
//           チームに誰も残らないので「最後の管理者」を守る意味が無く、
//           ここでブロックすると「1人チームから永久に抜けられない」詰みになる。
//           PM 裁定 C の括弧書き「(かつ他にメンバーが残る)」がこの分岐の根拠。
//   [V-A13] members に自分が居ない (取得途中 / 除名直後) → null を返し、
//           少なくとも「押しても何も起きない」状態にはしない
//
// ■ トートロジー回避
//   判定式をテスト内で再実装しない。期待値はすべて手で書いた定数。
// =============================================================================

import { describe, it, expect } from "vitest";
import { getLeaveBlockReason } from "../../utils/teamLeaveGuard";

type M = { user_id: string; role: "admin" | "user" };

const admin = (id: string): M => ({ user_id: id, role: "admin" });
const user = (id: string): M => ({ user_id: id, role: "user" });

describe("getLeaveBlockReason", () => {
  // [V-A09]
  it("[V-A09] 自分が唯一の管理者で他に一般メンバーが居るときは 'lastAdmin' を返す", () => {
    const members = [admin("me"), user("other-1"), user("other-2")];
    expect(getLeaveBlockReason(members, "me")).toBe("lastAdmin");
  });

  it("[V-A09] 他に残るのが1人だけでもブロックする (境界: メンバー2人)", () => {
    expect(getLeaveBlockReason([admin("me"), user("other-1")], "me")).toBe("lastAdmin");
  });

  // [V-A10]
  it("[V-A10] 管理者が自分以外にも居るときは null (脱退できる)", () => {
    const members = [admin("me"), admin("other-admin"), user("other-1")];
    expect(getLeaveBlockReason(members, "me")).toBeNull();
  });

  it("[V-A10] 管理者が3人のうちの1人でも null", () => {
    const members = [admin("me"), admin("a2"), admin("a3")];
    expect(getLeaveBlockReason(members, "me")).toBeNull();
  });

  // [V-A11]
  it("[V-A11] 自分が一般メンバーなら管理者が1人しか居なくても null", () => {
    const members = [admin("other-admin"), user("me"), user("other-1")];
    expect(getLeaveBlockReason(members, "me")).toBeNull();
  });

  it("[V-A11] 対照: 同じ名簿で管理者本人が抜けようとすると 'lastAdmin' になる (差が出ている)", () => {
    const members = [admin("other-admin"), user("me"), user("other-1")];
    expect(getLeaveBlockReason(members, "me")).toBeNull();
    expect(getLeaveBlockReason(members, "other-admin")).toBe("lastAdmin");
  });

  // [V-A12] 境界: 自分しか居ない
  it("[V-A12] 自分が唯一のメンバー (管理者) のときは null — 1人チームから抜けられない詰みを作らない", () => {
    expect(getLeaveBlockReason([admin("me")], "me")).toBeNull();
  });

  // [V-A13] 境界: 空配列 / 自分が名簿に居ない
  it("[V-A13] members が空配列でも例外にならず null を返す", () => {
    expect(getLeaveBlockReason([], "me")).toBeNull();
  });

  it("[V-A13] 自分が名簿に居ないときは null を返す", () => {
    expect(getLeaveBlockReason([admin("someone"), user("another")], "me")).toBeNull();
  });

  // 引数を壊さないこと (呼び出し元は同じ配列を一覧描画にも使う)
  it("引数の members 配列を書き換えない", () => {
    const members = [admin("me"), user("other-1")];
    const snapshot = JSON.stringify(members);
    getLeaveBlockReason(members, "me");
    expect(JSON.stringify(members)).toBe(snapshot);
  });
});
