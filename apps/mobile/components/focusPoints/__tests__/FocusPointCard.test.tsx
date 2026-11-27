/**
 * FocusPointCard (ホームのカルーセル・目標タブのフォーカスポイント)
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { Alert } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusPoint } from "@apps/shared/types";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  query: { data: [] as FocusPoint[] | undefined, isPending: false, isError: false },
}));

vi.mock("@apps/shared/hooks/queries/focusPoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apps/shared/hooks/queries/focusPoints")>();
  return { ...actual, useFocusPointsQuery: () => mocks.query };
});
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));
vi.mock("@/hooks/useDateLocale", () => ({ useDateLocale: () => "ja" }));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mocks.navigate }),
}));

import { FocusPointCard } from "../FocusPointCard";

const point = (overrides: Partial<FocusPoint> = {}): FocusPoint => ({
  id: "fp-1",
  user_id: "user-1",
  title: "右手の入水を遠くに",
  note: null,
  status: "active",
  mastered_at: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  ...overrides,
});

const threeActive = [
  point({ id: "a", title: "右手の入水を遠くに" }),
  point({ id: "b", title: "キックとプルのタイミングを合わせる", note: "コーチに言われた" }),
  point({ id: "c", title: "腰を浮かせる" }),
];

beforeEach(() => {
  mocks.navigate.mockReset();
  vi.mocked(Alert.alert).mockReset();
  mocks.query = { data: [], isPending: false, isError: false };
});

describe("FocusPointCard", () => {
  it("0件なら案内を出し、ボタンで追加フォームを開く", () => {
    const { getByText } = render(<FocusPointCard />);
    expect(getByText("泳ぎで意識したいことを書いておこう")).toBeTruthy();
    fireEvent.click(getByText("フォーカスポイントを追加"));
    expect(mocks.navigate).toHaveBeenCalledWith("FocusPointForm", {});
  });

  it("取り組み中を並べ、行を押すとその行の編集を開く", () => {
    mocks.query = { data: threeActive, isPending: false, isError: false };
    const { getByText } = render(<FocusPointCard />);
    expect(getByText("3 / 3")).toBeTruthy();
    expect(getByText("コーチに言われた")).toBeTruthy();
    fireEvent.click(getByText("腰を浮かせる"));
    expect(mocks.navigate).toHaveBeenCalledWith("FocusPointForm", { focusPointId: "c" });
  });

  it("3つあるときは「＋ 追加」を押せない (押してもフォームを開かない)", () => {
    mocks.query = { data: threeActive, isPending: false, isError: false };
    const { getByText } = render(<FocusPointCard />);
    const add = getByText("＋ 追加").closest("button")!;
    expect(add.hasAttribute("disabled")).toBe(true);
    fireEvent.click(add);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("2つなら追加フォームを開ける", () => {
    mocks.query = { data: threeActive.slice(0, 2), isPending: false, isError: false };
    const { getByText } = render(<FocusPointCard />);
    fireEvent.click(getByText("＋ 追加"));
    expect(mocks.navigate).toHaveBeenCalledWith("FocusPointForm", {});
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it("身についたものはホームでは出さず、目標タブ (showMastered) では開くと出る", () => {
    mocks.query = {
      data: [
        point({ id: "a" }),
        point({
          id: "m",
          title: "ストリームラインを締める",
          status: "mastered",
          mastered_at: "2026-10-01T00:00:00Z",
        }),
      ],
      isPending: false,
      isError: false,
    };
    const home = render(<FocusPointCard />);
    expect(home.queryByText("身についた（1）")).toBeNull();
    home.unmount();

    const { getByText, queryByText } = render(<FocusPointCard showMastered />);
    expect(queryByText("ストリームラインを締める")).toBeNull();
    fireEvent.click(getByText("身についた（1）"));
    expect(getByText("ストリームラインを締める")).toBeTruthy();
  });

  it("まだ読み込んでいない間 (ログイン直後でクエリが無効のときも) は空の案内を出さない", () => {
    mocks.query = { data: undefined, isPending: true, isError: false };
    const { queryByText } = render(<FocusPointCard />);
    expect(queryByText("泳ぎで意識したいことを書いておこう")).toBeNull();
    expect(queryByText("フォーカスポイントを追加")).toBeNull();
    expect(queryByText("フォーカスポイント")).toBeNull(); // 見出しも出さず、読み込み中の表示だけ
  });

  it("取得に失敗したらエラー文を出す", () => {
    mocks.query = { data: undefined, isPending: false, isError: true };
    const { getByText } = render(<FocusPointCard />);
    expect(getByText("フォーカスポイントを読み込めませんでした")).toBeTruthy();
  });
});
