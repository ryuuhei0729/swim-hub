/**
 * WaPointsCompareLauncher.test.tsx — QA Sprint Contract Phase A スケルトン (web)
 *
 * 対象: apps/web/components/team/rankings/WaPointsCompareLauncher.tsx
 *       (未実装・Phase B で Web Developer が新規作成)
 *
 * ■ スコープB 項目4 (web)
 *   「WAポイントで比較」をメンバータブ (TeamMemberManagement) から
 *   ランキングタブへ移す。PM 指示:
 *     - rankings/ に Launcher を新設し、isOpen state + useMembers + useMemberBestTimes を内包
 *     - **初回オープン時にのみ**ロードする遅延方式
 *     - WaPointsCompareButton.tsx / WaPointsCompareModal.tsx は **ファイル移動しない**
 *       (既存テスト4本が member-management/components/ を相対 import している)
 *     - members を加工・詰め替えしない。`?? 0` を書かない
 *     - N+1 (useMemberBestTimes.loadAllBestTimes) は今回解消しない (既知債務)
 *
 * ■ QA が Phase A で確定させる実装要件 (Contract 補強)
 *     export interface WaPointsCompareLauncherProps { teamId: string }
 *     export default function WaPointsCompareLauncher(props): JSX.Element;
 *   内部で
 *     - useMembers(teamId, supabase)              (member-management/hooks)
 *     - useMemberBestTimes(supabase)              (shared/hooks)
 *     - WaPointsCompareButton / WaPointsCompareModal (member-management/components)
 *   を使う。`members` は useMembers の戻り値を **そのまま** モーダルへ渡す。
 *
 * ■ Sprint Contract 検証観点
 *   [V-B40] ボタンが描画される
 *   [V-B41] 初期描画では loadMembers / loadAllBestTimes を呼ばない (遅延ロード)
 *   [V-B42] 初回クリックで loadMembers が呼ばれ、モーダルが開く
 *   [V-B43] 閉じて再度開いても loadMembers は増えない (「初回オープン時にのみ」)
 *   [V-B44] モーダルに渡る members は useMembers の戻り値と同一参照 (詰め替え禁止)
 *   [V-B45] gender 未設定メンバーの gender が 0 (男性) に化けない
 *   [V-B46] ローディング中でもボタンは押せる状態のまま消えない
 *
 * ■ jsdom で検証できないこと
 *   ボタンの配置 (個人/リレーどちらのランキングでも見える位置にあるか) は
 *   Tailwind 依存のレイアウトなので jsdom では検証不能。ブラウザ実機 (B-05) で確認する。
 *
 * ■ 撤去側の対テスト
 *   apps/web/__tests__/components/team/TeamMemberManagement.test.tsx は
 *   「メンバータブにボタンがある」を pin している。**削除せず**
 *   「メンバータブにボタンが無い」の対テストへ Phase B で移植する。
 *   移植しないと「どこにも無い」状態でも全 green になる。
 */

import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect, vi, beforeEach } from "vitest";

import messages from "@apps/shared/messages/ja.json";
import type { TeamMember } from "../../../../components/team/member-management/hooks/useMembers";

const hookMocks = vi.hoisted(() => ({
  loadMembers: vi.fn(),
  /** 既定で **非同期解決**。同期解決だと await をまたぐ実行順が再現されない */
  loadAllBestTimes: vi.fn(() => new Promise<void>((resolve) => setTimeout(resolve, 0))),
  members: [] as unknown[],
  memberBestTimes: new Map<string, unknown>(),
  membersError: null as string | null,
  bestTimesError: null as string | null,
  /** useMembers モック内の setState。members と loading を**同時に**コミットする */
  setMembersState: (_v: { members: unknown[]; loading: boolean }) => {},
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "me" } }),
}));

// -----------------------------------------------------------------------------
// ⚠️ このコンポーネントで**唯一壊れうるのは非同期の実行順**なので、
//    モックはそこを再現できる形にする。
//
//    Phase B 初版のモックには3つの死角があり、Critical C2-1
//    (effect の自己キャンセルで setPhase("ready") が永久に呼ばれず、
//     取得完了後もスピナーが回り続ける) を**素通しした**:
//      1. `loading` が固定値で `true → false` の遷移を踏んでいなかった
//      2. `loadAllBestTimes` が同期解決で `await` をまたぐ順序を再現していなかった
//      3. モーダルのスタブが `isLoading` を描画に反映していなかった
//
//    → 実物の `useMembers` と同じく **loading は true で始まり、
//      loadMembers() の解決で false になる** React state としてモックする。
// -----------------------------------------------------------------------------
vi.mock("../../../../components/team/member-management/hooks", async () => {
  const React = await import("react");
  return {
    useMembers: () => {
      // 実物 (hooks/useMembers.ts) は `useState([])` + `useState(true)` で始まり、
      // 取得完了時に **setMembers(data) と setLoading(false) を同じコミットで**行う。
      //
      // ⚠️ members を最初から埋めて loading だけ遷移させると、
      // 「members がまだ [] の段階で loadAllBestTimes([]) が呼ばれる」という
      // このコンポーネントに最も現実的に残る順序バグを**構造的に検出できない**。
      // 必ず2つを1つの state にまとめて同時にコミットすること。
      const [state, setState] = React.useState<{ members: unknown[]; loading: boolean }>({
        members: [],
        loading: true,
      });
      hookMocks.setMembersState = setState;
      return {
        members: state.members,
        loading: state.loading,
        error: hookMocks.membersError,
        loadMembers: hookMocks.loadMembers,
      };
    },
  };
});

vi.mock("../../../../components/team/shared/hooks/useMemberBestTimes", () => ({
  useMemberBestTimes: () => ({
    memberBestTimes: hookMocks.memberBestTimes,
    loading: false,
    error: hookMocks.bestTimesError,
    loadAllBestTimes: hookMocks.loadAllBestTimes,
    getBestTimeForMember: vi.fn(() => null),
  }),
}));

// モーダルは props の記録 + `isLoading` の描画反映だけ行う。
// 点数計算の検証は既存の __tests__/components/team/WaPointsCompareModal.test.tsx が担う。
// **isLoading を描画に出さないと「永久スピナー」を DOM から観測できない。**
const modalMock = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));

vi.mock("../../../../components/team/member-management/components/WaPointsCompareModal", () => ({
  WaPointsCompareModal: (props: Record<string, unknown>) => {
    modalMock.props.push(props);
    if (!props.isOpen) return null;
    return (
      <div data-testid="wa-points-compare-modal">
        {props.isLoading ? (
          <span data-testid="wa-modal-loading">loading</span>
        ) : (
          <span data-testid="wa-modal-ready">ready</span>
        )}
      </div>
    );
  },
}));

import WaPointsCompareLauncher from "../../../../components/team/rankings/WaPointsCompareLauncher";

const BUTTON_LABEL = messages.teams.waPointsCompare.buttonLabel;

const buildMember = (
  id: string,
  gender: number | undefined,
  name: string,
): TeamMember =>
  ({
    id: `membership-${id}`,
    user_id: id,
    role: "user",
    is_active: true,
    joined_at: "2025-01-01T00:00:00Z",
    users: gender === undefined ? { id, name } : { id, name, gender },
  }) as TeamMember;

const MEMBERS = [
  buildMember("u-unknown", undefined, "性別未設定さん"),
  buildMember("u-male", 0, "男性さん"),
  buildMember("u-female", 1, "女性さん"),
];

/**
 * 🚨 **StrictMode で包むこと。**
 *
 * RTL の `render` は StrictMode を適用しないが、**Next 16 の dev は StrictMode が
 * 既定で有効**。StrictMode はマウント時に effect を
 *   setup → cleanup → setup
 * と実行するため、「cleanup で立てたフラグを本体で戻し忘れている」種類の欠陥は
 * **StrictMode でしか現れない**。
 *
 * このファイルはもともと「ここで壊れうるのは非同期の実行順だけ」と書いていたが、
 * 実際に壊れる軸 (マウント時の二重 effect) がハーネスから抜けていた。
 * StrictMode ラップはその穴を塞ぐ恒久的な回帰ガードなので外さないこと。
 */
const wrap = (ui: React.ReactElement) =>
  render(
    <React.StrictMode>
      <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
        {ui}
      </NextIntlClientProvider>
    </React.StrictMode>,
  );

/**
 * メンバー取得の完了をシミュレートする (実物の loadMembers 解決に相当)。
 * members と loading を**同一コミット**で切り替える。
 */
async function resolveMembersLoad() {
  await act(async () => {
    hookMocks.setMembersState({ members: hookMocks.members, loading: false });
  });
}

/** モーダルに最後に渡された props */
const lastModalProps = () => modalMock.props[modalMock.props.length - 1]!;

describe("[V-B40〜B46] web ランキングタブの WAポイント比較ランチャー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modalMock.props = [];
    hookMocks.members = MEMBERS;
    hookMocks.memberBestTimes = new Map();
    hookMocks.membersError = null;
    hookMocks.bestTimesError = null;
    hookMocks.loadAllBestTimes.mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    );
  });

  it("[V-B40] ボタンが描画される", () => {
    wrap(<WaPointsCompareLauncher teamId="team-1" />);
    expect(screen.getByRole("button", { name: BUTTON_LABEL })).toBeInTheDocument();
  });

  it("[V-B41] 初期描画ではメンバーもベストタイムもロードしない (遅延ロード)", () => {
    wrap(<WaPointsCompareLauncher teamId="team-1" />);

    expect(hookMocks.loadMembers).not.toHaveBeenCalled();
    expect(hookMocks.loadAllBestTimes).not.toHaveBeenCalled();
    expect(screen.queryByTestId("wa-points-compare-modal")).toBeNull();
  });

  it("[V-B42] 初回クリックで loadMembers が呼ばれ、モーダルが開く", async () => {
    wrap(<WaPointsCompareLauncher teamId="team-1" />);

    await userEvent.click(screen.getByRole("button", { name: BUTTON_LABEL }));

    expect(hookMocks.loadMembers).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("wa-points-compare-modal")).toBeInTheDocument();
  });

  // ===========================================================================
  // [V-B47] 🚨 Critical C2-1 の回帰ガード
  //   取得が終わったら **必ずローディングが終わる**こと。
  //   effect が自分自身をキャンセルする実装 (cleanup で cancelled=true を立て、
  //   deps に phase を含む形) だと setPhase("ready") が永久に呼ばれず、
  //   ベストタイム取得済みなのにスピナーが回り続ける。
  // ===========================================================================
  it("[V-B47] メンバー取得完了 → ベストタイム取得完了で isLoading が false になる", async () => {
    wrap(<WaPointsCompareLauncher teamId="team-1" />);
    await userEvent.click(screen.getByRole("button", { name: BUTTON_LABEL }));

    // 取得中はスピナー (ここが false だと下の waitFor が最初から通ってしまう)
    expect(screen.getByTestId("wa-modal-loading")).toBeInTheDocument();
    expect(lastModalProps().isLoading).toBe(true);

    // 実物と同じく loading: true → false を**実際に遷移**させる
    await resolveMembersLoad();

    // ベストタイム取得 (非同期) の解決後に ready へ到達する
    await waitFor(() => {
      expect(screen.getByTestId("wa-modal-ready")).toBeInTheDocument();
    });
    expect(lastModalProps().isLoading).toBe(false);
    expect(screen.queryByTestId("wa-modal-loading")).toBeNull();
    expect(hookMocks.loadAllBestTimes).toHaveBeenCalledTimes(1);
    expect(hookMocks.loadAllBestTimes).toHaveBeenCalledWith(MEMBERS);
    // [M3-3] members がまだ [] の段階で呼ばれていないこと (順序バグの検出)。
    // モックは引数を宣言していないので mock.calls の要素型は `[]` になる。
    // 実引数を読むためにここでだけ広げる
    const calls = hookMocks.loadAllBestTimes.mock.calls as unknown as unknown[][];
    for (const call of calls) {
      expect(call[0], "loadAllBestTimes が空配列で呼ばれている").not.toEqual([]);
    }
  });

  it("[V-B47] メンバー0件でも ready に到達する (早期 return による永久スピナーの対照)", async () => {
    hookMocks.members = [];
    wrap(<WaPointsCompareLauncher teamId="team-1" />);
    await userEvent.click(screen.getByRole("button", { name: BUTTON_LABEL }));

    expect(screen.getByTestId("wa-modal-loading")).toBeInTheDocument();
    await resolveMembersLoad();

    await waitFor(() => {
      expect(screen.getByTestId("wa-modal-ready")).toBeInTheDocument();
    });
    expect(lastModalProps().isLoading).toBe(false);
    // 0 件でも呼ぶ (空 Map を確定させて ready にするため)
    expect(hookMocks.loadAllBestTimes).toHaveBeenCalledTimes(1);
  });

  it("[V-B47] ベストタイム取得が遅延しても、解決すれば ready に到達する", async () => {
    let release!: () => void;
    hookMocks.loadAllBestTimes.mockImplementation(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );

    wrap(<WaPointsCompareLauncher teamId="team-1" />);
    await userEvent.click(screen.getByRole("button", { name: BUTTON_LABEL }));
    await resolveMembersLoad();

    // まだ解決していないのでスピナーのまま (「最初から false」ではないことの担保)
    expect(screen.getByTestId("wa-modal-loading")).toBeInTheDocument();
    expect(lastModalProps().isLoading).toBe(true);

    await act(async () => {
      release();
    });

    await waitFor(() => {
      expect(screen.getByTestId("wa-modal-ready")).toBeInTheDocument();
    });
  });

  it("[V-B43] 閉じて再度開いても loadMembers は 1 回のままで、スピナーに戻らない", async () => {
    wrap(<WaPointsCompareLauncher teamId="team-1" />);
    const button = screen.getByRole("button", { name: BUTTON_LABEL });

    await userEvent.click(button);
    expect(hookMocks.loadMembers).toHaveBeenCalledTimes(1);

    await resolveMembersLoad();
    await waitFor(() => expect(screen.getByTestId("wa-modal-ready")).toBeInTheDocument());

    // モーダルに渡された onClose を実プロダクションコード経由で呼ぶ
    const onClose = lastModalProps().onClose as () => void;
    expect(onClose, "WaPointsCompareModal に onClose が渡っていない").toBeTypeOf("function");
    await act(async () => {
      onClose();
    });

    await userEvent.click(button);

    // 再取得しない
    expect(hookMocks.loadMembers).toHaveBeenCalledTimes(1);
    expect(hookMocks.loadAllBestTimes).toHaveBeenCalledTimes(1);
    // [V-B47] 2回目のオープンでスピナーに戻らない (phase が "ready" のまま維持される)
    expect(screen.getByTestId("wa-modal-ready")).toBeInTheDocument();
    expect(screen.queryByTestId("wa-modal-loading")).toBeNull();
    expect(lastModalProps().isLoading).toBe(false);
  });

  it("[V-B44] モーダルに渡る members は useMembers の戻り値と同一参照である", async () => {
    wrap(<WaPointsCompareLauncher teamId="team-1" />);
    await userEvent.click(screen.getByRole("button", { name: BUTTON_LABEL }));
    await resolveMembersLoad();

    const passed = lastModalProps().members as TeamMember[];
    expect(passed).toHaveLength(3);
    expect(passed).toBe(MEMBERS);
  });

  it("[V-B45] gender 未設定メンバーの gender が 0 (男性) に化けない", async () => {
    wrap(<WaPointsCompareLauncher teamId="team-1" />);
    await userEvent.click(screen.getByRole("button", { name: BUTTON_LABEL }));
    await resolveMembersLoad();

    const passed = lastModalProps().members as TeamMember[];
    const unknown = passed.find((m) => m.user_id === "u-unknown");
    expect(unknown, "性別未設定メンバーが渡っていない").toBeDefined();
    expect(unknown!.users.gender).toBeUndefined();
    expect(unknown!.users.gender).not.toBe(0);

    // 対照: 明示的に持っている値は保たれる
    expect(passed.find((m) => m.user_id === "u-male")!.users.gender).toBe(0);
    expect(passed.find((m) => m.user_id === "u-female")!.users.gender).toBe(1);
  });

  // ⚠️ 旧版はクリックしていなかったため phase が "idle" のままで、
  // アサーションが [V-B40] と**バイト単位で同一**の空振りだった。
  // 「ローディング中でも導線を失わない」を名前どおり検証するには、
  // **実際にスピナーが出ている状態**でボタンの存在と有効性を見る必要がある。
  it("[V-B46] スピナー表示中でもボタンは存在し、押せる状態のまま", async () => {
    let release!: () => void;
    hookMocks.loadAllBestTimes.mockImplementation(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );

    wrap(<WaPointsCompareLauncher teamId="team-1" />);
    const button = screen.getByRole("button", { name: BUTTON_LABEL });
    await userEvent.click(button);
    await resolveMembersLoad();

    // 前提: いまスピナーが出ている (これが無いと以下は無意味)
    expect(screen.getByTestId("wa-modal-loading")).toBeInTheDocument();

    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();

    await act(async () => { release(); });
  });

  it("[V-B44 境界] メンバー0件でもボタンは出てクラッシュしない", async () => {
    hookMocks.members = [];
    wrap(<WaPointsCompareLauncher teamId="team-1" />);

    await userEvent.click(screen.getByRole("button", { name: BUTTON_LABEL }));
    expect(screen.getByTestId("wa-points-compare-modal")).toBeInTheDocument();
  });
});
