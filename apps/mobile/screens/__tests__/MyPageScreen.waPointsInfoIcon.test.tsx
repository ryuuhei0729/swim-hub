// =============================================================================
// MyPageScreen.waPointsInfoIcon.test.tsx
// =============================================================================
// QA Sprint Contract 検証 (文言変更スプリント item #4): マイページの WAポイント表示トグル
// (`best-times-wa-points-toggle-mypage`) 横の info アイコン (`best-times-wa-info-mypage`) は、
// 従来 `teams.waPointsCompare.infoTooltip` (WA専用の説明) にフォールバックしていた。
// 比較指標プルダウンの新設 (WA/日本記録/区分の3基準が選べるようになった) に伴い、
// プルダウンで「日本記録基準」を選んでいても WA の説明が出てしまう不整合を解消するため、
// どの基準でも通用する算出式の一般的な説明
// (`mypage.bestTimesTable.pointsInfo` / `pointsInfoAriaLabel`) を明示的に渡すよう配線し
// 直された。本ファイルはこの配線が実際に効いていることを検証する
// (web 版 `apps/web/__tests__/components/profile/BestTimesTable.infoIcon.test.tsx` の
// mobile 相当。mobile 側にこの観点のテストがまだ無かったため新設する)。
//
// Sprint Contract 検証観点:
//   [V-PI-01] info アイコンをタップすると開くポップアップのタイトルが
//             mypage.bestTimesTable.pointsInfoAriaLabel と一致する
//             (旧フォールバック teams.waPointsCompare.infoAriaLabel = "WAポイントとは" ではない)
//   [V-PI-02] ポップアップの本文が mypage.bestTimesTable.pointsInfo と一致する
//             (旧フォールバック teams.waPointsCompare.infoTooltip ではない。
//             "World Aquatics" という WA 固有の文言を含まないことも確認する)
//
// ## モック方針
// `screens/__tests__/MyPageScreen.waPointsGenderWiring.test.tsx` / `.waToggleAdjacency.test.tsx`
// (前任 QA 確立) と同じ `createTableDispatchSupabase` + `RecordAPI.getBestTimes` モックの
// 実物 react-query フック経由で MyPageScreen をレンダリングする。
// =============================================================================

import { QueryClient } from "@tanstack/react-query";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createTableDispatchSupabase } from "./utils/tableSupabaseMock";
import jaMessages from "@apps/shared/messages/ja.json";
import { createWrapper, harness, USER_ID } from "./myPageScreenHarness";
import { MyPageScreen } from "../MyPageScreen";

let supabaseMock: ReturnType<typeof createTableDispatchSupabase>;


const FR100_RECORD = {
  id: "rec-1",
  time: 54.97,
  created_at: "2020-01-01T00:00:00.000Z",
  pool_type: 0,
  is_relaying: false,
  note: null,
  style_id: 1,
  style: { name_jp: "100m自由形", distance: 100 },
  competition: { title: "テスト大会", date: "2020-01-01" },
};

function setup() {
  supabaseMock = createTableDispatchSupabase({
    userId: USER_ID,
    tables: {
      users: { data: { id: USER_ID, name: "テストユーザー", gender: 0 } },
    },
  });
  harness.supabase = supabaseMock.client;
  harness.getMyTeams.mockResolvedValue([]);
  harness.getBestTimes.mockResolvedValue([FR100_RECORD]);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(<MyPageScreen />, { wrapper: createWrapper(queryClient) });
}

const EXPECTED_ARIA_LABEL = jaMessages.mypage.bestTimesTable.pointsInfoAriaLabel;
const EXPECTED_TOOLTIP_TEXT = jaMessages.mypage.bestTimesTable.pointsInfo;
const FALLBACK_WA_ARIA_LABEL = jaMessages.teams.waPointsCompare.infoAriaLabel;
const FALLBACK_WA_TOOLTIP_TEXT = jaMessages.teams.waPointsCompare.infoTooltip;

// `CenterModal` (`components/ui/CenterModal.tsx`) の `<Modal animationType="none">` は
// このリポジトリの DOM モックでは `animationtype="none"` 属性としてそのまま転記される
// (`transparent`/`statusBarTranslucent` は boolean のため非標準属性として黙って落とされ、
// DOM 上には現れない)。これを目印にモーダルの subtree だけに絞り込み、画面全体に無数にある
// 無関係な span (種目名・タブラベル等) を誤取得しないようにする。
function getTitleAndBodySpans(container: HTMLElement): { titleEl?: Element; bodyEl?: Element } {
  const modal = container.querySelector('[animationtype="none"]');
  if (!modal) return {};
  const contentSpans = Array.from(modal.querySelectorAll("span")).filter(
    (el) => !el.hasAttribute("data-testid"),
  );
  return { titleEl: contentSpans[0], bodyEl: contentSpans[1] };
}

describe("[V-PI] MyPageScreen — WAポイントトグル横の info アイコン", () => {
  it("[V-PI-01/02] info アイコンをタップすると、ポップアップのタイトル/本文が pointsInfoAriaLabel/pointsInfo と一致し、旧WA専用フォールバックではない", async () => {
    const { container } = setup();

    await screen.findByText("54.97");

    const infoIcon = container.querySelector('[testid="best-times-wa-info-mypage"]') as HTMLElement;
    expect(infoIcon).toBeTruthy();
    fireEvent.click(infoIcon);

    const { titleEl, bodyEl } = getTitleAndBodySpans(container);
    expect(titleEl).toBeTruthy();
    expect(bodyEl).toBeTruthy();

    expect(titleEl!.textContent).toBe(EXPECTED_ARIA_LABEL);
    expect(bodyEl!.textContent).toBe(EXPECTED_TOOLTIP_TEXT);

    // 退行検出: ariaLabel/tooltipText を渡し忘れて teams.waPointsCompare.* (WA専用) に
    // フォールバックしていないこと
    expect(titleEl!.textContent).not.toBe(FALLBACK_WA_ARIA_LABEL);
    expect(bodyEl!.textContent).not.toBe(FALLBACK_WA_TOOLTIP_TEXT);
    expect(bodyEl!.textContent).not.toContain("World Aquatics");
  });
});
