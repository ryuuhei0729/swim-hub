/**
 * NextCompetitionCard (ホームの「次の大会」) の状態ごとの表示と遷移先。
 * 日付は new Date() からの相対で作る (カードは端末の今日で日数を数える)。
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { addDays, format } from "date-fns";
import type { NextCompetitionData } from "@apps/shared/hooks/queries/dashboard";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  onOpenDay: vi.fn(),
  nextCompetition: {
    data: undefined as NextCompetitionData | null | undefined,
    isLoading: false,
    isError: false,
  },
  bestTimes: [] as unknown[],
}));

vi.mock("@apps/shared/hooks/queries/dashboard", () => ({
  useNextCompetitionQuery: () => mocks.nextCompetition,
}));
vi.mock("@apps/shared/hooks/queries/records", () => ({
  useBestTimesQuery: () => ({ data: mocks.bestTimes }),
}));
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));
vi.mock("@/hooks/useDateLocale", () => ({ useDateLocale: () => "ja" }));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mocks.navigate }),
}));

import { NextCompetitionCard } from "../NextCompetitionCard";

const TODAY = format(new Date(), "yyyy-MM-dd");
const IN_12_DAYS = format(addDays(new Date(), 12), "yyyy-MM-dd");

const competition = (overrides: Partial<NextCompetitionData["competition"]> = {}) => ({
  id: "c1",
  title: "区民秋季水泳記録会",
  date: IN_12_DAYS,
  end_date: null,
  place: "区立総合体育館",
  pool_type: 1,
  team_id: null,
  entry_status: null,
  ...overrides,
});

const fr100 = { id: 2, name_jp: "100m自由形", distance: 100, style: "Fr" as const };

const setData = (data: NextCompetitionData | null) => {
  mocks.nextCompetition = { data, isLoading: false, isError: false };
};

beforeEach(() => {
  mocks.nextCompetition = { data: undefined, isLoading: false, isError: false };
  mocks.bestTimes = [];
});

describe("NextCompetitionCard", () => {
  it("取得に失敗したらエラー文を出す", () => {
    mocks.nextCompetition = { data: undefined, isLoading: false, isError: true };
    const { getByText } = render(<NextCompetitionCard hasTeams={false} onOpenDay={mocks.onOpenDay} />);
    expect(getByText("次の大会を読み込めませんでした")).toBeTruthy();
  });

  it("予定の大会が無ければ案内を出し、「大会を登録」で今日の日付の大会フォームを開く", () => {
    setData(null);
    const { getByText, queryByText } = render(<NextCompetitionCard hasTeams={false} onOpenDay={mocks.onOpenDay} />);
    expect(getByText("予定している大会はありません")).toBeTruthy();
    expect(queryByText("チームの大会を見る")).toBeNull();
    fireEvent.click(getByText("＋ 大会を登録"));
    expect(mocks.navigate).toHaveBeenCalledWith("CompetitionTabForm", { date: TODAY });
  });

  it("チームに入っていれば「チームの大会を見る」でチームタブを開く", () => {
    setData(null);
    const { getByText } = render(<NextCompetitionCard hasTeams onOpenDay={mocks.onOpenDay} />);
    fireEvent.click(getByText("チームの大会を見る"));
    expect(mocks.navigate).toHaveBeenCalledWith("MainTabs", { screen: "Teams" });
  });

  it("受付中のチーム大会でエントリーが無ければ「エントリーする」でエントリータブを開く", () => {
    setData({ competition: competition({ team_id: "t1", entry_status: "open" }), entries: [], goals: [] });
    const { getByText } = render(<NextCompetitionCard hasTeams onOpenDay={mocks.onOpenDay} />);
    expect(getByText("まだエントリーしていません")).toBeTruthy();
    fireEvent.click(getByText("エントリーする"));
    expect(mocks.navigate).toHaveBeenCalledWith("CompetitionTabForm", {
      competitionId: "c1",
      date: IN_12_DAYS,
      initialTab: "entry",
    });
  });

  it("受付前のチーム大会はボタンを出さない", () => {
    setData({ competition: competition({ team_id: "t1", entry_status: "before" }), entries: [], goals: [] });
    const { getByText, queryByText } = render(<NextCompetitionCard hasTeams onOpenDay={mocks.onOpenDay} />);
    expect(getByText("エントリーの受付はまだ始まっていません")).toBeTruthy();
    expect(queryByText("エントリーする")).toBeNull();
  });

  it("エントリーがあれば日数・ベスト・目標タイムを出し、目標の無い種目は「＋ 目標」で目標作成を開く", () => {
    setData({
      competition: competition(),
      entries: [
        { id: "e1", style_id: 2, entry_time: 56.2, is_relaying: false, style: fr100 },
        { id: "e2", style_id: 5, entry_time: null, is_relaying: false, style: { id: 5, name_jp: "200m個人メドレー", distance: 200, style: "IM" } },
      ],
      goals: [{ id: "g1", style_id: 2, target_time: 55.5 }],
    });
    mocks.bestTimes = [
      { id: "b1", time: 56.12, pool_type: 1, is_relaying: false, style_id: 2, created_at: "", style: { name_jp: "", distance: 100 } },
    ];
    const { getByText, queryByText } = render(<NextCompetitionCard hasTeams={false} onOpenDay={mocks.onOpenDay} />);

    expect(getByText(`次の大会（${format(addDays(new Date(), 12), "yyyy/MM/dd")}）`)).toBeTruthy();
    expect(getByText("区民秋季水泳記録会")).toBeTruthy();
    expect(getByText("区立総合体育館（長水路）")).toBeTruthy();
    expect(getByText("12")).toBeTruthy();
    expect(getByText("ベスト 56.12")).toBeTruthy();
    // 目標は差 (-0.62) ではなく目標タイムのラベルで出し、押すとその目標の詳細を開く
    fireEvent.click(getByText("目標 55.50"));
    expect(mocks.navigate).toHaveBeenCalledWith("GoalDetail", { goalId: "g1" });
    expect(queryByText("-0.62")).toBeNull();
    // ベストが無い種目には「初」を付け、「ベスト —」は出さない
    expect(getByText("初")).toBeTruthy();
    expect(queryByText("ベスト —")).toBeNull();
    // その大会・種目を選んだ状態で目標フォームを開く
    fireEvent.click(getByText("＋ 目標"));
    expect(mocks.navigate).toHaveBeenCalledWith("GoalForm", { competitionId: "c1", styleId: 5 });
  });


  it("自分で登録した大会でエントリーが無ければ「種目を登録」でエントリータブを開く", () => {
    setData({ competition: competition(), entries: [], goals: [] });
    const { getByText } = render(<NextCompetitionCard hasTeams={false} onOpenDay={mocks.onOpenDay} />);
    fireEvent.click(getByText("種目を登録"));
    expect(mocks.navigate).toHaveBeenCalledWith("CompetitionTabForm", {
      competitionId: "c1",
      date: IN_12_DAYS,
      initialTab: "entry",
    });
  });

  it("リレーのエントリーには「リレー」を付け、ベストも目標も出さない", () => {
    setData({
      competition: competition(),
      entries: [{ id: "r1", style_id: 2, entry_time: null, is_relaying: true, style: fr100 }],
      goals: [{ id: "g1", style_id: 2, target_time: 55.5 }],
    });
    mocks.bestTimes = [
      { id: "b1", time: 56.12, pool_type: 1, is_relaying: false, style_id: 2, created_at: "", style: { name_jp: "", distance: 100 } },
    ];
    const { getByText, queryByText } = render(<NextCompetitionCard hasTeams={false} onOpenDay={mocks.onOpenDay} />);
    expect(getByText("リレー")).toBeTruthy();
    expect(queryByText("ベスト 56.12")).toBeNull();
    expect(queryByText("＋ 目標")).toBeNull();
    expect(queryByText(/-0\.62/)).toBeNull();
  });

  it("ベストが目標に届いていても「達成」ではなく目標タイムを出す", () => {
    setData({
      competition: competition(),
      entries: [{ id: "e1", style_id: 2, entry_time: null, is_relaying: false, style: fr100 }],
      goals: [{ id: "g1", style_id: 2, target_time: 57 }],
    });
    mocks.bestTimes = [
      { id: "b1", time: 56.12, pool_type: 1, is_relaying: false, style_id: 2, created_at: "", style: { name_jp: "", distance: 100 } },
    ];
    const { getByText, queryByText } = render(<NextCompetitionCard hasTeams={false} onOpenDay={mocks.onOpenDay} />);
    expect(getByText("目標 57.00")).toBeTruthy();
    expect(queryByText("達成")).toBeNull();
  });

  it("目標があってベストが無い種目は、目標タイムを出す", () => {
    setData({
      competition: competition(),
      entries: [{ id: "e1", style_id: 2, entry_time: null, is_relaying: false, style: fr100 }],
      goals: [{ id: "g1", style_id: 2, target_time: 55.5 }],
    });
    const { getByText } = render(<NextCompetitionCard hasTeams={false} onOpenDay={mocks.onOpenDay} />);
    expect(getByText("目標 55.50")).toBeTruthy();
  });

  it("場所が無い大会は水路だけを出す", () => {
    setData({ competition: competition({ place: null, pool_type: 0 }), entries: [], goals: [] });
    const { getByText } = render(<NextCompetitionCard hasTeams={false} onOpenDay={mocks.onOpenDay} />);
    expect(getByText("短水路")).toBeTruthy();
  });

  it("開催中の複数日大会は「開催中」を出す", () => {
    const yesterday = format(addDays(new Date(), -1), "yyyy-MM-dd");
    const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
    setData({
      competition: competition({ date: yesterday, end_date: tomorrow }),
      entries: [{ id: "e1", style_id: 2, entry_time: null, is_relaying: false, style: fr100 }],
      goals: [],
    });
    const { getByText } = render(<NextCompetitionCard hasTeams={false} onOpenDay={mocks.onOpenDay} />);
    expect(getByText("開催中")).toBeTruthy();
    // 開催中の大会は目標フォームの大会一覧 (今日以降) に無いので、種目だけを渡す
    fireEvent.click(getByText("＋ 目標"));
    expect(mocks.navigate).toHaveBeenCalledWith("GoalForm", { styleId: 2 });
  });

  it("読み込み中はインジケーターだけを出す", () => {
    mocks.nextCompetition = { data: undefined, isLoading: true, isError: false };
    const { queryByText } = render(<NextCompetitionCard hasTeams={false} onOpenDay={mocks.onOpenDay} />);
    expect(queryByText("次の大会")).toBeNull();
    expect(queryByText("予定している大会はありません")).toBeNull();
  });

  it("カードのどこを押しても (上部・種目の行) その大会日の詳細を開く", () => {
    setData({
      competition: competition(),
      entries: [{ id: "e1", style_id: 2, entry_time: null, is_relaying: false, style: fr100 }],
      goals: [],
    });
    const { getByText } = render(<NextCompetitionCard hasTeams={false} onOpenDay={mocks.onOpenDay} />);
    fireEvent.click(getByText("区民秋季水泳記録会"));
    expect(mocks.onOpenDay).toHaveBeenLastCalledWith(IN_12_DAYS);
    fireEvent.click(getByText("100m Fr"));
    expect(mocks.onOpenDay).toHaveBeenCalledTimes(2);
    // 「＋ 目標」を押したときに詳細が開かないことは、jsdom の Pressable モックが外側へ伝播するため
    // ここでは検証できない (実機は内側の Pressable だけが押下を受け取る)。シミュレータで確認する
  });

  it("大会当日は日数の代わりに「今日」を出す", () => {
    setData({
      competition: competition({ date: TODAY }),
      entries: [{ id: "e1", style_id: 2, entry_time: null, is_relaying: false, style: fr100 }],
      goals: [],
    });
    const { getByText } = render(<NextCompetitionCard hasTeams={false} onOpenDay={mocks.onOpenDay} />);
    expect(getByText("今日")).toBeTruthy();
  });
});
