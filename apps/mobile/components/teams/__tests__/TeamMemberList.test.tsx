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
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
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

// @shopify/flash-list はソースが素の .ts (型キャスト構文込み) のまま配布されており、
// このリポジトリの vitest 環境では変換に失敗する
// (`SyntaxError: Unexpected token 'typeof'` @ isNewArch.ts)。
// TeamMemberList は「WAポイントで比較」ボタン経由で WaPointsCompareModal (FlashList使用) を
// import するようになったため、このファイルは既存の全テストを含めて suite ごと collection
// failure になっていた (前任 QA/Developer 未着手分)。
// `screens/__tests__/TeamsScreen.refreshDrift.test.tsx` が確立している
// 「ネイティブ境界のみをファイルローカルでモックする」方式を踏襲し、このテストファイル内
// 限定で最小スタブに置き換える (グローバルモックは追加しない)。
vi.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
    ...props
  }: {
    data?: unknown[];
    renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor?: (item: unknown, index: number) => string | number;
    ListEmptyComponent?: React.ReactNode;
  } & Record<string, unknown>) =>
    React.createElement(
      "div",
      props,
      data && data.length > 0
        ? data.map((item, index) =>
            React.createElement(
              "div",
              { key: keyExtractor ? keyExtractor(item, index) : index },
              renderItem ? renderItem({ item, index }) : null,
            ),
          )
        : (ListEmptyComponent ?? null),
    ),
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

    const sortButton = () => screen.getAllByText("50m")[0]!.closest("button")!; // getAllByText は1件以上見つからなければ throw するため [0] は必ず存在する

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

    const button50 = () => screen.getAllByText("50m")[0]!.closest("button")!; // 同上
    const button100 = () => screen.getAllByText("100m")[0]!.closest("button")!; // 同上

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

    const button50 = () => screen.getAllByText("50m")[0]!.closest("button")!; // 同上
    const button100 = () => screen.getAllByText("100m")[0]!.closest("button")!; // 同上

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

    const sortButton = () => screen.getAllByText("50m")[0]!.closest("button")!; // 同上
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

    const sortButton = () => screen.getAllByText("50m")[0]!.closest("button")!; // 同上
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

    const sortButton = () => screen.getAllByText("50m")[0]!.closest("button")!; // 同上

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

// =============================================================================
// D-1: bestTimes 取得クエリのフィールド網羅性 + BestTimeDetailSheet 配線 (Phase B 本実装検証)
// =============================================================================
// Sprint Contract 検証観点:
//   [V-D1-01] loadBestTimes の .select() が note と competitions(id, title, date) を
//     実際に select していること (モックがクエリ引数を捨てない: select() に渡された
//     文字列そのものを assert する)
//   [V-D1-02] 取得結果から distance / note / competitionTitle / competitionDate が
//     MemberBestTime に実際に充填されていること (セル詳細シートの表示内容で観測する)
//   [V-CELL-01] competition あり → 大会名が表示される
//   [V-CELL-02] competition なし + note あり → note が表示される
//   [V-CELL-03] competition なし + note なし → 「一括登録」(bulkEntryNote) にフォールバック
//   [V-CELL-04] 日付は competition?.date ?? created_at (両者が異なる fixture で検証)
//   [V-CELL-05] 空セル(記録なし)をタップしても詳細シートは開かない
//   [V-CELL-06] 同一セル再タップで閉じ、別セルタップで内容が入れ替わる
//   [V-CELL-07] 象限A (competition あり・note あり): select() から BestTimeDetailSheet までの
//     実データ経路を通しても大会名と備考の両方が表示される (note が select/伝播の途中で
//     捨てられていないことを固定する)
// トートロジー防止メモ: competitionTitle/note の期待文字列はテスト側の fixture 定義文字列
// そのものであり、TeamMemberList.tsx の実装をコピーしていない。日付は意図的に
// competition.date と created_at を別の値にして優先順位を判別可能にしている。
// =============================================================================
describe("TeamMemberList - D-1 クエリのフィールド網羅性 + セル詳細シート配線", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // loadBestTimes 用の select() 引数キャプチャ付きモック
  // (order() のみをサポート。WAポイント比較モーダルの .eq() 経路は別 describe で検証する)
  const buildCapturingRecordsMock = (rows: unknown[]) => {
    const selectCalls: string[] = [];
    mocks.supabaseFrom.mockImplementation((_table: string) => ({
      select: vi.fn((sel: string) => {
        selectCalls.push(sel);
        return {
          in: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
          })),
        };
      }),
    }));
    return { selectCalls };
  };

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

  it("[V-D1-01] select() に note と competitions(id, title, date) が渡されている", async () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "選手クエリ子" });
    const { selectCalls } = buildCapturingRecordsMock([]);

    renderList([member]);
    await screen.findByText("選手クエリ子");

    expect(selectCalls.length).toBeGreaterThan(0);
    const sel = selectCalls[0]!; // 直前の toBeGreaterThan(0) で存在は保証済み
    // note 列 (単純な部分文字列一致は "annotation" 等に誤爆しないよう、単語境界で確認)
    expect(/\bnote\b/.test(sel)).toBe(true);
    // competitions の JOIN ブロックが id/title/date を伴って存在すること
    // (短い部分文字列 toContain によるトートロジー化を避けるため、JOIN 構造全体を正規表現で確認)
    expect(
      /competitions!records_competition_id_fkey\s*\(\s*id\s*,\s*title\s*,\s*date\s*\)/.test(sel),
    ).toBe(true);
  });

  it("[V-D1-02][V-CELL-01][V-CELL-04] competition あり: セルタップで大会名と大会日 (created_atとは異なる値) が表示される", async () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "大会太郎" });
    buildCapturingRecordsMock([
      {
        user_id: "u-1",
        time: 30.11,
        // created_at は競技日と意図的に異なる値にする (優先順位の判別用)
        created_at: "2020-06-01T00:00:00.000Z",
        note: null,
        pool_type: 0,
        is_relaying: false,
        styles: { name_jp: "50m自由形", distance: 50 },
        competitions: { id: "c-1", title: "第99回市民大会", date: "2020-09-15" },
      },
    ]);

    renderList([member]);
    await screen.findByText("大会太郎");

    const cell = screen.getByText("30.11");
    fireEvent.click(cell);

    expect(await screen.findByText("第99回市民大会")).toBeTruthy();
    // 大会名がある場合は note フォールバックは表示されない
    expect(screen.queryByText("一括登録")).toBeNull();
  });

  it("[V-CELL-02] competition なし + note あり: note が表示される (大会名にフォールバックしない)", async () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "備考花子" });
    buildCapturingRecordsMock([
      {
        user_id: "u-1",
        time: 31.22,
        created_at: "2021-02-02T00:00:00.000Z",
        note: "自主練での計測",
        pool_type: 0,
        is_relaying: false,
        styles: { name_jp: "50m自由形", distance: 50 },
        competitions: null,
      },
    ]);

    renderList([member]);
    await screen.findByText("備考花子");

    fireEvent.click(screen.getByText("31.22"));

    expect(await screen.findByText("自主練での計測")).toBeTruthy();
    expect(screen.queryByText("一括登録")).toBeNull();
  });

  it("[V-CELL-03] competition なし + note なし: 「一括登録」にフォールバックする", async () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "一括次郎" });
    buildCapturingRecordsMock([
      {
        user_id: "u-1",
        time: 32.33,
        created_at: "2022-03-03T00:00:00.000Z",
        note: null,
        pool_type: 0,
        is_relaying: false,
        styles: { name_jp: "50m自由形", distance: 50 },
        competitions: null,
      },
    ]);

    renderList([member]);
    await screen.findByText("一括次郎");

    fireEvent.click(screen.getByText("32.33"));

    expect(await screen.findByText("一括登録")).toBeTruthy();
  });

  it("[V-CELL-05] 空セル(記録なし)をタップしても詳細シートは開かない", async () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "無記録三郎" });
    buildCapturingRecordsMock([]);

    renderList([member]);
    await screen.findByText("無記録三郎");

    // 50m自由形セルは記録なし = "—" 表示 (Pressable ではない plain View)
    const emptyCells = screen.getAllByText("—");
    expect(emptyCells.length).toBeGreaterThan(0);
    fireEvent.click(emptyCells[0]!); // 直前の toBeGreaterThan(0) で存在は保証済み

    // 詳細シートの内容(大会名/一括登録フォールバック)は一切表示されない
    expect(screen.queryByText("一括登録")).toBeNull();
  });

  const buildTwoCellFixture = () => [
    {
      user_id: "u-1",
      time: 33.44,
      created_at: "2023-01-01T00:00:00.000Z",
      note: null,
      pool_type: 0,
      is_relaying: false,
      styles: { name_jp: "50m自由形", distance: 50 },
      competitions: { id: "c-1", title: "セルA大会", date: "2023-01-10" },
    },
    {
      user_id: "u-1",
      time: 44.55,
      created_at: "2023-02-01T00:00:00.000Z",
      note: null,
      pool_type: 0,
      is_relaying: false,
      styles: { name_jp: "50m平泳ぎ", distance: 50 },
      competitions: { id: "c-2", title: "セルB大会", date: "2023-02-10" },
    },
  ];

  it("[V-CELL-06a] 別セルタップで内容が入れ替わる (回帰確認: green)", async () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "入替四郎" });
    buildCapturingRecordsMock(buildTwoCellFixture());

    renderList([member]);
    await screen.findByText("入替四郎");

    const cellA = screen.getByText("33.44");
    fireEvent.click(cellA);
    expect(await screen.findByText("セルA大会")).toBeTruthy();

    // 別セルタップで内容が入れ替わる
    const cellB = screen.getByText("44.55");
    fireEvent.click(cellB);
    expect(await screen.findByText("セルB大会")).toBeTruthy();
    expect(screen.queryByText("セルA大会")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // [V-CELL-06b] 同一セル再タップで閉じる
  // -------------------------------------------------------------------------
  // Sprint Contract 検証結果: 修正済み・PASS (Developer 対応済み、再検証で確認)。
  // 修正前の `TeamMemberList.tsx` の handleCellPress は cellKey/selectedCellDetail の
  // 比較を一切行わず、タップごとに常に setSelectedCellDetail で上書きするだけの実装で、
  // 同一セル再タップでシートが閉じない Critical だった (`components/profile/BestTimesTable.tsx` /
  // `components/teams/member-detail/BestTimesTable.tsx` にはあった
  // `if (selectedCellKey === cellKey) { closeDetail(); return; }` 相当のトグル判定が欠落していた)。
  // Developer が `selectedCellKey` state + 同一トグル判定を追加し解消済み。
  // このテストは回帰防止のための検出器として引き続き残す (期待値は緩めていない)。
  // =============================================================================
  it(
    "[V-CELL-06b] 同一セル再タップで閉じる (回帰防止) " +
      "(PM裁定: CenterModal の閉じアニメーション分(160ms)の遅延を許容する。契約は" +
      "「同一セル再タップで閉じる」であって「0msで中身が消える」ではないため、" +
      "同期アサーションではなく waitFor で待つ。ただし『そもそも閉じない』退行は" +
      "waitFor のタイムアウト(既定5000ms > 160ms)で確実に赤くなる)",
    async () => {
      const member = buildMember({ id: "m-1", user_id: "u-1", name: "再タップ五郎" });
      buildCapturingRecordsMock(buildTwoCellFixture());

      renderList([member]);
      await screen.findByText("再タップ五郎");

      const cellA = screen.getByText("33.44");
      fireEvent.click(cellA);
      expect(await screen.findByText("セルA大会")).toBeTruthy();

      // 同一セル再タップで閉じるはず。閉じるアニメーション (CenterModal の
      // ANIMATION_DURATION=160ms) の間は直近の中身が残っていてもよいため、
      // アニメーション完了後に消えていることを waitFor で確認する。
      fireEvent.click(cellA);
      await waitFor(() => {
        expect(screen.queryByText("セルA大会")).toBeNull();
      });
    },
  );

  it("[V-CELL-07] 象限A: competition と note の両方があるセルは、大会名と備考の両方を表示する (select() の実データ経路)", async () => {
    const member = buildMember({ id: "m-1", user_id: "u-1", name: "両方太郎" });
    buildCapturingRecordsMock([
      {
        user_id: "u-1",
        time: 35.66,
        created_at: "2024-04-04T00:00:00.000Z",
        note: "追い風参考",
        pool_type: 0,
        is_relaying: false,
        styles: { name_jp: "50m自由形", distance: 50 },
        competitions: { id: "c-1", title: "第10回記録会", date: "2024-04-05" },
      },
    ]);

    renderList([member]);
    await screen.findByText("両方太郎");

    fireEvent.click(screen.getByText("35.66"));

    expect(await screen.findByText("第10回記録会")).toBeTruthy();
    expect(screen.getByText("追い風参考")).toBeTruthy();
    expect(screen.queryByText("一括登録")).toBeNull();
  });
});

// =============================================================================
// WAポイント比較モーダルの起動とデータ取得 (N+1 検証, Phase B 本実装検証)
// =============================================================================
// Sprint Contract 検証観点:
//   [V-N1-01] 「WAポイントで比較」ボタンを押してモーダルを開いたとき、比較用データ取得が
//     メンバーごとの個別クエリ(N+1)ではなく `.in("user_id", [...])` の単一バッチクエリで
//     行われる (呼び出し回数そのものを assert する)
// =============================================================================
describe("TeamMemberList - WAポイント比較モーダル起動とN+1検証", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[V-N1-01] 比較ボタン押下でモーダルを開くと、比較用記録取得は .in() 単一呼び出しで全メンバー分をまとめて取得する", async () => {
    const m1 = buildMember({ id: "m-1", user_id: "u-1", name: "比較アルファ" });
    const m2 = buildMember({ id: "m-2", user_id: "u-2", name: "比較ベータ" });
    const m3 = buildMember({ id: "m-3", user_id: "u-3", name: "比較ガンマ" });
    const members = [m1, m2, m3];

    const selectCalls: string[] = [];
    const inCalls: unknown[][] = [];
    const eqCalls: { column: string; value: unknown }[] = [];
    mocks.supabaseFrom.mockImplementation((_table: string) => ({
      select: vi.fn((sel: string) => {
        selectCalls.push(sel);
        return {
          in: vi.fn((_col: string, ids: string[]) => {
            inCalls.push(ids);
            return {
              // loadBestTimes (テーブル一覧) 用
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
              // useMemberWaPointsRecords (比較モーダル) 用
              eq: vi.fn((col: string, val: unknown) => {
                eqCalls.push({ column: col, value: val });
                return Promise.resolve({ data: [], error: null });
              }),
            };
          }),
        };
      }),
    }));

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
    await screen.findByText("比較アルファ");

    // マウント時の loadBestTimes 呼び出し分 (1回目の .in())
    const inCallsBeforeOpen = inCalls.length;

    fireEvent.click(screen.getByText("WAポイントで比較"));

    // 比較モーダルの記録取得 (eq("is_relaying", false)) が呼ばれるまで待つ
    await waitFor(() => {
      expect(eqCalls.length).toBeGreaterThan(0);
    });

    // 比較モーダル用の .in() 呼び出しは1回だけ増えている (メンバー3人分を1回でまとめて取得)
    expect(inCalls.length).toBe(inCallsBeforeOpen + 1);
    const compareInCall = inCalls[inCalls.length - 1];
    expect(compareInCall).toEqual(["u-1", "u-2", "u-3"]);

    // is_relaying=false のクエリ側フィルタも実際に発火している
    expect(eqCalls).toEqual([{ column: "is_relaying", value: false }]);
  });
});
