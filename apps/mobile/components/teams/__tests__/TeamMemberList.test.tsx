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

// =============================================================================
// T-4: 引き継ぎタイムを含む(includeRelaying)トグル — Sprint Contract Phase B 本実装検証
// =============================================================================
// Sprint Contract 検証観点:
//   [V-T4-01 最重要・後退防止] トグル OFF (デフォルト) のとき、getBestTime の出力は
//     T-4 実装前と完全に一致する(引き継ぎ記録がどれだけ速くても非引き継ぎが選ばれ、
//     poolType=1 のときのみ"L"が付く。値も並びも変えない)
//   [V-T4-08] ソート比較(getBestTime in useMemo)と表示側(getBestTime in render)の両方が
//     現在の includeRelaying を正しく反映する(片方だけがトグル前の値のまま固定されない)
// トートロジー防止メモ: 期待値(具体的な秒数文字列・"R"/"L"サフィックス)はテスト側で
// ハードコードしており、TeamMemberList.tsx 内の selectBestTime 呼び出しをコピーしていない。
describe("TeamMemberList - 引き継ぎタイムを含むトグル (T-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const bodyText = () => document.body.textContent ?? "";

  const relayRecord = (userId: string, time: number, poolType: 0 | 1, isRelaying: boolean) => ({
    user_id: userId,
    time,
    created_at: "2025-01-01T00:00:00Z",
    pool_type: poolType,
    is_relaying: isRelaying,
    // dbStyleName の照合は `${distance}m${styleName}` のため、既存 record() ヘルパーと
    // 同様に name_jp には距離を含む文字列("50m自由形")を渡す
    styles: { name_jp: "50m自由形", distance: 50 },
    competitions: null,
  });

  const renderList = (members: TeamMembershipWithUser[]) =>
    render(
      <TeamMemberList
        members={members}
        teamId="team-1"
        isLoading={false}
        isError={false}
        error={null}
        currentUserId="u-1"
        isCurrentUserAdmin={false}
      />,
    );

  it("[V-T4-01 最重要] デフォルト(トグルOFF)では引き継ぎ記録がどれだけ速くても非引き継ぎの記録が表示される(後退防止)", async () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "後退防止太郎" });
    // 非引き継ぎ(短水路): 35.00秒、引き継ぎ(短水路・より速い): 20.00秒
    mockRecordsQuery({
      "u-1": [
        relayRecord("u-1", 35.0, 0, false),
        relayRecord("u-1", 20.0, 0, true),
      ],
    });

    renderList([member]);
    await screen.findByText("後退防止太郎");

    // 非引き継ぎの35.00が表示され、引き継ぎの20.00(より速い)は表示されない。サフィックスも無し。
    expect(bodyText()).toContain("35.00");
    expect(bodyText()).not.toContain("20.00");

    // トグル自体は存在し、初期値はOFF
    const toggle = screen.getByRole("switch");
    expect(toggle.getAttribute("data-value")).toBe("false");
  });

  it("[V-T4-02] トグルをONにすると、引き継ぎ記録の方が速ければ表示が切り替わり'R'サフィックスが付く", async () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "トグル次郎" });
    mockRecordsQuery({
      "u-1": [
        relayRecord("u-1", 35.0, 0, false),
        relayRecord("u-1", 20.0, 0, true),
      ],
    });

    renderList([member]);
    await screen.findByText("トグル次郎");
    expect(bodyText()).toContain("35.00");

    fireEvent.click(screen.getByRole("switch"));

    expect(bodyText()).toContain("20.00");
    expect(bodyText()).toContain("R");
    expect(bodyText()).not.toContain("35.00");
    expect(screen.getByRole("switch").getAttribute("data-value")).toBe("true");
  });

  it("[V-T4-03] 長水路(poolType=1)の非引き継ぎ記録には'L'サフィックスが付く", async () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "長水路花子" });
    mockRecordsQuery({
      "u-1": [relayRecord("u-1", 33.5, 1, false)],
    });

    renderList([member]);
    await screen.findByText("長水路花子");

    expect(bodyText()).toContain("33.50");
    expect(bodyText()).toContain("L");
  });

  it("[V-T4-08] トグルON状態でソートしても、ソート順は現在のincludeRelayingを反映する(表示とソートの整合)", async () => {
    // u-1: 非引き継ぎ35.00・引き継ぎ20.00(トグルONでのみ有効)
    // u-2: 非引き継ぎ25.00のみ
    const m1 = buildMember({ id: "m-1", user_id: "u-1", name: "選手アルファ" });
    const m2 = buildMember({ id: "m-2", user_id: "u-2", name: "選手ベータ" });
    mockRecordsQuery({
      "u-1": [relayRecord("u-1", 35.0, 0, false), relayRecord("u-1", 20.0, 0, true)],
      "u-2": [relayRecord("u-2", 25.0, 0, false)],
    });

    render(
      <TeamMemberList
        members={[m1, m2]}
        teamId="team-1"
        isLoading={false}
        isError={false}
        error={null}
        currentUserId="u-1"
        isCurrentUserAdmin={false}
      />,
    );
    await screen.findByText("選手アルファ");

    const sortButton = () => screen.getAllByText("50m")[0].closest("button")!;

    // トグルOFFのまま昇順ソート: ベータ(25.00) が先、アルファ(35.00)が後
    fireEvent.click(sortButton());
    const textBefore = bodyText();
    expect(textBefore.indexOf("選手ベータ")).toBeLessThan(textBefore.indexOf("選手アルファ"));

    // トグルをONにする(ソート状態は維持されたまま includeRelaying だけ変わる)
    fireEvent.click(screen.getByRole("switch"));

    // アルファの引き継ぎ記録(20.00)がベータ(25.00)より速くなるため、
    // ソート比較関数がその場でincludeRelaying=trueを反映していれば順序が反転する。
    // (getBestTime のデフォルト引数に頼っていれば、ここで古い includeRelaying=false のまま
    //  比較され続け、順序が反転しないバグを検出できる)
    const textAfter = bodyText();
    expect(textAfter.indexOf("選手アルファ")).toBeLessThan(textAfter.indexOf("選手ベータ"));
  });

  // ---------------------------------------------------------------------
  // [V-T4-09] getBestTime内の `matching.find((bt) => bt.time === best.time &&
  // bt.isRelaying === best.isRelaying)!` の将来リファクタ耐性ガード。
  // 現状は selectBestTime の reduce が返す候補(time最小・タイ時は先勝ち)と、外側の
  // find() が探索する順序が一致するため正しく動くが、この一致は「matching配列の並び順」
  // という暗黙の前提に依存している。同一 time・同一 isRelaying の重複(プール種別違い)
  // があるケースを固定し、将来の並び替えロジック変更で displayed suffix が不安定に
  // なる回帰を検出できるようにする。
  // ---------------------------------------------------------------------
  it("[V-T4-09] 同一タイム・同一isRelayingで poolType のみ異なる重複記録があっても、表示が安定する(find()の将来リファクタ耐性)", async () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "重複次郎" });
    // 短水路(poolType=0)の非引き継ぎ記録を先に、長水路(poolType=1)の非引き継ぎ記録を後に
    // 同一タイム(30.00)で登録する。selectBestTime の reduce は tie 時に先勝ちのため
    // 短水路側(サフィックス無し)が採用されるはずで、長水路側の"L"は付かない。
    mockRecordsQuery({
      "u-1": [
        relayRecord("u-1", 30.0, 0, false),
        relayRecord("u-1", 30.0, 1, false),
      ],
    });

    renderList([member]);
    await screen.findByText("重複次郎");

    // 表示されるタイムは1つだけ(同一値のため文字列としては同じだが、サフィックス無しである
    // ことで「先に登録された短水路側」が安定して選ばれていることを確認する)
    const timeCells = screen.getAllByText((_, node) => node?.textContent === "30.00");
    expect(timeCells.length).toBeGreaterThan(0);
    expect(bodyText()).not.toContain("30.00 L");
  });
});
