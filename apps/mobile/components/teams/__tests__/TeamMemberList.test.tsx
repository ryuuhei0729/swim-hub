// =============================================================================
// TeamMemberList.test.tsx - QA Engineer Sprint Contract 検証（Phase A スケルトン/素振り）
// =============================================================================
// Sprint Contract 検証観点（web MembersTimeTable の3状態サイクルと同一仕様のパリティ）:
//   [V-M01] 距離ヘッダータップで 未ソート→昇順→降順→解除 の3状態サイクルが機能する
//   [V-M02] 昇順/降順いずれでも、タイム未登録メンバーは常に末尾
//   [V-M03] グループ表示中はグループの並び・ヘッダー位置が不変で、グループ内のみ反転する
//   [V-M04] 境界値: 別セルをタップすると新セルは昇順から再開する
//   [V-M05] 境界値: 全員タイム未登録でも降順操作でクラッシュしない
//
// 現時点 (Phase A) の TeamMemberList.handleSort は web 側と同様に
// 「同一セル再タップで即解除」の2状態サイクルのみで、降順(desc)へ遷移するコードパスが
// 存在しない。そのため [V-M01]/[V-M05] は Developer 実装完了前は意図的に FAIL する
// 検出器として書かれている。[V-M04] は3状態化の有無に関わらず既存仕様のまま成立するため
// 現時点でも green になる（回帰ガード）。
//
// ## 実現可否の素振りメモ
// - mobile は vitest + jsdom + `apps/mobile/__mocks__/react-native.ts` の静的モックで
//   RN コンポーネントを DOM 要素に変換して描画するため、web 同様に
//   @testing-library/react (RTL) でレンダリング・操作・検証が可能（実行して確認済み）。
// - TeamMemberGroupFilter は既定でジェンダー別グルーピングを行い、fixtures に
//   `users.gender` が無いと空グループになり membership が消える副作用があるため、
//   本ファイルでは TeamMemberGroupFilter 自体をスタブ化し、
//   「グループなし（素通し）」または「テスト側で明示的に指定した2グループ」を
//   onGroupedMembersChange 経由で注入できるようにしている
//   （TeamCompetitionEntryModal のスタブ手法を踏襲）。
// - MemberDetailModal もスタブ化し、ソート挙動の検証に無関係な依存を切り離す。
// =============================================================================

import React, { useEffect } from "react";
import { Pressable, Text } from "react-native";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

// useAuth() は TeamMemberList のレンダーごとに呼ばれる。戻り値オブジェクトの参照が
// 毎回変わると loadBestTimes の useCallback 依存 ([members, supabase]) が壊れ、
// ソート操作の re-render のたびにレコード再取得（ローディング状態への逆戻り）が
// 起きてしまうため、必ず同一参照を返す。
const mocks = vi.hoisted(() => {
  const supabaseFrom = vi.fn();
  return { supabaseFrom, authValue: { supabase: { from: supabaseFrom } } };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => mocks.authValue,
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useUpdateMemberRoleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveMemberMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// MemberDetailModal はソート検証と無関係なので描画しない
vi.mock("../member-detail", () => ({
  MemberDetailModal: () => null,
}));

// TeamMemberGroupFilter: 既定はグルーピングなし（素通し）。
// 「toggle-2groups」ボタンで members を前半/後半の2グループに分けて
// onGroupedMembersChange へ通知する（グループ内反転の検証用）。
vi.mock("../TeamMemberGroupFilter", () => ({
  TeamMemberGroupFilter: ({
    members,
    onGroupedMembersChange,
  }: {
    members: TeamMembershipWithUser[];
    onGroupedMembersChange: (sorted: TeamMembershipWithUser[], headers: Map<number, string>) => void;
  }) => {
    useEffect(() => {
      onGroupedMembersChange(members, new Map());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [members]);

    return React.createElement(
      Pressable,
      {
        onPress: () => {
          const half = Math.ceil(members.length / 2);
          const headers = new Map<number, string>([
            [0, "グループA"],
            [half, "グループB"],
          ]);
          onGroupedMembersChange(members, headers);
        },
      },
      React.createElement(Text, null, "toggle-2groups"),
    );
  },
}));

import { TeamMemberList } from "../TeamMemberList";

const buildMember = (
  overrides: Partial<TeamMembershipWithUser> & { id: string; user_id: string; name: string },
): TeamMembershipWithUser =>
  ({
    team_id: "team-1",
    role: "user",
    status: "approved",
    is_active: true,
    joined_at: "2025-01-01T00:00:00Z",
    left_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    users: { id: overrides.user_id, name: overrides.name, gender: 0 },
    ...overrides,
  }) as unknown as TeamMembershipWithUser;

// records クエリ: .from("records").select(...).in("user_id", ids).order("time",...)
// user_id ごとのベストタイム行を dataByUser から返す静的モック
const mockRecordsQuery = (dataByUser: Record<string, unknown[]>) => {
  mocks.supabaseFrom.mockImplementation((_table: string) => ({
    select: vi.fn(() => ({
      in: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({
          data: Object.values(dataByUser).flat(),
          error: null,
        }),
      })),
    })),
  }));
};

const record = (userId: string, time: number) => ({
  user_id: userId,
  time,
  created_at: "2025-01-01T00:00:00Z",
  pool_type: 0,
  is_relaying: false,
  styles: { name_jp: "50m自由形", distance: 50 },
  competitions: null,
});

const getRowOrder = () => {
  // 名前セルは frozenColumn 内に Pressable(button) > Text(span) で描画される。
  // container 全体のテキスト出現順で並びを判定する（DOM に data-testid が無いため）。
  const text = document.body.textContent ?? "";
  const names = ["中太郎", "遅い次郎", "速い三郎", "未登録四郎"];
  return names
    .map((name) => ({ name, index: text.indexOf(name) }))
    .filter((n) => n.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((n) => n.name);
};

describe("TeamMemberList - ソート3状態サイクル", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const buildFourMemberFixture = () => {
    const medium = buildMember({ id: "m-medium", user_id: "u-medium", name: "中太郎" });
    const slow = buildMember({ id: "m-slow", user_id: "u-slow", name: "遅い次郎" });
    const fast = buildMember({ id: "m-fast", user_id: "u-fast", name: "速い三郎" });
    const none = buildMember({ id: "m-none", user_id: "u-none", name: "未登録四郎" });
    const members = [medium, slow, fast, none];

    mockRecordsQuery({
      "u-medium": [record("u-medium", 30.0)],
      "u-slow": [record("u-slow", 40.0)],
      "u-fast": [record("u-fast", 25.0)],
      "u-none": [],
    });

    return members;
  };

  const renderList = (members: TeamMembershipWithUser[]) =>
    render(
      <TeamMemberList
        members={members}
        teamId="team-1"
        isLoading={false}
        isError={false}
        error={null}
        currentUserId="u-medium"
        isCurrentUserAdmin={false}
      />,
    );

  // ---------------------------------------------------------------------
  // [V-M01] 未ソート→昇順→降順→解除の3状態サイクル（検出器: 現状は FAIL する想定）
  // ---------------------------------------------------------------------
  it("[V-M01] 距離ヘッダーを3回タップすると 昇順→降順→解除 の順に並びが変わる", async () => {
    const members = buildFourMemberFixture();
    renderList(members);

    await screen.findByText("中太郎");

    // 初期状態（未ソート）: 入力順そのまま
    expect(getRowOrder()).toEqual(["中太郎", "遅い次郎", "速い三郎", "未登録四郎"]);

    const sortButton = () => screen.getAllByText("50m")[0].closest("button")!;

    // 1回目タップ: 昇順（速い順）。未登録メンバーは末尾のまま。
    fireEvent.click(sortButton());
    expect(getRowOrder()).toEqual(["速い三郎", "中太郎", "遅い次郎", "未登録四郎"]);
    expect(within(sortButton()).getByText("↑")).toBeTruthy();

    // 2回目タップ（同一セル）: 降順（遅い順）。未登録メンバーは降順でも末尾。
    fireEvent.click(sortButton());
    expect(getRowOrder()).toEqual(["遅い次郎", "中太郎", "速い三郎", "未登録四郎"]);
    expect(within(sortButton()).getByText("↓")).toBeTruthy();

    // 3回目タップ（同一セル）: 解除 → 元の並びに戻る
    fireEvent.click(sortButton());
    expect(getRowOrder()).toEqual(["中太郎", "遅い次郎", "速い三郎", "未登録四郎"]);
  });

  // ---------------------------------------------------------------------
  // [V-M04] 境界値: 別セルタップで新セルが昇順から再開する（回帰ガード。3状態化前でも成立するはず）
  // ---------------------------------------------------------------------
  it("[V-M04] 昇順状態で別の距離セルをタップすると、新セルは昇順から再開する", async () => {
    const members = buildFourMemberFixture();
    renderList(members);
    await screen.findByText("中太郎");

    const button50 = () => screen.getAllByText("50m")[0].closest("button")!;
    const button100 = () => screen.getAllByText("100m")[0].closest("button")!;

    fireEvent.click(button50());
    expect(within(button50()).getByText("↑")).toBeTruthy();

    fireEvent.click(button100());
    expect(within(button100()).getByText("↑")).toBeTruthy();
    // 旧セル(50m)の矢印は消える
    expect(within(button50()).queryByText("↑")).toBeNull();
    expect(within(button50()).queryByText("↓")).toBeNull();
  });

  // ---------------------------------------------------------------------
  // [V-M04b] 境界値: 降順状態で別セルタップで新セルが昇順から再開する
  // ---------------------------------------------------------------------
  it("[V-M04b] 降順状態で別の距離セルをタップすると、新セルは昇順から再開する", async () => {
    const members = buildFourMemberFixture();
    renderList(members);
    await screen.findByText("中太郎");

    const button50 = () => screen.getAllByText("50m")[0].closest("button")!;
    const button100 = () => screen.getAllByText("100m")[0].closest("button")!;

    // 50m を昇順→降順まで進める
    fireEvent.click(button50());
    fireEvent.click(button50());
    expect(within(button50()).getByText("↓")).toBeTruthy();

    // 降順状態から別セル（100m）をタップ → 新セルは昇順から再開、旧セル(50m)は解除される
    fireEvent.click(button100());
    expect(within(button100()).getByText("↑")).toBeTruthy();
    expect(within(button50()).queryByText("↑")).toBeNull();
    expect(within(button50()).queryByText("↓")).toBeNull();
  });

  // ---------------------------------------------------------------------
  // [V-M05] 境界値: 全員タイム未登録でも降順操作でクラッシュしない（検出器）
  // ---------------------------------------------------------------------
  it("[V-M05] 全員タイム未登録でも3回タップしてクラッシュしない（入力順維持）", async () => {
    const a = buildMember({ id: "m-a", user_id: "u-a", name: "無記録A" });
    const b = buildMember({ id: "m-b", user_id: "u-b", name: "無記録B" });
    mockRecordsQuery({ "u-a": [], "u-b": [] });

    render(
      <TeamMemberList
        members={[a, b]}
        teamId="team-1"
        isLoading={false}
        isError={false}
        error={null}
        currentUserId="u-a"
        isCurrentUserAdmin={false}
      />,
    );
    await screen.findByText("無記録A");

    const sortButton = () => screen.getAllByText("50m")[0].closest("button")!;
    expect(() => {
      fireEvent.click(sortButton()); // asc
      fireEvent.click(sortButton()); // desc
      fireEvent.click(sortButton()); // reset
    }).not.toThrow();

    const text = document.body.textContent ?? "";
    expect(text.indexOf("無記録A")).toBeLessThan(text.indexOf("無記録B"));
  });

  // ---------------------------------------------------------------------
  // [V-M03] グループ表示中はグループヘッダー位置が不変で、グループ内のみ反転する
  // ---------------------------------------------------------------------
  it("[V-M03] グループ表示中に降順にしても、グループヘッダーの表示順は変わらずグループ内のみ反転する", async () => {
    const members = buildFourMemberFixture(); // [medium, slow, fast, none]
    renderList(members);
    await screen.findByText("中太郎");

    // グループフィルタースタブ: 前半2人=グループA, 後半2人=グループB に分割
    fireEvent.click(screen.getByText("toggle-2groups"));
    expect(screen.getByText("グループA")).toBeTruthy();
    expect(screen.getByText("グループB")).toBeTruthy();

    const sortButton = () => screen.getAllByText("50m")[0].closest("button")!;
    fireEvent.click(sortButton()); // asc
    fireEvent.click(sortButton()); // desc

    // グループヘッダーのテキスト自体は引き続き両方存在する（並び自体は不変）
    expect(screen.getByText("グループA")).toBeTruthy();
    expect(screen.getByText("グループB")).toBeTruthy();

    // グループA (medium, slow) 内は降順で slow(40s) が medium(30s) より先
    // グループB (fast, none) 内は降順でも none（未登録）は末尾のまま
    const text = document.body.textContent ?? "";
    expect(text.indexOf("遅い次郎")).toBeLessThan(text.indexOf("中太郎"));
    expect(text.indexOf("速い三郎")).toBeLessThan(text.indexOf("未登録四郎"));
  });
});
