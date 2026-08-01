/**
 * usePracticeTabSave テスト
 *
 * dashboard / /practice 履歴タブの双方から共有される練習タブモーダル一括保存ロジック。
 * ダッシュボードの旧 handlePracticeTabSave から挙動を変えずに切り出したフックであるため、
 * 「親(practice) INSERT/UPDATE 分岐」「子(practice_logs) diff の ADD/UPDATE/DELETE」
 * 「画像アップロード失敗時のロールバック」という既存契約を回帰させないことを検証する。
 *
 * トートロジー防止メモ:
 *   実装のロジックをそのままコピーしたアサーションにならないよう、
 *   「呼ばれた関数と引数」「呼ばれなかった関数」の観点で検証する。
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { PracticeTabSaveParams } from "@/components/forms/PracticeTabModal";
import { usePracticeTabSave } from "@/hooks/usePracticeTabSave";

// -----------------------------------------------------------------------
// 依存モック
// -----------------------------------------------------------------------
const mocks = vi.hoisted(() => ({
  uploadPracticeImage: vi.fn(),
  deletePracticeImage: vi.fn(),
}));

vi.mock("@apps/shared/api", () => ({
  PracticeAPI: class {
    uploadPracticeImage = mocks.uploadPracticeImage;
    deletePracticeImage = mocks.deletePracticeImage;
  },
}));

vi.mock("@/lib/video-upload-client", () => ({
  uploadVideoClient: vi.fn().mockResolvedValue(undefined),
}));

// processPracticeImage は canvas/Image 読み込みを伴う重い処理のため、
// jsdom 環境で実物を動かさずダミーの処理結果を返すよう差し替える
vi.mock("@/utils/imageUtils", () => ({
  processPracticeImage: vi.fn().mockResolvedValue({
    original: new File(["o"], "original.webp"),
    thumbnail: new File(["t"], "thumb.webp"),
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
    {children}
  </NextIntlClientProvider>
);

// 画像処理を伴わない最小の params を作るヘルパー
const baseParams = (overrides: Partial<PracticeTabSaveParams> = {}): PracticeTabSaveParams => ({
  basicData: { date: "2026-07-10", title: "", place: "", note: "" },
  imageData: undefined,
  logs: [],
  editingPracticeId: null,
  originalLogIds: [],
  ...overrides,
});

// 最小の fake supabase (image 処理・タグ再同期の select/insert/delete チェーンを提供)
function createFakeSupabase() {
  const selectSingle = vi.fn().mockResolvedValue({ data: { image_paths: [] } });
  const chain = {
    select: () => ({ eq: () => ({ single: selectSingle }) }),
    update: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    delete: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
  };
  return { from: vi.fn(() => chain) };
}

describe("usePracticeTabSave", () => {
  let supabase: ReturnType<typeof createFakeSupabase>;
  let createPractice: ReturnType<typeof vi.fn>;
  let updatePractice: ReturnType<typeof vi.fn>;
  let createPracticeLog: ReturnType<typeof vi.fn>;
  let updatePracticeLog: ReturnType<typeof vi.fn>;
  let deletePracticeLog: ReturnType<typeof vi.fn>;
  let createPracticeTime: ReturnType<typeof vi.fn>;
  let deletePracticeTime: ReturnType<typeof vi.fn>;
  let setPracticeLoading: ReturnType<typeof vi.fn>;
  let setEditingPracticeId: ReturnType<typeof vi.fn>;
  let closePracticeTabModal: ReturnType<typeof vi.fn>;
  let onSaved: ReturnType<typeof vi.fn>;

  const setup = (user: { id: string } | null = { id: "user-1" }) => {
    supabase = createFakeSupabase();
    createPractice = vi.fn().mockResolvedValue({ id: "new-practice-id" });
    updatePractice = vi.fn().mockResolvedValue({ id: "practice-1" });
    createPracticeLog = vi.fn().mockResolvedValue({ id: "new-log-id" });
    updatePracticeLog = vi.fn().mockResolvedValue({ id: "log-1" });
    deletePracticeLog = vi.fn().mockResolvedValue(undefined);
    createPracticeTime = vi.fn().mockResolvedValue({});
    deletePracticeTime = vi.fn().mockResolvedValue(undefined);
    setPracticeLoading = vi.fn();
    setEditingPracticeId = vi.fn();
    closePracticeTabModal = vi.fn();
    onSaved = vi.fn();

    const { result } = renderHook(
      () =>
        usePracticeTabSave({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase: supabase as any,
          user,
          createPractice,
          updatePractice,
          createPracticeLog,
          updatePracticeLog,
          deletePracticeLog,
          createPracticeTime,
          deletePracticeTime,
          setPracticeLoading,
          setEditingPracticeId,
          closePracticeTabModal,
          onSaved,
        }),
      { wrapper },
    );
    return result;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("user が null の場合は認証エラーを投げ、createPractice/updatePractice は呼ばれない", async () => {
    const result = setup(null);

    await expect(
      act(async () => {
        await result.current(baseParams());
      }),
    ).rejects.toThrow();

    expect(createPractice).not.toHaveBeenCalled();
    expect(updatePractice).not.toHaveBeenCalled();
  });

  it("editingPracticeId が null の場合は createPractice が呼ばれ、新規IDで setEditingPracticeId される", async () => {
    const result = setup();

    await act(async () => {
      await result.current(
        baseParams({
          basicData: { date: "2026-07-10", title: "朝練", place: "市民プール", note: "" },
        }),
      );
    });

    expect(createPractice).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-07-10", title: "朝練", place: "市民プール" }),
    );
    expect(updatePractice).not.toHaveBeenCalled();
    expect(setEditingPracticeId).toHaveBeenCalledWith("new-practice-id");
  });

  it("editingPracticeId が指定されている場合は updatePractice が呼ばれ、createPractice は呼ばれない", async () => {
    const result = setup();

    await act(async () => {
      await result.current(baseParams({ editingPracticeId: "practice-1" }));
    });

    expect(updatePractice).toHaveBeenCalledWith(
      "practice-1",
      expect.objectContaining({ date: "2026-07-10" }),
    );
    expect(createPractice).not.toHaveBeenCalled();
  });

  it("ログ diff の ADD/UPDATE/DELETE がそれぞれ正しい API 呼び出しに変換される", async () => {
    const result = setup();

    await act(async () => {
      await result.current(
        baseParams({
          editingPracticeId: "practice-1",
          originalLogIds: ["11111111-1111-1111-1111-111111111111", "log-to-delete-uuid0000"],
          logs: [
            {
              style: "Fr",
              swimCategory: "Swim",
              distance: 100,
              reps: 4,
              sets: 1,
              circleTime: 90,
              note: "",
              tags: [],
              times: [],
              tempMenuId: "11111111-1111-1111-1111-111111111111",
            },
            {
              style: "Br",
              swimCategory: "Swim",
              distance: 50,
              reps: 2,
              sets: 1,
              circleTime: 60,
              note: "",
              tags: [],
              times: [],
              // tempMenuId なし = 新規追加
            },
          ],
        }),
      );
    });

    // 新規ログ (tempMenuId なし) → createPracticeLog
    expect(createPracticeLog).toHaveBeenCalledTimes(1);
    expect(createPracticeLog).toHaveBeenCalledWith(
      expect.objectContaining({ practice_id: "practice-1", style: "Br", distance: 50 }),
    );

    // 既存ログ (originalLogIds に含まれる UUID) → updatePracticeLog
    expect(updatePracticeLog).toHaveBeenCalledTimes(1);
    expect(updatePracticeLog).toHaveBeenCalledWith(
      "11111111-1111-1111-1111-111111111111",
      expect.objectContaining({ style: "Fr", distance: 100 }),
    );

    // originalLogIds にあったが draft に残っていない ID → deletePracticeLog
    // (isDbUuid でないダミーIDは "log-to-delete-uuid0000" のように UUID 形式でない値を使っている点に注意:
    //  toDelete は「originalLogIds のうち draft の draftIdSet に含まれない ID」全てが対象になる)
    expect(deletePracticeLog).toHaveBeenCalledWith("log-to-delete-uuid0000");
  });

  it("全成功後に setEditingPracticeId(null) / closePracticeTabModal / onSaved / setPracticeLoading(false) が呼ばれる", async () => {
    const result = setup();

    await act(async () => {
      await result.current(baseParams({ editingPracticeId: "practice-1" }));
    });

    await waitFor(() => {
      expect(closePracticeTabModal).toHaveBeenCalledTimes(1);
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(setPracticeLoading).toHaveBeenCalledWith(false);
  });

  it("画像アップロード失敗時はエラーを再スローし、setPracticeLoading(false) が呼ばれる (モーダルは閉じない)", async () => {
    const result = setup();
    mocks.uploadPracticeImage.mockRejectedValue(new Error("upload failed"));

    const file = new File(["dummy"], "photo.png", { type: "image/png" });

    let caught: unknown = null;
    await act(async () => {
      try {
        await result.current(
          baseParams({
            editingPracticeId: "practice-1",
            imageData: {
              newFiles: [{ file, previewUrl: "blob://x" }],
              deletedIds: [],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
          }),
        );
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect(closePracticeTabModal).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(setPracticeLoading).toHaveBeenCalledWith(false);
  });
});
