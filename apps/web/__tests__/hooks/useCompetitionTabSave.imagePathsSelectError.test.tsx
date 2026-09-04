/**
 * useCompetitionTabSave — GitHub issue #48 の回帰テスト (web / image_paths 全置換編)
 *
 * バグ: 保存直前に権威ある image_paths を再取得する際、`supabase.from("competitions")
 *   .select("image_paths").eq("id", competitionId).single()` の `error` を destructure も
 *   チェックもしていなかった。SELECT が失敗 (RLS拒否・ネットワークエラー等) しても
 *   `(cur as {...})?.image_paths ?? []` が「取得失敗」を「0件」として扱ってしまい、
 *   `update({ image_paths: [...existing.filter(...), ...uploadedPaths] })` に渡る
 *   image_paths が新規アップロード分だけの配列に「全置換」され、既存の画像が
 *   静かに失われていた。
 *
 * 修正方針 (実装済み, apps/web/hooks/useCompetitionTabSave.ts L145-161): `error` を
 *   destructure し、`error || !cur` なら throw して image_paths を含む update 自体を
 *   送らずに中断する。外側の catch でアップロード済み画像のロールバック
 *   (deleteCompetitionImage) と、ユーザー向けエラー
 *   (t("competitionCreatedButImageFailed")) への合流を行う。
 *
 * 既存テスト (__tests__/hooks/useCompetitionTabSave.test.tsx /
 *   useCompetitionTabSave.poolType.test.tsx) はいずれも imageData: undefined を
 *   デフォルトとしており、今回の SELECT エラーハンドリング分岐そのものを直接検証する
 *   テストが存在しなかったため、このファイルで新規に追加する。
 *
 * Sprint Contract 検証観点:
 *   [W-48-1] image_paths SELECT が error を返したとき、image_paths を含む update が
 *     一切送られない (呼び出し回数0だけでなく、image_paths 以外の update が送られる
 *     正常系と区別できるよう、update 呼び出し実引数のキーの有無で判定する)。
 *   [W-48-2] 同ケースで、アップロード済み画像が deleteCompetitionImage でロールバック
 *     される。
 *   [W-48-3] 同ケースで、t("competitionCreatedButImageFailed") 相当のエラーが
 *     呼び出し元に伝播する。
 *   [W-48-4] SELECT が成功して 0 件 (image_paths: null) の場合は、従来どおり新規分を
 *     追加する update が送られる (= error チェック後の `?? []` は正しい)。
 *   [W-48-5] SELECT が成功して既存2件ある場合、image_paths が既存2件+新規1件の
 *     3件 (厳密一致) になる (全置換が起きない)。
 *
 * トートロジー防止メモ: mergeImagePaths 相当のロジックをテスト内に再実装せず、
 *   実際に useCompetitionTabSave を呼び出して supabase.update に渡った実引数を検証する。
 *
 * クエリ引数を捨てない: fake supabase は select() の columns / eq() の id / update() の
 *   payload をすべて calls 配列に記録する。image_paths を含む update の有無判定は、
 *   呼び出し回数ではなくペイロードのキーの有無 (hasOwnProperty) で行う。
 */

import { act, renderHook } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { Style } from "@apps/shared/types";
import type { CompetitionTabSaveParams } from "@/components/forms/CompetitionTabModal";
import { useCompetitionTabSave } from "@/hooks/useCompetitionTabSave";

const mocks = vi.hoisted(() => ({
  createPersonalEntry: vi.fn(),
  createTeamEntry: vi.fn(),
  updateEntry: vi.fn(),
  uploadCompetitionImage: vi.fn(),
  deleteCompetitionImage: vi.fn(),
}));

vi.mock("@apps/shared/api", () => ({
  EntryAPI: class {
    createPersonalEntry = mocks.createPersonalEntry;
    createTeamEntry = mocks.createTeamEntry;
    updateEntry = mocks.updateEntry;
  },
  CompetitionAPI: class {
    uploadCompetitionImage = mocks.uploadCompetitionImage;
    deleteCompetitionImage = mocks.deleteCompetitionImage;
  },
}));

vi.mock("@/lib/video-upload-client", () => ({
  uploadVideoClient: vi.fn().mockResolvedValue(undefined),
}));

// processCompetitionImage は canvas/Image 読み込みを伴う重い処理のため、
// jsdom 環境で実物を動かさずダミーの処理結果を返すよう差し替える
// (usePracticeTabSave.test.tsx と同じ理由・同じパターン)。
vi.mock("@/utils/imageUtils", () => ({
  processCompetitionImage: vi.fn().mockResolvedValue({
    original: new File(["o"], "original.webp"),
    thumbnail: new File(["t"], "thumb.webp"),
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
    {children}
  </NextIntlClientProvider>
);

const styles: Style[] = [{ id: 2, name_jp: "50m自由形", distance: 50 } as unknown as Style];

const baseParams = (overrides: Partial<CompetitionTabSaveParams> = {}): CompetitionTabSaveParams =>
  ({
    basicData: { date: "2026-07-10", endDate: "", title: "", place: "", poolType: 1, note: "" },
    imageData: undefined,
    entries: [],
    records: [],
    editingCompetitionId: "comp-1",
    originalEntryIds: [],
    originalRecordIds: [],
    competitionRowResolved: true,
    ...overrides,
  }) as CompetitionTabSaveParams;

/**
 * `supabase.from("competitions").select("image_paths").eq("id", id).single()` の応答を
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
              if (table === "competitions" && columns === "image_paths") {
                return Promise.resolve(imagePathsResponse);
              }
              if (table === "competitions" && columns === "team_id") {
                return Promise.resolve({ data: { team_id: null }, error: null });
              }
              return Promise.resolve({ data: null, error: null });
            },
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
        c.table === "competitions" &&
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

describe("useCompetitionTabSave — issue #48: image_paths SELECT の error 未処理による全置換", () => {
  let createCompetition: ReturnType<typeof vi.fn>;
  let updateCompetition: ReturnType<typeof vi.fn>;
  let createRecord: ReturnType<typeof vi.fn>;
  let updateRecord: ReturnType<typeof vi.fn>;
  let deleteRecord: ReturnType<typeof vi.fn>;
  let deleteEntry: ReturnType<typeof vi.fn>;
  let createSplitTimes: ReturnType<typeof vi.fn>;
  let replaceSplitTimes: ReturnType<typeof vi.fn>;
  let setCompetitionLoading: ReturnType<typeof vi.fn>;
  let setEditingCompetitionId: ReturnType<typeof vi.fn>;
  let setCreatedEntries: ReturnType<typeof vi.fn>;
  let closeCompetitionTabModal: ReturnType<typeof vi.fn>;
  let onSaved: ReturnType<typeof vi.fn>;

  const setup = (imagePathsResponse: { data: { image_paths: string[] | null } | null; error: unknown }) => {
    const fake = createFakeSupabase(imagePathsResponse);
    createCompetition = vi.fn().mockResolvedValue({ id: "new-comp-id" });
    updateCompetition = vi.fn().mockResolvedValue({ id: "comp-1" });
    createRecord = vi.fn().mockResolvedValue({ id: "new-record-id" });
    updateRecord = vi.fn().mockResolvedValue({ id: "record-1" });
    deleteRecord = vi.fn().mockResolvedValue(undefined);
    deleteEntry = vi.fn().mockResolvedValue(undefined);
    createSplitTimes = vi.fn().mockResolvedValue([]);
    replaceSplitTimes = vi.fn().mockResolvedValue([]);
    setCompetitionLoading = vi.fn();
    setEditingCompetitionId = vi.fn();
    setCreatedEntries = vi.fn();
    closeCompetitionTabModal = vi.fn();
    onSaved = vi.fn();

    const { result } = renderHook(
      () =>
        useCompetitionTabSave({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase: fake as unknown as any,
          user: { id: "user-1" },
          styles,
          createCompetition,
          updateCompetition,
          createRecord,
          updateRecord,
          deleteRecord,
          deleteEntry,
          createSplitTimes,
          replaceSplitTimes,
          setCompetitionLoading,
          setEditingCompetitionId,
          setCreatedEntries,
          closeCompetitionTabModal,
          onSaved,
        }),
      { wrapper },
    );
    return { result, fake };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadCompetitionImage.mockResolvedValue("competitions/comp-1/new-upload.jpg");
    mocks.deleteCompetitionImage.mockResolvedValue(undefined);
  });

  it(
    "[W-48-1] image_paths SELECT が error を返したとき、image_paths を含む update は一切送られない " +
      "(呼び出し実引数のキーの有無で判定する)",
    async () => {
      const { result, fake } = setup({ data: null, error: new Error("RLS denied: cannot read competitions row") });

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
    "[W-48-2] 同ケースで、アップロード済み画像が deleteCompetitionImage でロールバックされる",
    async () => {
      const { result } = setup({ data: null, error: new Error("RLS denied") });
      mocks.uploadCompetitionImage.mockResolvedValue("competitions/comp-1/rollback-target.jpg");

      await act(async () => {
        await result.current(
          baseParams({
            imageData: { newFiles: [newImageFile()], deletedIds: [] },
          }),
        ).catch(() => {});
      });

      expect(mocks.deleteCompetitionImage).toHaveBeenCalledTimes(1);
      expect(mocks.deleteCompetitionImage).toHaveBeenCalledWith("competitions/comp-1/rollback-target.jpg");
    },
  );

  it(
    "[W-48-3] 同ケースで、t(\"competitionCreatedButImageFailed\") 相当のエラーが呼び出し元に伝播する",
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
      expect((caught as Error).message).toBe(messages.dashboard.handlers.competitionCreatedButImageFailed);
      expect(setCompetitionLoading).toHaveBeenCalledWith(false);
    },
  );

  it(
    "[W-48-4] SELECT が成功して 0 件 (image_paths: null) の場合は、従来どおり新規分を追加する update が送られる " +
      "(error チェック後の `?? []` フォールバックは正しい)",
    async () => {
      const { result, fake } = setup({ data: { image_paths: null }, error: null });
      mocks.uploadCompetitionImage.mockResolvedValue("competitions/comp-1/only-new.jpg");

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
      expect(payload.image_paths).toEqual(["competitions/comp-1/only-new.jpg"]);
    },
  );

  it(
    "[W-48-5] SELECT が成功して既存2件ある場合、image_paths は既存2件+新規1件の3件 (厳密一致) になる " +
      "(全置換が起きない)",
    async () => {
      const { result, fake } = setup({
        data: { image_paths: ["existing-a.jpg", "existing-b.jpg"] },
        error: null,
      });
      mocks.uploadCompetitionImage.mockResolvedValue("new-upload.jpg");

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
