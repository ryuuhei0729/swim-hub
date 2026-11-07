import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { NextCompetitionData } from "@apps/shared/hooks/queries/dashboard";
import { useAuth } from "@/contexts";
import { renderWithI18n } from "@/__tests__/utils/render";
import { buildAuthContext } from "@/__tests__/utils/authContext";
import NextCompetitionCard from "../NextCompetitionCard";

const mocks = vi.hoisted(() => ({
  nextCompetition: {
    data: undefined as NextCompetitionData | null | undefined,
    isLoading: false,
    isError: false,
  },
  bestTimes: [] as unknown[],
  today: "2026-11-07" as string | null,
}));

vi.mock("@/contexts");
vi.mock("@/i18n/navigation");
vi.mock("@/hooks/useBrowserToday", () => ({ useBrowserToday: () => mocks.today }));
vi.mock("@apps/shared/hooks/queries/dashboard", () => ({
  useNextCompetitionQuery: () => mocks.nextCompetition,
}));
vi.mock("@apps/shared/hooks/queries/records", () => ({
  useBestTimesQuery: () => ({ data: mocks.bestTimes }),
}));

const competition = (overrides: Partial<NextCompetitionData["competition"]> = {}) => ({
  id: "c1",
  title: "区民秋季水泳記録会",
  date: "2026-11-19",
  end_date: null,
  place: "区立総合体育館",
  pool_type: 1,
  team_id: null,
  entry_status: null,
  ...overrides,
});

const fr100 = { id: 2, name_jp: "100m自由形", distance: 100, style: "Fr" as const };
const im200 = { id: 5, name_jp: "200m個人メドレー", distance: 200, style: "IM" as const };

function renderCard(props: Partial<React.ComponentProps<typeof NextCompetitionCard>> = {}) {
  const handlers = {
    hasTeams: false,
    openEntryLogForm: vi.fn(),
    onAddCompetition: vi.fn(),
    onSetGoal: vi.fn(),
    onOpenDay: vi.fn(),
    ...props,
  };
  renderWithI18n(<NextCompetitionCard {...handlers} />);
  return handlers;
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(buildAuthContext({ user: { id: "me" } }));
  mocks.nextCompetition = { data: undefined, isLoading: false, isError: false };
  mocks.bestTimes = [];
  mocks.today = "2026-11-07";
});

describe("NextCompetitionCard", () => {
  it("読み込み中はスケルトンを出す", () => {
    mocks.nextCompetition = { data: undefined, isLoading: true, isError: false };
    renderCard();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("取得に失敗したらエラー文を出す", () => {
    mocks.nextCompetition = { data: undefined, isLoading: false, isError: true };
    renderCard();
    expect(screen.getByText("次の大会を読み込めませんでした")).toBeInTheDocument();
  });

  describe("予定の大会なし", () => {
    beforeEach(() => {
      mocks.nextCompetition = { data: null, isLoading: false, isError: false };
    });

    it("案内と「大会を登録」を出し、押すと onAddCompetition を呼ぶ", () => {
      const { onAddCompetition } = renderCard();
      expect(screen.getByText("予定している大会はありません")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "＋ 大会を登録" }));
      expect(onAddCompetition).toHaveBeenCalledTimes(1);
    });

    it("チームに入っていなければ「チームの大会を見る」を出さない", () => {
      renderCard({ hasTeams: false });
      expect(screen.queryByText("チームの大会を見る")).toBeNull();
    });

    it("チームに入っていれば「チームの大会を見る」を /teams へのリンクで出す", () => {
      renderCard({ hasTeams: true });
      expect(screen.getByRole("link", { name: "チームの大会を見る" })).toHaveAttribute(
        "href",
        "/teams",
      );
    });
  });

  describe("エントリー未登録", () => {
    it("受付中のチーム大会は「エントリーする」を出し、押すとその大会のエントリーを開く", () => {
      mocks.nextCompetition = {
        data: { competition: competition({ team_id: "t1", entry_status: "open" }), entries: [], goals: [] },
        isLoading: false,
        isError: false,
      };
      const { openEntryLogForm } = renderCard();
      expect(screen.getByText("まだエントリーしていません")).toBeInTheDocument();
      expect(screen.getByText("エントリー受付中")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "エントリーする" }));
      expect(openEntryLogForm).toHaveBeenCalledWith("c1");
    });

    it("受付前のチーム大会はボタンを出さない", () => {
      mocks.nextCompetition = {
        data: { competition: competition({ team_id: "t1", entry_status: "before" }), entries: [], goals: [] },
        isLoading: false,
        isError: false,
      };
      renderCard();
      expect(screen.getByText("エントリーの受付はまだ始まっていません")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "エントリーする" })).toBeNull();
    });

    it("自分で登録した大会は「種目を登録」を出す", () => {
      mocks.nextCompetition = {
        data: { competition: competition(), entries: [], goals: [] },
        isLoading: false,
        isError: false,
      };
      const { openEntryLogForm } = renderCard();
      fireEvent.click(screen.getByRole("button", { name: "種目を登録" }));
      expect(openEntryLogForm).toHaveBeenCalledWith("c1");
    });
  });

  describe("エントリーあり", () => {
    it("「次の大会（日付）」「大会名（水路）」・日数と、種目ごとのベスト・目標・目標までの差を出す", () => {
      mocks.nextCompetition = {
        data: {
          competition: competition(),
          entries: [
            { id: "e1", style_id: 2, entry_time: 56.2, is_relaying: false, style: fr100 },
            { id: "e2", style_id: 5, entry_time: 133.8, is_relaying: false, style: im200 },
          ],
          goals: [{ id: "g1", style_id: 2, target_time: 55.5 }],
        },
        isLoading: false,
        isError: false,
      };
      mocks.bestTimes = [
        { id: "b1", time: 56.12, pool_type: 1, is_relaying: false, style_id: 2, created_at: "", style: { name_jp: "", distance: 100 } },
        { id: "b2", time: 133.48, pool_type: 1, is_relaying: false, style_id: 5, created_at: "", style: { name_jp: "", distance: 200 } },
      ];
      const { onSetGoal } = renderCard();

      expect(screen.getByText("次の大会（2026/11/19）")).toBeInTheDocument();
      expect(screen.getByText("区民秋季水泳記録会（長水路）")).toBeInTheDocument();
      expect(screen.getByText("12")).toBeInTheDocument();

      const fr = screen.getByText("100m Fr").closest("tr")!;
      expect(within(fr).getByText("56.12")).toBeInTheDocument();
      expect(within(fr).getByText("55.50")).toBeInTheDocument();
      expect(within(fr).getByText("-0.62")).toBeInTheDocument();

      const im = screen.getByText("200m IM").closest("tr")!;
      expect(within(im).getByText("2:13.48")).toBeInTheDocument();
      fireEvent.click(within(im).getByRole("button", { name: "＋ 目標を設定" }));
      // その大会・種目を選んだ状態で目標作成を開く
      expect(onSetGoal).toHaveBeenCalledWith({ competitionId: "c1", styleId: 5 });
    });

    it("カードのどこを押しても (上部・種目の行) その大会日の詳細を開く。「＋ 目標を設定」は除く", () => {
      mocks.nextCompetition = {
        data: {
          competition: competition(),
          entries: [{ id: "e1", style_id: 2, entry_time: null, is_relaying: false, style: fr100 }],
          goals: [],
        },
        isLoading: false,
        isError: false,
      };
      const { onOpenDay, onSetGoal } = renderCard();
      fireEvent.click(screen.getByText("区民秋季水泳記録会（長水路）"));
      expect(onOpenDay).toHaveBeenCalledTimes(1);
      expect(onOpenDay).toHaveBeenLastCalledWith("2026-11-19");
      // 種目の行 (ボタン以外) を押しても開く
      fireEvent.click(screen.getByText("100m Fr"));
      expect(onOpenDay).toHaveBeenCalledTimes(2);
      // 「＋ 目標を設定」は目標作成だけを開き、詳細は開かない
      fireEvent.click(screen.getByRole("button", { name: "＋ 目標を設定" }));
      expect(onOpenDay).toHaveBeenCalledTimes(2);
      expect(onSetGoal).toHaveBeenCalledTimes(1);
    });

    it("ベストが無い種目に「初」を付ける", () => {
      mocks.nextCompetition = {
        data: {
          competition: competition(),
          entries: [{ id: "e1", style_id: 2, entry_time: null, is_relaying: false, style: fr100 }],
          goals: [],
        },
        isLoading: false,
        isError: false,
      };
      renderCard();
      expect(screen.getByText("初")).toBeInTheDocument();
    });

    it("リレーのエントリーには「リレー」を付け、ベスト・目標・「目標を設定」を出さない", () => {
      mocks.nextCompetition = {
        data: {
          competition: competition(),
          entries: [{ id: "r1", style_id: 2, entry_time: null, is_relaying: true, style: fr100 }],
          goals: [{ id: "g1", style_id: 2, target_time: 55.5 }],
        },
        isLoading: false,
        isError: false,
      };
      mocks.bestTimes = [
        { id: "b1", time: 56.12, pool_type: 1, is_relaying: false, style_id: 2, created_at: "", style: { name_jp: "", distance: 100 } },
      ];
      renderCard();
      const row = screen.getByText("100m Fr").closest("tr")!;
      expect(within(row).getByText("リレー")).toBeInTheDocument();
      expect(within(row).queryByText("56.12")).toBeNull();
      expect(within(row).queryByText("55.50")).toBeNull();
      expect(within(row).queryByRole("button", { name: "＋ 目標を設定" })).toBeNull();
    });

    it("ベストが目標に届いていれば「達成」を出す", () => {
      mocks.nextCompetition = {
        data: {
          competition: competition(),
          entries: [{ id: "e1", style_id: 2, entry_time: null, is_relaying: false, style: fr100 }],
          goals: [{ id: "g1", style_id: 2, target_time: 57 }],
        },
        isLoading: false,
        isError: false,
      };
      mocks.bestTimes = [
        { id: "b1", time: 56.12, pool_type: 1, is_relaying: false, style_id: 2, created_at: "", style: { name_jp: "", distance: 100 } },
      ];
      renderCard();
      expect(screen.getByText("達成")).toBeInTheDocument();
    });

    it("大会当日は「今日」、開催中の複数日大会は「開催中」を出す", () => {
      mocks.nextCompetition = {
        data: {
          competition: competition({ date: "2026-11-07" }),
          entries: [{ id: "e1", style_id: 2, entry_time: null, is_relaying: false, style: fr100 }],
          goals: [],
        },
        isLoading: false,
        isError: false,
      };
      const { unmount } = renderWithI18n(
        <NextCompetitionCard
          hasTeams={false}
          openEntryLogForm={vi.fn()}
          onAddCompetition={vi.fn()}
          onSetGoal={vi.fn()}
          onOpenDay={vi.fn()}
        />,
      );
      expect(screen.getByText("今日")).toBeInTheDocument();
      unmount();

      mocks.nextCompetition = {
        data: {
          competition: competition({ date: "2026-11-06", end_date: "2026-11-08" }),
          entries: [{ id: "e1", style_id: 2, entry_time: null, is_relaying: false, style: fr100 }],
          goals: [],
        },
        isLoading: false,
        isError: false,
      };
      const { onSetGoal } = renderCard();
      expect(screen.getByText("開催中")).toBeInTheDocument();
      // 開催中の大会は目標フォームの大会一覧 (今日以降) に無いので、種目だけを渡す
      fireEvent.click(screen.getByRole("button", { name: "＋ 目標を設定" }));
      expect(onSetGoal).toHaveBeenCalledWith({ competitionId: undefined, styleId: 2 });
    });
  });
});
