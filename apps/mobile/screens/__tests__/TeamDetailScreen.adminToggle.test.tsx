// =============================================================================
// TeamDetailScreen.adminToggle.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点 (B-3):
//   管理者/利用者ビュートグルは「1タップごとに」以下の3つが同時に切り替わる必要がある:
//     (a) スイッチの ON/OFF
//     (b) ラベル文字 (管理者ビュー/利用者ビュー)
//     (c) タブ内容の管理者要素の出し分け (管理者専用タブの表示・PendingMembersSection 等)
//
// AdminViewToggle 単体テストだけでは native-stack ヘッダーポータルへの再描画遅延
// (「2回タップしないと切り替わらない」症状) は検出できないため、TeamDetailScreen
// レベルで実際にスイッチをタップし、同一操作 (1クリック) の結果として画面本体
// (メインツリー) とヘッダー (navigation.setOptions 経由で注入される headerRight) の
// 両方が正しく追随することを検証する。
//
// 現在の実装は isAdminView を TeamDetailScreen のローカル state ではなく
// useTeamAdminViewStore (Zustand, モジュール単位のシングルトン) に一元化しており、
// ヘッダー本体 (TeamDetailHeaderAdminToggle) と画面本体の両方が同じストアを直接
// 購読する。そのため本テストは「headerRight ファクトリを再実行する」トリックを
// 必要とせず、ヘッダー由来の headerRight を1度だけ取得して画面本体と並べて描画し、
// スイッチをタップした結果が両方に伝播することを確認する
// (ネイティブ側の real native-stack のポータル遅延そのものは jsdom では再現できない
// ため、それは実機/エミュレータでの確認が別途必要 — Sprint Contract のエミュレータ
// 検証計画を参照)。
//
// トートロジー防止メモ: 実装の内部 (ストアかローカル state か) を検証するのではなく、
// 「1回のクリックで3つの観測可能な UI 状態が同時に変わるか」という利用者視点の
// 結果のみを検証する。

import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  routeParams: { teamId: "team-1", initialTab: undefined as string | undefined },
  goBack: vi.fn(),
  navigate: vi.fn(),
  setOptions: vi.fn(),
  refetch: vi.fn(),
  // V-08 検証用: このセットに含まれる teamId は非管理者メンバーとして扱う
  nonAdminTeamIds: new Set<string>(),
}));

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(async () => undefined),
}));

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({
    navigate: mocks.navigate,
    goBack: mocks.goBack,
    setOptions: mocks.setOptions,
  }),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  // teamId ごとにメンバー権限を切り替えられるようにする (V-08: 別チーム遷移で
  // 管理者ビューが漏れないことの検証に使う。teamId 未指定時は従来通り team-1/admin)。
  useTeamsQuery: (_supabase: unknown, options?: { teamId?: string }) => {
    const teamId = options?.teamId ?? "team-1";
    const isAdmin = mocks.nonAdminTeamIds.has(teamId) ? false : true;
    return {
      currentTeam: {
        id: teamId,
        name: teamId === "team-1" ? "テストチーム" : "テストチーム2",
        description: null,
        invite_code: null,
      },
      members: [{ user_id: "user-1", role: isAdmin ? "admin" : "member" }],
      announcements: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mocks.refetch,
    };
  },
  useListPendingMembersQuery: () => ({ data: [] }),
  useDeleteAnnouncementMutation: () => ({ mutateAsync: vi.fn() }),
}));

// TeamTabs は検証対象 (管理者専用タブの出し分け) のため実物を使う。
// それ以外の重量タブコンテンツ/一覧コンポーネントは薄いスタブに差し替える。
// バレル (@/components/teams) を importOriginal すると group-management 配下の
// BulkAssignModal.tsx が react-native-gesture-handler を読み込みパース不能になるため、
// TeamTabs.tsx のみを直接 importActual する (バレル全体は経由しない)。
vi.mock("@/components/teams", async () => {
  const { TeamTabs } = await vi.importActual<typeof import("@/components/teams/TeamTabs")>(
    "@/components/teams/TeamTabs",
  );
  return {
    TeamTabs,
    TeamMemberList: () => null,
    PendingMembersSection: () => <>PENDING_MEMBERS_MARKER</>,
    MyMonthlyAttendance: () => null,
    TeamGroupManagement: () => null,
  };
});
vi.mock("@/components/teams/AdminMonthlyAttendance", () => ({
  AdminMonthlyAttendance: () => null,
}));
vi.mock("@/components/teams/TeamSettingsModal", () => ({
  TeamSettingsModal: () => null,
}));
vi.mock("@/components/teams/TeamAnnouncementList", () => ({
  TeamAnnouncementList: () => null,
}));
vi.mock("@/components/teams/TeamAnnouncementForm", () => ({
  TeamAnnouncementForm: () => null,
}));
vi.mock("@/components/teams/TeamPracticeList", () => ({
  TeamPracticeList: () => null,
}));
vi.mock("@/components/teams/TeamCompetitionList", () => ({
  TeamCompetitionList: () => null,
}));

import { TeamDetailScreen } from "../TeamDetailScreen";
import { useTeamAdminViewStore } from "@/stores/teamAdminViewStore";

/** navigation.setOptions への直近の呼び出しから headerRight ファクトリを取り出す */
function getLatestHeaderRight(): () => React.ReactElement {
  const calls = mocks.setOptions.mock.calls;
  const lastCall = calls[calls.length - 1];
  return lastCall?.[0]?.headerRight;
}

describe("TeamDetailScreen — 管理者/利用者ビュートグルの1タップ同時反映 (B-3, V-04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routeParams.teamId = "team-1";
    mocks.routeParams.initialTab = undefined;
    mocks.nonAdminTeamIds.clear();
    // isAdminView はモジュール単位のシングルトンストアのため、テスト間で明示的にリセットする
    // (TeamDetailScreen 自体も mount/unmount 時に reset するが、テストの独立性を
    // 実装詳細に依存させないため、ここでも明示的にリセットする)
    useTeamAdminViewStore.getState().reset();
  });

  it(
    "[V-04] 初期状態は利用者ビュー (管理者専用タブ・PendingMembersSection が非表示)",
    () => {
      render(<TeamDetailScreen />);

      expect(screen.queryByText("グループ")).toBeNull();
      expect(screen.queryByText("お知らせ")).toBeNull();
      expect(screen.queryByText("PENDING_MEMBERS_MARKER")).toBeNull();
    },
  );

  it(
    "[V-04] ヘッダーのスイッチを1回タップすると、スイッチの値・ラベル・" +
      "タブ内容の管理者要素が同時に (1タップで) 切り替わる",
    () => {
      render(<TeamDetailScreen />);

      // navigation.setOptions 経由で登録された headerRight ファクトリを取得し、
      // 画面本体と並べて描画する (native-stack のヘッダーポータル相当)
      const headerRight = getLatestHeaderRight();
      expect(typeof headerRight).toBe("function");
      render(<>{headerRight()}</>);

      // 初期状態: 利用者ビュー
      expect(screen.getByText("利用者ビュー")).toBeDefined();
      expect(screen.queryByText("グループ")).toBeNull();
      expect(screen.queryByText("PENDING_MEMBERS_MARKER")).toBeNull();

      // ヘッダーのスイッチを1回だけタップする
      const toggleSwitch = screen.getByRole("switch");
      fireEvent.click(toggleSwitch);

      // (a) スイッチ値 (b) ラベル (c) タブ内容の管理者要素が同時に (1タップで) 切り替わる
      expect(screen.getByText("管理者ビュー")).toBeDefined();
      expect(screen.queryByText("利用者ビュー")).toBeNull();
      expect(screen.getByText("グループ")).toBeDefined();
      expect(screen.getByText("お知らせ")).toBeDefined();
      expect(screen.getByText("PENDING_MEMBERS_MARKER")).toBeDefined();
    },
  );

  it(
    "[V-04] 連続タップ (ON→OFF) でも状態がずれない (2タップ目で確実に元に戻る)",
    () => {
      render(<TeamDetailScreen />);
      const headerRight = getLatestHeaderRight();
      render(<>{headerRight()}</>);

      const toggleSwitch = screen.getByRole("switch");
      fireEvent.click(toggleSwitch); // OFF -> ON
      expect(screen.getByText("管理者ビュー")).toBeDefined();

      fireEvent.click(screen.getByRole("switch")); // ON -> OFF
      expect(screen.getByText("利用者ビュー")).toBeDefined();
      expect(screen.queryByText("グループ")).toBeNull();
      expect(screen.queryByText("PENDING_MEMBERS_MARKER")).toBeNull();
    },
  );

  // ---------------------------------------------------------------------
  // [QA 追加 / V-08] isAdminView はモジュール単位の Zustand シングルトンであるため、
  // 「チームA(管理者)で管理者ビューON→非管理者のチームB詳細画面へ遷移」した際に、
  // 新しい画面インスタンスへ ON 状態が漏れないことを検証する。
  //
  // 注意 (jsdom の限界): TeamDetailScreen は teamId マウント時に useEffect (レイアウト
  // 効果ではなく passive effect) で reset() する。RTL の render() は act() 経由で
  // 効果を同期的にフラッシュしてしまうため、本テストは「reset 後の最終状態」しか
  // 検証できず、実機で理論上あり得る「reset 前の1フレームだけ管理者要素が一瞬見える」
  // というフラッシュ自体の有無は検出できない (これは実機/エミュレータでの確認が必要)。
  // ---------------------------------------------------------------------
  it(
    "[V-08] チームA(管理者)で管理者ビューをONにした後、非管理者のチームBへ遷移すると" +
      "新しい画面では管理者ビューが漏れず利用者ビューになる (最終状態の検証)",
    () => {
      // チームA (team-1, 管理者) を開き、管理者ビューをONにする
      const { unmount: unmountTeamA } = render(<TeamDetailScreen />);
      const headerRightA = getLatestHeaderRight();
      const { unmount: unmountHeaderA } = render(<>{headerRightA()}</>);
      fireEvent.click(screen.getByRole("switch"));
      expect(screen.getByText("管理者ビュー")).toBeDefined();

      // チームAの画面は (実際のnative-stackでは) unmountされず裏に残ることもあるが、
      // ここでは新しい画面インスタンス (チームB) への遷移を再現するため、
      // 現在のツリーを畳んでから teamId を非管理者チームに切り替えて再マウントする
      unmountHeaderA();
      unmountTeamA();

      mocks.routeParams.teamId = "team-2";
      mocks.nonAdminTeamIds.add("team-2");

      render(<TeamDetailScreen />);
      const headerRightB = getLatestHeaderRight();

      // 新しい画面 (チームB, 非管理者) では管理者トグル自体が表示されない
      // (isCurrentUserAdmin=false のため headerRight は undefined)
      expect(typeof headerRightB).not.toBe("function");
      if (typeof headerRightB === "function") {
        render(<>{headerRightB()}</>);
      }
      expect(screen.queryByRole("switch")).toBeNull();
      expect(screen.queryByText("管理者ビュー")).toBeNull();
      expect(screen.queryByText("グループ")).toBeNull();
      expect(screen.queryByText("お知らせ")).toBeNull();
      expect(screen.queryByText("PENDING_MEMBERS_MARKER")).toBeNull();
    },
  );

  it(
    "[V-08] チームA(管理者)で管理者ビューをONにした後、自分も管理者であるチームBへ遷移しても" +
      "新しい画面は利用者ビューから始まる (グローバルストアの値が引き継がれない)",
    () => {
      // チームA (team-1, 管理者) を開き、管理者ビューをONにする
      const { unmount: unmountTeamA } = render(<TeamDetailScreen />);
      const headerRightA = getLatestHeaderRight();
      const { unmount: unmountHeaderA } = render(<>{headerRightA()}</>);
      fireEvent.click(screen.getByRole("switch"));
      expect(screen.getByText("管理者ビュー")).toBeDefined();

      unmountHeaderA();
      unmountTeamA();

      // team-2 も管理者権限を持つチームとして遷移する (nonAdminTeamIds には追加しない)
      mocks.routeParams.teamId = "team-2";

      render(<TeamDetailScreen />);
      const headerRightB = getLatestHeaderRight();
      render(<>{headerRightB()}</>);

      // 新しい画面 (チームB, 自分も管理者) でも初期状態は利用者ビュー
      expect(screen.getByText("利用者ビュー")).toBeDefined();
      expect(screen.queryByText("管理者ビュー")).toBeNull();
      expect(screen.queryByText("グループ")).toBeNull();
      expect(screen.queryByText("PENDING_MEMBERS_MARKER")).toBeNull();
    },
  );

  // ---------------------------------------------------------------------
  // [Reviewer 指摘 / QA 追加 / V-08] render 時点のガード (effectiveIsAdminView)
  // そのものを直接検証する。
  //
  // 上記の unmount→remount によるテストは、TeamDetailScreen 自身の
  // 「マウント時に resetAdminView() する」useLayoutEffect が act() 内で同期的に
  // フラッシュされてしまうため、そのリセット効果に頼らずとも「たまたま」漏れが
  // 隠蔽されてしまい、effectiveIsAdminView の有無に関わらず常にグリーンになり得る
  // (= 本当に検査したい不変条件を構造的に検査対象外にしてしまう)。
  //
  // そのため本テストは、マウント完了後に外部要因でストアの isAdminView だけが
  // true になったケース (例: reset のタイミングに関わらずストアが漏れて残った場合)
  // を直接再現し、「isCurrentUserAdmin=false のときは isAdminView の値に関わらず
  // render の結果として管理者専用要素が一切出ない」という不変条件そのものを検証する。
  // effectiveIsAdminView 導出 (isCurrentUserAdmin && isAdminView) が無ければ
  // このテストは FAIL する。
  // ---------------------------------------------------------------------
  it(
    "[V-08 / render-time guard] 非管理者チームで isAdminView が (何らかの理由で) true のままでも、" +
      "管理者専用要素は render 結果として一切出ない",
    () => {
      mocks.routeParams.teamId = "team-2";
      mocks.nonAdminTeamIds.add("team-2");

      render(<TeamDetailScreen />);

      // マウント完了後、外部要因でストアの値だけが true になったケースを模す
      // (resetAdminView の実行タイミングに一切頼らない)
      act(() => {
        useTeamAdminViewStore.setState({ isAdminView: true });
      });

      // 非管理者のため、そもそもヘッダーにトグル自体が注入されない
      expect(typeof getLatestHeaderRight()).not.toBe("function");
      // タブバー自体に管理者専用タブ (グループ/お知らせ) が出ない
      expect(screen.queryByText("グループ")).toBeNull();
      expect(screen.queryByText("お知らせ")).toBeNull();
      // members タブ内の管理者専用セクションも出ない
      expect(screen.queryByText("PENDING_MEMBERS_MARKER")).toBeNull();
    },
  );

  it(
    "[V-08 / render-time guard] 管理者チームAでONにした後チームBへ遷移した直後に、" +
      "ストアの isAdminView が (reset 前に) true のまま残っていても、非管理者のチームBでは漏れない",
    () => {
      // チームA (team-1, 管理者) を開き、管理者ビューをONにする
      const { unmount: unmountTeamA } = render(<TeamDetailScreen />);
      const headerRightA = getLatestHeaderRight();
      const { unmount: unmountHeaderA } = render(<>{headerRightA()}</>);
      fireEvent.click(screen.getByRole("switch"));
      expect(screen.getByText("管理者ビュー")).toBeDefined();

      unmountHeaderA();
      unmountTeamA();

      // チームB (非管理者) へ遷移する
      mocks.routeParams.teamId = "team-2";
      mocks.nonAdminTeamIds.add("team-2");

      render(<TeamDetailScreen />);

      // マウント直後の reset の有無・タイミングという実装詳細に頼らず、
      // 「ストアが true のまま残っていたら」を直接再現して render-time guard 自体を検証する
      act(() => {
        useTeamAdminViewStore.setState({ isAdminView: true });
      });

      expect(typeof getLatestHeaderRight()).not.toBe("function");
      expect(screen.queryByText("グループ")).toBeNull();
      expect(screen.queryByText("お知らせ")).toBeNull();
      expect(screen.queryByText("PENDING_MEMBERS_MARKER")).toBeNull();
    },
  );
});
