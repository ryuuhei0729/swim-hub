import { renderWithI18n as render, screen, waitFor, within } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import React from "react";
import TagInput from "@/components/forms/TagInput";
import { usePracticeStore } from "@/stores/practice/practiceStore";
import { PracticeTag } from "@apps/shared/types";

const mockedUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts", () => ({ useAuth: mockedUseAuth }));

const makeTag = (o: Partial<PracticeTag> = {}): PracticeTag => ({
  id: "tag-default",
  user_id: "user-1",
  name: "タグ",
  color: "#93C5FD",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  ...o,
});

const createSupabaseMock = () => {
  const insertedTag = makeTag({ id: "tag-new", name: "新タグ" });
  const singleMock = vi.fn().mockResolvedValue({ data: insertedTag, error: null });
  const selectMock = vi.fn(() => ({ single: singleMock }));
  const insertMock = vi.fn(() => ({ select: selectMock }));
  const deleteEqSecond = vi.fn().mockResolvedValue({ error: null });
  const deleteEqFirst = vi.fn(() => ({ eq: deleteEqSecond }));
  const deleteMock = vi.fn(() => ({ eq: deleteEqFirst }));
  const fromMock = vi.fn(() => ({ insert: insertMock, delete: deleteMock }));
  const getUserMock = vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } });
  return { auth: { getUser: getUserMock }, from: fromMock, _mocks: { insertedTag } };
};

// FormModals と同じ配線: store の availableTags / setAvailableTags を TagInput に渡す
function StoreConnectedTagInput() {
  const availableTags = usePracticeStore((s) => s.availableTags);
  const setAvailableTags = usePracticeStore((s) => s.setAvailableTags);
  const [selected, setSelected] = React.useState<PracticeTag[]>([]);
  return (
    <TagInput
      selectedTags={selected}
      availableTags={availableTags}
      onTagsChange={setSelected}
      onAvailableTagsUpdate={setAvailableTags}
    />
  );
}

// 回帰テスト: 編集モーダル内のタグ入力ドロップダウンが、タグの追加/削除直後に
// リアルタイム更新されること (削除は管理モーダル操作でドロップダウンが閉じないこと)
describe("TagInput ドロップダウンのリアルタイム更新 (practiceStore 連携)", () => {
  beforeEach(() => {
    mockedUseAuth.mockReset();
    usePracticeStore.getState().reset();
  });

  it("削除直後にドロップダウン一覧から消える", async () => {
    const supabase = createSupabaseMock();
    mockedUseAuth.mockReturnValue({ supabase });
    usePracticeStore.getState().setAvailableTags([
      makeTag({ id: "tag-1", name: "フォーム" }),
      makeTag({ id: "tag-2", name: "キック" }),
    ]);

    render(<StoreConnectedTagInput />);
    const user = userEvent.setup();
    await user.click(screen.getByPlaceholderText("タグを選択または作成"));

    // 両タグが一覧に出る
    expect(await screen.findByText("フォーム")).toBeInTheDocument();
    expect(screen.getByText("キック")).toBeInTheDocument();

    // フォームの管理ボタン→削除
    const formRow = screen.getByTestId("tag-row-tag-1");
    await user.click(within(formRow).getByTestId("manage-tag-button-tag-1"));
    await user.click(screen.getByRole("button", { name: /削除/ }));
    const confirmButtons = await screen.findAllByRole("button", { name: "削除" });
    await user.click(confirmButtons[confirmButtons.length - 1]!);

    // 削除後、ストアは更新される
    await waitFor(() => {
      expect(usePracticeStore.getState().availableTags.map((t) => t.id)).toEqual(["tag-2"]);
    });
    // 削除直後: ドロップダウンは開いたまま、一覧がリアルタイム更新される
    //   (管理モーダル操作中は click-outside で閉じないよう修正済み)
    await waitFor(() => {
      expect(screen.queryByTestId("tag-dropdown")).toBeInTheDocument();
      expect(screen.queryByTestId("tag-row-tag-2")).toBeInTheDocument();
      expect(screen.queryByTestId("tag-row-tag-1")).not.toBeInTheDocument();
    });
  });

  it("追加直後にストアが更新され一覧に反映される", async () => {
    const supabase = createSupabaseMock();
    mockedUseAuth.mockReturnValue({ supabase });
    usePracticeStore.getState().setAvailableTags([makeTag({ id: "tag-1", name: "フォーム" })]);

    render(<StoreConnectedTagInput />);
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText("タグを選択または作成");
    await user.click(input);
    await user.type(input, "新タグ");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(usePracticeStore.getState().availableTags.map((t) => t.name)).toEqual([
        "フォーム",
        "新タグ",
      ]);
    });
    // 追加後: ドロップダウンは開いたままか? 新タグは選択済み(チップ)で一覧からは除外される
    expect(screen.queryByTestId("tag-dropdown")).toBeInTheDocument();
    // 新タグは selectedTags 入り → チップ表示
    expect(screen.getByTestId("selected-tag-tag-new")).toBeInTheDocument();
    // 一覧(dropdown)には新タグ行は出ない(選択済みのため)
    expect(screen.queryByTestId("tag-row-tag-new")).not.toBeInTheDocument();
  });
});
