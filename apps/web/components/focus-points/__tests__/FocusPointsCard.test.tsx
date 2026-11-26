/**
 * FocusPointsCard (ダッシュボード・目標ページのフォーカスポイント) と追加・編集モーダル
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useAuth } from "@/contexts";
import { renderWithI18n } from "@/__tests__/utils/render";
import { buildAuthContext } from "@/__tests__/utils/authContext";
import { FocusPointLimitError } from "@apps/shared/api/focusPoints";
import type { FocusPoint } from "@apps/shared/types";
import FocusPointsCard from "../FocusPointsCard";

const mocks = vi.hoisted(() => ({
  query: { data: [] as FocusPoint[] | undefined, isLoading: false, isError: false },
  create: vi.fn<(variables: unknown) => Promise<unknown>>(),
  update: vi.fn<(variables: unknown) => Promise<unknown>>(),
  setStatus: vi.fn<(variables: unknown) => Promise<unknown>>(),
  remove: vi.fn<(variables: unknown) => Promise<unknown>>(),
}));

vi.mock("@/contexts");
vi.mock("@apps/shared/hooks/queries/focusPoints", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apps/shared/hooks/queries/focusPoints")>();
  // 実物の useMutation と同じく、実行中は isPending を true にする (保存中の振る舞いを見るため)
  const { useState } = await import("react");
  const useMockMutation = (fn: (variables: unknown) => Promise<unknown>) => {
    const [isPending, setIsPending] = useState(false);
    return {
      isPending,
      mutateAsync: async (variables: unknown) => {
        setIsPending(true);
        try {
          return await fn(variables);
        } finally {
          setIsPending(false);
        }
      },
    };
  };
  return {
    ...actual,
    useFocusPointsQuery: () => mocks.query,
    useCreateFocusPointMutation: () => useMockMutation(mocks.create),
    useUpdateFocusPointMutation: () => useMockMutation(mocks.update),
    useSetFocusPointStatusMutation: () => useMockMutation(mocks.setStatus),
    useDeleteFocusPointMutation: () => useMockMutation(mocks.remove),
  };
});

const point = (overrides: Partial<FocusPoint> = {}): FocusPoint => ({
  id: "fp-1",
  user_id: "me",
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
  point({ id: "b", title: "キックとプルのタイミングを合わせる" }),
  point({ id: "c", title: "腰を浮かせる" }),
];

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(buildAuthContext({ user: { id: "me" } }));
  mocks.query = { data: [], isLoading: false, isError: false };
  mocks.create.mockReset().mockResolvedValue(point());
  mocks.update.mockReset().mockResolvedValue(point());
  mocks.setStatus.mockReset().mockResolvedValue(point());
  mocks.remove.mockReset().mockResolvedValue(undefined);
});

describe("FocusPointsCard", () => {
  it("0件なら案内を出し、追加ボタンから入力して追加できる", async () => {
    renderWithI18n(<FocusPointsCard />);
    expect(screen.getByText("泳ぎで意識したいことを書いておこう")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "フォーカスポイントを追加" }));
    fireEvent.change(screen.getByLabelText("泳ぎで意識すること"), {
      target: { value: "腰を浮かせる" },
    });
    fireEvent.click(screen.getByRole("button", { name: "追加する" }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({ title: "腰を浮かせる", note: "" }),
    );
    await waitFor(() => expect(screen.queryByLabelText("泳ぎで意識すること")).toBeNull());
  });

  it("空欄のまま追加しようとするとエラーを出し、保存しない", () => {
    renderWithI18n(<FocusPointsCard />);
    fireEvent.click(screen.getByRole("button", { name: "フォーカスポイントを追加" }));
    fireEvent.click(screen.getByRole("button", { name: "追加する" }));
    expect(screen.getByRole("alert")).toHaveTextContent("意識することを入力してください");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("取り組み中を番号付きで並べ、件数を出す", () => {
    mocks.query = { data: threeActive, isLoading: false, isError: false };
    renderWithI18n(<FocusPointsCard />);
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "「腰を浮かせる」を編集" })).toBeInTheDocument();
  });

  it("3つあるときに追加しようとすると、フォームを開かずにエラーを出す", () => {
    mocks.query = { data: threeActive, isLoading: false, isError: false };
    renderWithI18n(<FocusPointsCard />);
    fireEvent.click(screen.getByRole("button", { name: "フォーカスポイントを追加" }));
    expect(screen.getByRole("alert")).toHaveTextContent("同時に3つまでです");
    expect(screen.queryByLabelText("泳ぎで意識すること")).toBeNull();
  });

  it("別端末で増えていて DB に上限で止められたときも、フォームに上限のエラーを出す", async () => {
    mocks.create.mockRejectedValue(new FocusPointLimitError());
    renderWithI18n(<FocusPointsCard />);
    fireEvent.click(screen.getByRole("button", { name: "フォーカスポイントを追加" }));
    fireEvent.change(screen.getByLabelText("泳ぎで意識すること"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "追加する" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("同時に3つまでです");
  });

  it("行を押すと編集でき、「身についた」にできる", async () => {
    mocks.query = { data: threeActive, isLoading: false, isError: false };
    renderWithI18n(<FocusPointsCard />);
    fireEvent.click(screen.getByRole("button", { name: "「腰を浮かせる」を編集" }));
    expect(screen.getByLabelText("泳ぎで意識すること")).toHaveValue("腰を浮かせる");

    fireEvent.click(screen.getByRole("button", { name: "身についた" }));
    await waitFor(() =>
      expect(mocks.setStatus).toHaveBeenCalledWith({ id: "c", status: "mastered" }),
    );
  });

  it("確認してから削除する", async () => {
    mocks.query = { data: threeActive, isLoading: false, isError: false };
    renderWithI18n(<FocusPointsCard />);
    fireEvent.click(screen.getByRole("button", { name: "「腰を浮かせる」を編集" }));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(screen.getByText("「腰を浮かせる」を削除します。元に戻せません。")).toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();

    const deleteButtons = screen.getAllByRole("button", { name: "削除" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]!);
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("c"));
    // 削除できたらフォームも閉じる
    await waitFor(() => expect(screen.queryByLabelText("泳ぎで意識すること")).toBeNull());
  });

  it("保存中は外側のクリックで閉じない (上限で弾かれたときのエラーを見せるため)", async () => {
    let reject: (e: unknown) => void = () => {};
    mocks.create.mockImplementation(
      () => new Promise((_resolve, r) => {
        reject = r;
      }),
    );
    renderWithI18n(<FocusPointsCard />);
    fireEvent.click(screen.getByRole("button", { name: "フォーカスポイントを追加" }));
    fireEvent.change(screen.getByLabelText("泳ぎで意識すること"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "追加する" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());

    // 保存中に外側 (暗い幕) と × を押しても閉じない
    fireEvent.click(document.querySelector(".fixed.inset-0.bg-black\\/40")!);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.getByLabelText("泳ぎで意識すること")).toBeInTheDocument();

    await act(async () => {
      reject(new FocusPointLimitError());
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("同時に3つまでです");
    expect(screen.getByLabelText("泳ぎで意識すること")).toBeInTheDocument();
  });

  it("身についたものはダッシュボードでは出さず、目標ページ (showMastered) では出す", () => {
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
      isLoading: false,
      isError: false,
    };
    const { unmount } = renderWithI18n(<FocusPointsCard />);
    expect(screen.queryByText("ストリームラインを締める")).toBeNull();
    unmount();

    renderWithI18n(<FocusPointsCard showMastered />);
    // 身についた一覧は閉じた <details> に入れておき、見出しを押すと開く
    const details = screen.getByText("ストリームラインを締める").closest("details")!;
    expect(details.open).toBe(false);
    fireEvent.click(screen.getByText("身についた（1）"));
    expect(details.open).toBe(true);
  });

  it("取得に失敗したらエラー文を出す", () => {
    mocks.query = { data: undefined, isLoading: false, isError: true };
    renderWithI18n(<FocusPointsCard />);
    expect(screen.getByText("フォーカスポイントを読み込めませんでした")).toBeInTheDocument();
  });
});
