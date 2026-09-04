/**
 * usePracticeTabSave — GitHub issue #48 の回帰テスト (web / image_paths 全置換編)
 *
 * バグ: 保存直前に権威ある image_paths を再取得する際、`supabase.from("practices")
 *   .select("image_paths").eq("id", practiceId).single()` の `error` を destructure も
 *   チェックもしていなかった。SELECT が失敗 (RLS拒否・ネットワークエラー等) しても
 *   `(cur as {...})?.image_paths ?? []` が「取得失敗」を「0件」として扱ってしまい、
 *   `update({ image_paths: [...existing.filter(...), ...uploadedPaths] })` に渡る
 *   image_paths が新規アップロード分だけの配列に「全置換」され、既存の画像が
 *   静かに失われていた。
 *
 * 修正方針 (実装済み, apps/web/hooks/usePracticeTabSave.ts L116-128): `error` を
 *   destructure し、`error || !cur` なら throw して image_paths を含む update 自体を
 *   送らずに中断する。外側の catch でアップロード済み画像のロールバック
 *   (deletePracticeImage) と、ユーザー向けエラー
 *   (t("practiceCreatedButImageFailed")) への合流を行う。
 *
 * 既存テスト (__tests__/hooks/usePracticeTabSave.test.tsx) は imageData: undefined を
 *   デフォルトとし、画像アップロード失敗テストも uploadPracticeImage 自体の reject のみを
 *   検証しており、今回の SELECT エラーハンドリング分岐そのものを直接検証するテストが
 *   存在しなかったため、このファイルで新規に追加する。
 *
 * Sprint Contract 検証観点 (useCompetitionTabSave.imagePathsSelectError.test.tsx の
 *   W-48-1〜5 と対をなす practices テーブル版):
 *   [W-48-6]  image_paths SELECT が error を返したとき、image_paths を含む update が
 *     一切送られない (呼び出し実引数のキーの有無で判定する)。
 *   [W-48-7]  同ケースで、アップロード済み画像が deletePracticeImage でロールバックされる。
 *   [W-48-8]  同ケースで、t("practiceCreatedButImageFailed") 相当のエラーが呼び出し元に
 *     伝播する。
 *   [W-48-9]  SELECT が成功して 0 件 (image_paths: null) の場合は、従来どおり新規分を
 *     追加する update が送られる (= error チェック後の `?? []` は正しい)。
 *   [W-48-10] SELECT が成功して既存2件ある場合、image_paths が既存2件+新規1件の
 *     3件 (厳密一致) になる (全置換が起きない)。
 *
 * トートロジー防止メモ: 実装のロジックをテスト内に再実装せず、実際に
 *   usePracticeTabSave を呼び出して supabase.update に渡った実引数を検証する。
 *
 * クエリ引数を捨てない: fake supabase は select() の columns / eq() の id / update() の
 *   payload をすべて calls に記録する。image_paths を含む update の有無判定は、
 *   呼び出し回数ではなくペイロードのキーの有無 (hasOwnProperty) で行う。
 */

import { act, renderHook } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { PracticeTabSaveParams } from "@/components/forms/PracticeTabModal";
import { usePracticeTabSave } from "@/hooks/usePracticeTabSave";

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
// (既存の usePracticeTabSave.test.tsx と同じパターン)。
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

const baseParams = (overrides: Partial<PracticeTabSaveParams> = {}): PracticeTabSaveParams => ({
  basicData: { date: "2026-07-10", title: "", place: "", note: "" },
  imageData: undefined,
  logs: [],
  editingPracticeId: "practice-1",
  originalLogIds: [],
  ...overrides,
});

/**
 * `supabase.from("practices").select("image_paths").eq("id", id).single()` の応答を
 * テストごとに差し替え可能にした fake。select の columns / eq の id / update の payload を
 * すべて calls に記録し、スコープを検証可能にする (クエリ引数を捨てない)。
 */
function createFakeSupabase(imagePathsResponse: { data: { image_paths: string[] | null } | null; error: unknown }) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

  const from = vi.fn((table: string) => ({
    select: (...selectArgs: unknown[]) => {
      const columns = String(selectArgs[0] ?? "");
      calls.push({ table, method: "select", args: selectArgs });
      return {
        eq: (...eqArgs: unknown[]) => {
          calls.push({ table, method: "eq", args: eqArgs });
          return {
            single: () => {
              calls.push({ table, method: "single", args: [] });
              if (table === "practices" && columns === "image_paths") {
                return Promise.resolve(imagePathsResponse);
              }
              return Promise.resolve({ data: null, error: null });
            },
            // practice_log_tags の同期 (existingTimes 取得) は logs: [] のため呼ばれないが、
            // 万一の呼び出しに備えて thenable としても振る舞えるようにしておく
            then: (onFulfilled?: (v: unknown) => unknown) =>
              Promise.resolve({ data: [], error: null }).then(onFulfilled),
          };
        },
      };
    },
    update: (payload: Record<string, unknown>) => {
      calls.push({ table, method: "update", args: [payload] });
      return {
        eq: (...eqArgs: unknown[]) => {
          calls.push({ table, method: "update.eq", args: eqArgs });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
    insert: (payload: Record<string, unknown>) => {
      calls.push({ table, method: "insert", args: [payload] });
      return Promise.resolve({ data: null, error: null });
    },
    delete: () => ({
      eq: (...eqArgs: unknown[]) => {
        calls.push({ table, method: "delete.eq", args: eqArgs });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  }));

  // image_paths キーの有無で判定するヘルパー (呼び出し回数0だけでは、image_paths 以外の
  // update が送られる正常系と区別できないため)
  const imagePathsUpdateCalls = () =>
    calls.filter(
      (c) =>
        c.table === "practices" &&
        c.method === "update" &&
        Object.prototype.hasOwnProperty.call(c.args[0] as Record<string, unknown>, "image_paths"),
    );

  return { from, calls, imagePathsUpdateCalls };
}

const newImageFile = (name = "new-photo.jpg") => ({
  id: `file-${name}`,
  file: new File(["x"], name, { type: "image/jpeg" }),
  previewUrl: `blob://${name}`,
});

describe("usePracticeTabSave — issue #48: image_paths SELECT の error 未処理による全置換", () => {
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

  const setup = (imagePathsResponse: { data: { image_paths: string[] | null } | null; error: unknown }) => {
    const fake = createFakeSupabase(imagePathsResponse);
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
          supabase: fake as unknown as any,
          user: { id: "user-1" },
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
    return { result, fake };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadPracticeImage.mockResolvedValue("practices/practice-1/new-upload.jpg");
    mocks.deletePracticeImage.mockResolvedValue(undefined);
  });

  it(
    "[W-48-6] image_paths SELECT が error を返したとき、image_paths を含む update は一切送られない " +
      "(呼び出し実引数のキーの有無で判定する)",
    async () => {
      const { result, fake } = setup({ data: null, error: new Error("RLS denied: cannot read practices row") });

      let caught: unknown = null;
      await act(async () => {
        try {
          await result.current(
            baseParams({
              imageData: { newFiles: [newImageFile()], deletedIds: [] },
            }),
          );
        } catch (e) {
          caught = e;
        }
      });

      expect(caught).toBeInstanceOf(Error);
      expect(fake.imagePathsUpdateCalls()).toHaveLength(0);
    },
  );

  it(
    "[W-48-7] 同ケースで、アップロード済み画像が deletePracticeImage でロールバックされる",
    async () => {
      const { result } = setup({ data: null, error: new Error("RLS denied") });
      mocks.uploadPracticeImage.mockResolvedValue("practices/practice-1/rollback-target.jpg");

      await act(async () => {
        await result.current(
          baseParams({
            imageData: { newFiles: [newImageFile()], deletedIds: [] },
          }),
        ).catch(() => {});
      });

      expect(mocks.deletePracticeImage).toHaveBeenCalledTimes(1);
      expect(mocks.deletePracticeImage).toHaveBeenCalledWith("practices/practice-1/rollback-target.jpg");
    },
  );

  it(
    "[W-48-8] 同ケースで、t(\"practiceCreatedButImageFailed\") 相当のエラーが呼び出し元に伝播する",
    async () => {
      const { result } = setup({ data: null, error: new Error("RLS denied") });

      let caught: unknown = null;
      await act(async () => {
        try {
          await result.current(
            baseParams({
              imageData: { newFiles: [newImageFile()], deletedIds: [] },
            }),
          );
        } catch (e) {
          caught = e;
        }
      });

      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toBe(messages.dashboard.handlers.practiceCreatedButImageFailed);
      expect(setPracticeLoading).toHaveBeenCalledWith(false);
    },
  );

  it(
    "[W-48-9] SELECT が成功して 0 件 (image_paths: null) の場合は、従来どおり新規分を追加する update が送られる " +
      "(error チェック後の `?? []` フォールバックは正しい)",
    async () => {
      const { result, fake } = setup({ data: { image_paths: null }, error: null });
      mocks.uploadPracticeImage.mockResolvedValue("practices/practice-1/only-new.jpg");

      await act(async () => {
        await result.current(
          baseParams({
            imageData: { newFiles: [newImageFile()], deletedIds: [] },
          }),
        );
      });

      const calls = fake.imagePathsUpdateCalls();
      expect(calls).toHaveLength(1);
      const { args } = calls[0]!; // 直前の toHaveLength(1) で存在は保証済み
      const payload = args[0] as { image_paths: string[] };
      expect(payload.image_paths).toEqual(["practices/practice-1/only-new.jpg"]);
    },
  );

  it(
    "[W-48-10] SELECT が成功して既存2件ある場合、image_paths は既存2件+新規1件の3件 (厳密一致) になる " +
      "(全置換が起きない)",
    async () => {
      const { result, fake } = setup({
        data: { image_paths: ["existing-a.jpg", "existing-b.jpg"] },
        error: null,
      });
      mocks.uploadPracticeImage.mockResolvedValue("new-upload.jpg");

      await act(async () => {
        await result.current(
          baseParams({
            imageData: { newFiles: [newImageFile()], deletedIds: [] },
          }),
        );
      });

      const calls = fake.imagePathsUpdateCalls();
      expect(calls).toHaveLength(1);
      const { args } = calls[0]!; // 直前の toHaveLength(1) で存在は保証済み
      const payload = args[0] as { image_paths: string[] };
      expect(payload.image_paths).toEqual(["existing-a.jpg", "existing-b.jpg", "new-upload.jpg"]);
      expect(payload.image_paths).toHaveLength(3);
    },
  );
});
