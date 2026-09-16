// =============================================================================
// TeamRankings.waPointsCompare.test.tsx — QA Sprint Contract Phase A スケルトン
// =============================================================================
//
// 対象: apps/mobile/components/teams/rankings/TeamRankings.tsx (members prop 追加)
//
// ■ スコープB 項目4 (mobile)
//   「WAポイントで比較」ボタン + モーダルをメンバータブ (TeamMemberList) から
//   ランキングタブ (TeamRankings) へ移す。
//   PM 指示:
//     - TeamRankings に members: TeamMembershipWithUser[] prop を追加
//     - ボタン+モーダルは **早期 return (styles 読込中 / エラー) より前** に描画する
//     - rankings タブにサブタブを作らない。個人/リレーどちらでも常時見える位置に置く
//     - members を加工・詰め替えしない (users.gender が落ちて全員男性換算になる既知障害)
//     - WaPointsCompareModal はファイル移動しない (既存テストが相対 import)
//
// ■ Sprint Contract 検証観点
//   [V-B30] ランキングタブに「WAポイントで比較」ボタンがある
//   [V-B31] styles 取得中 (スピナー表示) でもボタンは描画される
//           ← 早期 return より前に置いたことの直接検証。ここが本項目の核心
//   [V-B32] styles 取得エラー (エラー表示) でもボタンは描画される
//   [V-B33] ボタンを押すと WaPointsCompareModal が visible になる
//   [V-B34] モーダルに渡る members は **親から渡された配列そのまま** である。
//           特に users.gender が undefined のメンバーの gender が 0 に化けない
//           (`?? 0` を書くと未設定が「男性」になり点数が静かに全部狂う)
//   [V-B35] ランキングタブにサブタブは無い
//   [V-B36] info アイコンがボタンの右隣にある (メンバータブから一緒に移設)
//   [V-B37] info タップでポップアップが開き、本文が **WA 専用の説明**である
//           (マイページ/メンバー詳細の「点数化の一般説明」と取り違えていない)
//   [V-B38] info タップで比較モーダルは開かない (兄弟要素でバブリングしない)
//
// ■ [V-B36]〜[V-B38] の出自
//   components/teams/__tests__/TeamMemberList.waPointsInfoIcon.test.tsx の
//   [V-WAI-01/02/03] を引き取ったもの。向こうは「メンバータブに無い」の対テストへ
//   反転済みで、**有る側の検証はここが唯一**になる。
//
// ■ jsdom で検証できないこと
//   ボタンが「個人/リレーどちらでも見える位置」にあるかは配置の話であり、
//   jsdom は Flexbox / スクロール位置を解決しない。DOM 上の存在までを保証し、
//   実際の可視性は Android エミュレータ目視 (M-04) で確認する。
//
// ■ 対になる撤去側の検証
//   「メンバータブにボタンが無いこと」は
//   apps/mobile/components/teams/__tests__/TeamMemberList.headerLayout.test.tsx /
//   TeamMemberList.waPointsInfoIcon.test.tsx を Phase B で
//   **削除せず「無いこと」の対テストへ移植**して担保する。
//   移植しないと「どこにも無い」状態でも全 green になる。
// =============================================================================

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import jaMessages from "@apps/shared/messages/ja.json";

const stylesMock = vi.hoisted(() => ({
  impl: async (): Promise<unknown[]> => [],
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles() {
      return stylesMock.impl();
    }
  },
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "me" } }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamRankingsQuery: () => ({
    data: [],
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  }),
  useTeamHasAnyRecordQuery: () => ({ data: false, isLoading: false, isError: false }),
  useTeamRelayRankingsQuery: () => ({
    data: [],
    isLoading: false,
    isError: false,
    isSuccess: true,
    error: null,
    refetch: vi.fn(),
  }),
  useTeamHasAnyRelayRecordQuery: () => ({ data: false, isLoading: false, isError: false }),
}));

// モーダルは実物を描画せず、渡された props を記録する。
// 中身 (点数計算) の検証は既存の wa-points-compare/__tests__/WaPointsCompareModal.test.tsx
// が担っており、ここで再検証すると二重管理になる。ここで見るのは **配線**だけ。
const modalMock = vi.hoisted(() => ({
  props: [] as Record<string, unknown>[],
}));

vi.mock("@/components/teams/wa-points-compare", () => ({
  WaPointsCompareModal: (props: Record<string, unknown>) => {
    modalMock.props.push(props);
    return props.visible ? <div data-testid="wa-points-compare-modal" /> : null;
  },
}));

import { TeamRankings } from "../TeamRankings";

const BUTTON_LABEL = jaMessages.teams.waPointsCompare.buttonLabel;
const INFO_TEST_ID = "team-rankings-wa-info";
const EXPECTED_INFO_TITLE = jaMessages.teams.waPointsCompare.infoAriaLabel;
const EXPECTED_INFO_BODY = jaMessages.teams.waPointsCompare.infoTooltip;
// 取り違え防止の対照: 別名前空間の「点数化の一般説明」
const MYPAGE_BODY = jaMessages.mypage.bestTimesTable.pointsInfo;
const MEMBER_DETAIL_BODY = jaMessages.teams.memberDetail.bestTimesTable.pointsInfo;

// `testID` は RN のプロップ名で、このリポジトリの DOM モックでは Pressable に渡すと
// 生の `testid` 属性として転記される (`data-testid` ではない) ため属性セレクタで取る
function getInfoIcon(container: HTMLElement): HTMLElement {
  const el = container.querySelector(`[testid="${INFO_TEST_ID}"]`);
  if (!el) throw new Error(`testid="${INFO_TEST_ID}" の要素が見つかりません`);
  return el as HTMLElement;
}

// CenterModal の `<Modal animationType="none">` は DOM モックで `animationtype="none"`
// 属性としてそのまま転記されるので、info ポップアップの subtree だけを特定できる
function getInfoModals(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[animationtype="none"]'));
}

function makeMember(
  id: string,
  gender: number | undefined,
  name: string,
): TeamMembershipWithUser {
  return {
    id: `membership-${id}`,
    team_id: "team-1",
    user_id: id,
    role: "user",
    status: "approved",
    is_active: true,
    joined_at: "2025-01-01",
    left_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    // gender を明示的に undefined のまま持たせる (キー自体は存在させない)
    users: gender === undefined ? { id, name } : { id, name, gender },
  } as unknown as TeamMembershipWithUser;
}

const MEMBERS = [
  makeMember("u-unknown", undefined, "性別未設定さん"),
  makeMember("u-male", 0, "男性さん"),
  makeMember("u-female", 1, "女性さん"),
];

function renderRankings(members: TeamMembershipWithUser[] = MEMBERS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeamRankings teamId="team-1" members={members} />
    </QueryClientProvider>,
  );
}

describe("[V-B30〜B35] TeamRankings の「WAポイントで比較」", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modalMock.props = [];
    stylesMock.impl = async () => [
      { id: 3, style: "Fr", distance: 100, name: "Fr100", name_jp: "100m自由形" },
    ];
  });

  it("[V-B30] ランキングタブに「WAポイントで比較」ボタンがある", async () => {
    renderRankings();
    expect(await screen.findByText(BUTTON_LABEL)).toBeTruthy();
  });

  it("[V-B31] styles 取得中 (早期 return のローディング分岐) でもボタンは描画される", () => {
    // 解決しない Promise にして isPending に固定する
    stylesMock.impl = () => new Promise<unknown[]>(() => {});
    renderRankings();

    // 早期 return より **前** に置かれていなければここで落ちる
    expect(screen.getByText(BUTTON_LABEL)).toBeTruthy();
  });

  it("[V-B32] styles 取得エラー (早期 return のエラー分岐) でもボタンは描画される", async () => {
    stylesMock.impl = async () => {
      throw new Error("styles fetch failed");
    };
    renderRankings();

    await waitFor(() => {
      expect(screen.getByText(BUTTON_LABEL)).toBeTruthy();
    });
  });

  it("[V-B33] ボタンを押すとモーダルが visible になる", async () => {
    renderRankings();
    fireEvent.click(await screen.findByText(BUTTON_LABEL));

    await waitFor(() => {
      expect(screen.getByTestId("wa-points-compare-modal")).toBeTruthy();
    });
  });

  it("[V-B34] モーダルに渡る members は親から渡された配列と同一で、gender が 0 に化けない", async () => {
    renderRankings();
    fireEvent.click(await screen.findByText(BUTTON_LABEL));

    await waitFor(() => expect(modalMock.props.length).toBeGreaterThan(0));

    const last = modalMock.props[modalMock.props.length - 1]!;
    const passed = last.members as TeamMembershipWithUser[];

    // 件数は厳密一致 (フィルタで静かに減らしていないこと)
    expect(passed).toHaveLength(3);
    // 詰め替えていないこと = 参照が同一
    expect(passed).toBe(MEMBERS);

    const unknown = passed.find((m) => m.user_id === "u-unknown");
    expect(unknown, "性別未設定メンバーが渡っていない").toBeDefined();
    // ここが本体: `?? 0` を書くと undefined が 0 (男性) になり点数が全部狂う
    expect((unknown!.users as { gender?: number }).gender).toBeUndefined();
    expect((unknown!.users as { gender?: number }).gender).not.toBe(0);

    // 対照: 明示的に持っているメンバーの値は保たれている
    expect(
      (passed.find((m) => m.user_id === "u-male")!.users as { gender?: number }).gender,
    ).toBe(0);
    expect(
      (passed.find((m) => m.user_id === "u-female")!.users as { gender?: number }).gender,
    ).toBe(1);
  });

  it("[V-B34 境界] members が空配列でもボタンは出てクラッシュしない", async () => {
    renderRankings([]);
    expect(await screen.findByText(BUTTON_LABEL)).toBeTruthy();
  });

  it("[V-B35] ランキングタブにサブタブ (個人/リレーの切替トグル) は無い", async () => {
    renderRankings();
    await screen.findByText(BUTTON_LABEL);

    // 既存 docstring が明示的に禁止している「個人種目 / リレー」ビュー切替トグル。
    // 種目は1つのラジオグループで選ぶ仕様なので、この2ラベルが並ぶ UI は存在しない
    expect(screen.queryByText("個人種目")).toBeNull();
    expect(screen.queryByText("リレー")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // [V-B36]〜[V-B38] info アイコン (TeamMemberList.waPointsInfoIcon.test.tsx から移設)
  // ---------------------------------------------------------------------------

  it("[V-B36] info アイコンはボタンと同じ行ラッパー内でボタンの後ろ (右隣) にある", async () => {
    const { container } = renderRankings();
    const button = (await screen.findByText(BUTTON_LABEL)).closest("button")!;
    const infoIcon = getInfoIcon(container);

    // 同じラッパーに属する (WaPointsInfoTooltip 自身の View で1段包まれるため contains)
    const wrapper = button.parentElement!;
    expect(wrapper.contains(infoIcon)).toBe(true);

    // ラッパー内の並び順: ボタン → info アイコン (右隣)
    const wrapperChildren = Array.from(wrapper.children);
    const infoHolderIndex = wrapperChildren.findIndex((el) => el.contains(infoIcon));
    expect(infoHolderIndex).toBeGreaterThan(wrapperChildren.indexOf(button));

    // 画面全体で1個だけ (移設であって複製ではない)
    expect(container.querySelectorAll(`[testid="${INFO_TEST_ID}"]`)).toHaveLength(1);
  });

  it("[V-B37] info タップでポップアップが開き、本文が WA 専用の説明である", async () => {
    const { container } = renderRankings();
    await screen.findByText(BUTTON_LABEL);

    // タップ前はポップアップ未マウント
    expect(getInfoModals(container)).toHaveLength(0);

    fireEvent.click(getInfoIcon(container));

    const modals = getInfoModals(container);
    expect(modals).toHaveLength(1);
    const contentSpans = Array.from(modals[0]!.querySelectorAll("span")).filter(
      (el) => !el.hasAttribute("data-testid"),
    );
    expect(contentSpans[0]?.textContent).toBe(EXPECTED_INFO_TITLE);
    expect(contentSpans[1]?.textContent).toBe(EXPECTED_INFO_BODY);

    // WA 専用の説明であること。別名前空間の汎用説明に取り違えていないこと
    expect(contentSpans[1]?.textContent).toContain("World Aquatics");
    expect(contentSpans[1]?.textContent).not.toBe(MYPAGE_BODY);
    expect(contentSpans[1]?.textContent).not.toBe(MEMBER_DETAIL_BODY);
  });

  it("[V-B38] info タップで比較モーダルは開かない (兄弟要素でバブリングしない)", async () => {
    const { container } = renderRankings();
    await screen.findByText(BUTTON_LABEL);

    fireEvent.click(getInfoIcon(container));

    // info ポップアップは開く
    expect(getInfoModals(container)).toHaveLength(1);
    // 比較モーダルは開かない
    expect(screen.queryByTestId("wa-points-compare-modal")).toBeNull();
    const lastModalProps = modalMock.props[modalMock.props.length - 1];
    expect(lastModalProps?.visible).toBe(false);
  });
});
