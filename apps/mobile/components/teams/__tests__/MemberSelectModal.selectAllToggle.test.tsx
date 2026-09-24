// =============================================================================
// MemberSelectModal.selectAllToggle.test.tsx
// [QA Sprint Contract Phase A] チップグリッド化 + 全選択トグルの挙動検証
// =============================================================================
//
// 対象仕様 (PM 裁定。詳細は Sprint Contract Final 参照):
//   R1: グローバル全選択ボタンはモーダルに1つだけ。ラベル固定「全選択」。
//       ボタン自体が白/青トグルで「全員選択中のときだけ青」。
//       isAllSelected は `candidates.length > 0 && candidates.every(...)` の派生値で持ち、
//       独立した state フラグ (wasAllSelected 等) を持ってはいけない。
//   R2: グループ見出し横のミニボタンも同一挙動の小型トグル。対象はそのグループ内のみ、
//       他グループの選択状態を変えない。
//   R4: グルーピングは TeamMemberGroupFilter を唯一の定義元として利用する
//       (このテストでは TeamMemberGroupFilter 自体をスタブ化し、onGroupedMembersChange 経由で
//       任意の groupedMembers/groupHeaders を注入する。グルーピングの中身
//       [性別分けロジックそのもの] は TeamMemberGroupFilter の責務であり、このファイルの
//       検証対象ではない)。
//   R7: 生年月日順ソートは呼び出し元 (useTeamsQuery) で既に完了している前提。
//       MemberSelectModal 自身が独自に並べ替えてはいけない (回帰ガード)。
//   R8: チップ配色は StyleChipSelector の chip/chipSelected を土台にする
//       (未選択 #FFFFFF / #D1D5DB, 選択 #2563EB)。
//
// 【QA 注記: 白/青トグルボタンの色判定について】
// Pressable の accessibilityState は本テスト環境のモック
// (apps/mobile/__mocks__/react-native.ts) では DOM に反映されない
// (オブジェクトを生 DOM 属性として渡せないため)。一方 style は DOM の inline style として
// そのまま反映されることを `teamRecordBulk.styleCardColors.test.tsx` で確認済み。
// そのため本テストでは「白/青トグル」の ON/OFF 判定を `style.backgroundColor` で行う。
// Sprint Contract 素案は全選択ボタンの正確な hex を明記していなかったため、QA として
// R8 の2色 (#FFFFFF / #2563EB) をそのまま全選択トグルにも適用することを Sprint Contract
// Final の追記事項とした (report の「異議」欄に明記。PM/Developer は別解釈であれば
// Phase B 開始前に QA に申し出ること)。
//
// 【トートロジー防止】
// - isAllSelected の計算式をこのテスト内で再実装して突き合わせることはしない。
//   検証は「押す前後で DOM 上どの chip/ボタンが白/青か」という観測可能な結果のみで行う。
// - TeamMemberGroupFilter のスタブは group 分けの中身を固定 fixture として与えるだけで、
//   性別判定などの実ロジックを模倣・再実装しない。
// =============================================================================

import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamMembershipWithUser } from "@apps/shared/types";
import { compareMembersByBirthday } from "@apps/shared/utils/memberSort";

// -----------------------------------------------------------------------------
// TeamMemberGroupFilter スタブ
// -----------------------------------------------------------------------------
// `mocks.currentHeaders` を各テストの beforeEach / it 内で差し替えることで、
// 「グループなし (フラット)」と「2グループ」の両方のシナリオを同一モックで再現する。
// members はそのまま素通しする (並べ替え・フィルタは一切しない = R7 の前提を守るため)。
const mocks = vi.hoisted(() => ({
  currentHeaders: new Map<number, string>(),
}));

vi.mock("../TeamMemberGroupFilter", () => ({
  TeamMemberGroupFilter: ({
    members,
    onGroupedMembersChange,
  }: {
    members: TeamMembershipWithUser[];
    onGroupedMembersChange: (
      sorted: TeamMembershipWithUser[],
      headers: Map<number, string>,
    ) => void;
  }) => {
    useEffect(() => {
      onGroupedMembersChange(members, mocks.currentHeaders);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [members]);
    return null;
  },
}));

import { MemberSelectModal } from "../MemberSelectModal";

const dummySupabase = {} as unknown as SupabaseClient;

const buildMember = (
  overrides: Partial<TeamMembershipWithUser> & {
    id: string;
    user_id: string;
    name: string;
    gender?: number;
    birthday?: string | null;
  },
): TeamMembershipWithUser =>
  ({
    team_id: "team-1",
    role: "user",
    status: "approved",
    is_active: true,
    is_swimmer: true,
    joined_at: "2025-01-01T00:00:00Z",
    left_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
    users: {
      id: overrides.user_id,
      name: overrides.name,
      gender: overrides.gender ?? 0,
      birthday: overrides.birthday ?? null,
    },
  }) as unknown as TeamMembershipWithUser;

/** hex → jsdom が inline style を計算した後の rgb() 表記へ変換する
 *  (teamRecordBulk.styleCardColors.test.tsx と同じ変換規則) */
function hexToRgbString(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const SELECTED_BG = hexToRgbString("#2563EB");
const UNSELECTED_BG = hexToRgbString("#FFFFFF");

const renderModal = (props?: {
  selectedUserIds?: string[];
  members?: TeamMembershipWithUser[];
  onConfirm?: (ids: string[]) => void;
}) => {
  const members =
    props?.members ??
    [
      buildMember({ id: "m-1", user_id: "u-taro", name: "太郎", gender: 0 }),
      buildMember({ id: "m-2", user_id: "u-jiro", name: "次郎", gender: 0 }),
      buildMember({ id: "m-3", user_id: "u-hanako", name: "花子", gender: 1 }),
      buildMember({ id: "m-4", user_id: "u-sachi", name: "幸", gender: 1 }),
    ];
  return render(
    <MemberSelectModal
      visible
      teamId="team-1"
      supabase={dummySupabase}
      members={members}
      selectedUserIds={props?.selectedUserIds ?? []}
      onConfirm={props?.onConfirm ?? vi.fn()}
      onCancel={vi.fn()}
    />,
  );
};

/** 見出しテキストを含む最も近い共通コンテナ (行) を、その中に "全選択" ボタンが
 *  見つかるまで遡って特定する (TeamMemberList.headerLayout.test.tsx と同じ手法)。 */
function findGroupToggleButton(headerText: string): HTMLElement {
  const header = screen.getByText(headerText);
  const allToggleButtons = screen.getAllByRole("button", { name: "全選択" });
  let row: Element | null = header.parentElement;
  while (row) {
    const found = allToggleButtons.find((b) => row!.contains(b));
    if (found) return found as HTMLElement;
    row = row.parentElement;
  }
  throw new Error(`グループ見出し "${headerText}" の近くに全選択トグルが見つからない`);
}

/** グループ内に閉じ込められていない = グローバルの全選択ボタンを特定する。 */
function findGlobalToggleButton(groupHeaderTexts: string[]): HTMLElement {
  const allToggleButtons = screen.getAllByRole("button", { name: "全選択" });
  const groupButtons = groupHeaderTexts.map((h) => findGroupToggleButton(h));
  const remaining = allToggleButtons.filter((b) => !groupButtons.includes(b));
  expect(remaining).toHaveLength(1);
  return remaining[0]!;
}

describe("[TG] MemberSelectModal 全選択トグル", () => {
  beforeEach(() => {
    mocks.currentHeaders = new Map();
  });

  describe("[TG-1] グローバル全選択ボタンの3遷移 (グループなしフラットリスト)", () => {
    it("[TG-1a] 未選択 → 押下 → 全員選択される (ボタンも白→青)", () => {
      renderModal({ selectedUserIds: [] });
      const globalBtn = screen.getByRole("button", { name: "全選択" });

      expect(globalBtn.style.backgroundColor).toBe(UNSELECTED_BG);

      fireEvent.click(globalBtn);

      expect(screen.getByRole("button", { name: "全選択" }).style.backgroundColor).toBe(
        SELECTED_BG,
      );
      // フッターの選択件数表示 (「4名選択中」相当) で全員選択されたことも確認する
      expect(screen.getByText(/4/)).toBeTruthy();
    });

    it("[TG-1b] 全選択 → 押下 → 全解除される (青→白)", () => {
      renderModal({
        selectedUserIds: ["u-taro", "u-jiro", "u-hanako", "u-sachi"],
      });
      const globalBtn = screen.getByRole("button", { name: "全選択" });
      expect(globalBtn.style.backgroundColor).toBe(SELECTED_BG);

      fireEvent.click(globalBtn);

      expect(screen.getByRole("button", { name: "全選択" }).style.backgroundColor).toBe(
        UNSELECTED_BG,
      );
      expect(screen.getByText(/0/)).toBeTruthy();
    });

    it("[TG-1c] R1の核心: 全選択→1件個別解除→押下で「全解除」ではなく「全選択」に戻る", () => {
      renderModal({
        selectedUserIds: ["u-taro", "u-jiro", "u-hanako", "u-sachi"],
      });

      // 太郎だけ個別に選択解除する (チップ本体を直接タップ)
      fireEvent.click(screen.getByRole("button", { name: "太郎" }));

      // 4人中3人選択 = isAllSelected は false のはずなので、グローバルボタンは白 (OFF) になる
      const globalBtnAfterPartial = screen.getByRole("button", { name: "全選択" });
      expect(globalBtnAfterPartial.style.backgroundColor).toBe(UNSELECTED_BG);

      // ここでグローバルボタンを押す。「直前の状態が select→partial→deselect の
      // 独立フラグ」を持つ実装だと「全解除」に倒れてしまう (isAllSelected の派生計算を
      // 求める理由そのもの)。正しい実装は「現在 isAllSelected=false なので選択」に倒れ、
      // 太郎を含む全員が選択される。
      fireEvent.click(globalBtnAfterPartial);

      expect(screen.getByRole("button", { name: "全選択" }).style.backgroundColor).toBe(
        SELECTED_BG,
      );
      // 太郎のチップも青に戻っていること (「全員」に太郎を含む=単なる残り3人の再選択ではない)
      expect(screen.getByRole("button", { name: "太郎" }).style.backgroundColor).toBe(
        SELECTED_BG,
      );
    });
  });

  describe("[TG-2] グループ見出しのミニ全選択トグルは他グループへ波及しない", () => {
    beforeEach(() => {
      mocks.currentHeaders = new Map<number, string>([
        [0, "男性"],
        [2, "女性"],
      ]);
    });

    it("[TG-2a] 男性グループのトグルを押しても女性グループは無選択のまま", () => {
      renderModal({ selectedUserIds: [] });

      const maleToggle = findGroupToggleButton("男性");
      fireEvent.click(maleToggle);

      expect(screen.getByRole("button", { name: "太郎" }).style.backgroundColor).toBe(
        SELECTED_BG,
      );
      expect(screen.getByRole("button", { name: "次郎" }).style.backgroundColor).toBe(
        SELECTED_BG,
      );
      // --- 対照 (交差ガード): 女性グループの2人は無選択のまま ---
      expect(screen.getByRole("button", { name: "花子" }).style.backgroundColor).toBe(
        UNSELECTED_BG,
      );
      expect(screen.getByRole("button", { name: "幸" }).style.backgroundColor).toBe(
        UNSELECTED_BG,
      );
    });

    it("[TG-2b] 続けて女性グループのトグルを押しても男性グループの選択は不変", () => {
      renderModal({ selectedUserIds: [] });

      fireEvent.click(findGroupToggleButton("男性"));
      fireEvent.click(findGroupToggleButton("女性"));

      // 男性2人は選択されたまま (女性側の操作で巻き戻っていない)
      expect(screen.getByRole("button", { name: "太郎" }).style.backgroundColor).toBe(
        SELECTED_BG,
      );
      expect(screen.getByRole("button", { name: "次郎" }).style.backgroundColor).toBe(
        SELECTED_BG,
      );
      // 女性2人も選択された
      expect(screen.getByRole("button", { name: "花子" }).style.backgroundColor).toBe(
        SELECTED_BG,
      );
      expect(screen.getByRole("button", { name: "幸" }).style.backgroundColor).toBe(
        SELECTED_BG,
      );
    });

    it("[TG-2c] 男性グループを再度押して解除しても、女性グループは選択されたまま", () => {
      renderModal({ selectedUserIds: [] });

      fireEvent.click(findGroupToggleButton("男性"));
      fireEvent.click(findGroupToggleButton("女性"));
      // 男性グループはこの時点で全選択済みなので、再度押すと解除に倒れる
      fireEvent.click(findGroupToggleButton("男性"));

      expect(screen.getByRole("button", { name: "太郎" }).style.backgroundColor).toBe(
        UNSELECTED_BG,
      );
      expect(screen.getByRole("button", { name: "次郎" }).style.backgroundColor).toBe(
        UNSELECTED_BG,
      );
      // --- 対照 (交差ガード): 女性グループは巻き込まれず選択されたまま ---
      expect(screen.getByRole("button", { name: "花子" }).style.backgroundColor).toBe(
        SELECTED_BG,
      );
      expect(screen.getByRole("button", { name: "幸" }).style.backgroundColor).toBe(
        SELECTED_BG,
      );
    });

    it("[TG-2d] グローバル全選択ボタンはグループのミニトグルと重複せず1つだけ存在する", () => {
      renderModal({ selectedUserIds: [] });

      // R1: 「グローバル全選択ボタンはモーダル右端に1つだけ」。
      // グループが2つあっても「全選択」ラベルのボタンは グローバル1 + グループ2 の
      // 合計3つに留まり、グローバルボタンはそのうち他グループに属さない1つだけである。
      const globalBtn = findGlobalToggleButton(["男性", "女性"]);
      expect(screen.getAllByRole("button", { name: "全選択" })).toHaveLength(3);
      expect(globalBtn).toBeTruthy();
    });
  });

  describe("[TG-3] R7 回帰ガード: 生年月日順の描画順を保つ (モーダル自身は並べ替えない)", () => {
    it("[TG-3] compareMembersByBirthday で並べた順序そのままチップが描画される", () => {
      // 実際の運用では useTeamsQuery → TeamMembersAPI.list() がこの並べ替えを行い、
      // MemberSelectModal には既にソート済みの配列が members として渡される
      // (apps/shared/api/teams/members.ts:29)。ここでは「わざと乱れた順」から実物の
      // compareMembersByBirthday で1回だけ並べ替えたものを fixture として使い、
      // MemberSelectModal がそれをそのままの順で描画する (独自に並べ替え直さない) ことを
      // 検証する。並べ替えの中身自体は apps/shared/__tests__/utils/memberSort.test.ts が
      // 別途担保しているので、ここで再実装・再検証はしない。
      const raw = [
        buildMember({ id: "m-c", user_id: "u-c", name: "C選手", birthday: "2008-05-01" }),
        buildMember({ id: "m-a", user_id: "u-a", name: "A選手", birthday: "2005-01-01" }),
        buildMember({ id: "m-b", user_id: "u-b", name: "B選手", birthday: "2006-12-31" }),
      ];
      const sorted = [...raw].sort(compareMembersByBirthday);
      // 前提: 並べ替えた結果が「A選手→B選手→C選手」(年上=誕生日が古い順) になっていること。
      // これが崩れていたら fixture 自体が意図と違うので、本題の前にここで検出する。
      expect(sorted.map((m) => m.users!.name)).toEqual(["A選手", "B選手", "C選手"]);

      renderModal({ members: sorted, selectedUserIds: [] });

      const elA = screen.getByRole("button", { name: "A選手" });
      const elB = screen.getByRole("button", { name: "B選手" });
      const elC = screen.getByRole("button", { name: "C選手" });

      // DOM 上の出現順が A → B → C であること (DOCUMENT_POSITION_FOLLOWING = 後続)
      expect(elA.compareDocumentPosition(elB) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(elB.compareDocumentPosition(elC) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe("[TG-4] チップ配色 (R8): 未選択 #FFFFFF/#D1D5DB, 選択 #2563EB", () => {
    it("[TG-4] 個別チップをタップすると白→青に変わり、他のチップは影響を受けない", () => {
      renderModal({ selectedUserIds: [] });

      const taroChip = screen.getByRole("button", { name: "太郎" });
      const jiroChip = screen.getByRole("button", { name: "次郎" });
      expect(taroChip.style.backgroundColor).toBe(UNSELECTED_BG);

      fireEvent.click(taroChip);

      expect(screen.getByRole("button", { name: "太郎" }).style.backgroundColor).toBe(
        SELECTED_BG,
      );
      // --- 対照: 次郎は未選択のまま ---
      expect(screen.getByRole("button", { name: "次郎" }).style.backgroundColor).toBe(
        UNSELECTED_BG,
      );
      expect(jiroChip.style.backgroundColor).toBe(UNSELECTED_BG);
    });
  });
});
