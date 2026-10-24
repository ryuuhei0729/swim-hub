/**
 * useCompetitionTabSave — 既存レコードの途中スプリットを全部消したときの書き戻し
 *
 * 背景 (UI レビュー照合で見つかった実害): 既存レコードの UPDATE で
 * `if (formData.splitTimes?.length)` のときだけ replaceSplitTimes を呼んでいたため、
 * 途中スプリットを全部消して保存しても DB に古いスプリットが残っていた。
 *
 * 期待: CompetitionTabModal が渡す originalSplitRecordIds (読み込み時に途中スプリットを
 * 持っていた記録) に含まれる記録は、スプリットが0件でも空配列で置き換える。含まれない記録
 * (元から無い・読み込みに失敗して空に見えている) には DELETE を出さない。
 * モック構成は useCompetitionTabSave.test.tsx をそのまま流用している。
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
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

// processCompetitionImage は canvas/Image 読み込みを伴う重い処理のため、jsdom 環境で
// 実物を動かさずダミーの処理結果を返すよう差し替える (usePracticeTabSave.test.tsx と同型)。
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

const styles: Style[] = [
  { id: 2, name_jp: "50m自由形", distance: 50 } as unknown as Style,
];

const baseParams = (overrides: Partial<CompetitionTabSaveParams> = {}): CompetitionTabSaveParams =>
  ({
    basicData: { date: "2026-07-10", endDate: "", title: "", place: "", poolType: 0, note: "" },
    imageData: undefined,
    entries: [],
    records: [],
    editingCompetitionId: null,
    originalEntryIds: [],
    originalRecordIds: [],
    // Sprint Contract D-3: CompetitionTabModal が実際に渡すフィールド。このファイルの既存テスト群は
    // 「大会本体が正常に解決されている」通常フローを検証する契約なので true をデフォルトにする
    // (D-3 ガード自体の contract テストは __tests__/hooks/useCompetitionTabSave.poolType.test.tsx)。
    competitionRowResolved: true,
    ...overrides,
  }) as CompetitionTabSaveParams;

function createFakeSupabase(opts: { teamId?: string | null; poolType?: 0 | 1 } = {}) {
  const single = vi.fn().mockResolvedValue({
    data: { team_id: opts.teamId ?? null, pool_type: opts.poolType ?? 0, image_paths: [] },
  });
  const chain = {
    select: () => ({ eq: () => ({ single }) }),
    update: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
    delete: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
  };
  return { from: vi.fn(() => chain) };
}

const REC_WITH_SPLITS = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const REC_WITHOUT_SPLITS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const COMP_ID = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";

function existingRecord(id: string, splitTimes: Array<{ distance: number; splitTime: number }>) {
  return {
    id,
    existingRecordId: id,
    styleId: "2",
    time: 30.12,
    isRelaying: false,
    splitTimes,
    note: "",
    reactionTime: "",
    videoPath: null,
  };
}

describe("useCompetitionTabSave — 既存レコードのスプリット書き戻し", () => {
  let replaceSplitTimes: Mock;
  let updateRecord: Mock;

  const setup = () => {
    replaceSplitTimes = vi.fn().mockResolvedValue([]);
    updateRecord = vi.fn().mockResolvedValue({ id: "updated" });
    const { result } = renderHook(
      () =>
        useCompetitionTabSave({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabase: createFakeSupabase() as any,
          user: { id: "user-1" },
          styles,
          createCompetition: vi.fn().mockResolvedValue({ id: COMP_ID }),
          updateCompetition: vi.fn().mockResolvedValue({ id: COMP_ID }),
          createRecord: vi.fn().mockResolvedValue({ id: "new-record-id" }),
          updateRecord,
          deleteRecord: vi.fn().mockResolvedValue(undefined),
          deleteEntry: vi.fn().mockResolvedValue(undefined),
          createSplitTimes: vi.fn().mockResolvedValue([]),
          replaceSplitTimes,
          setCompetitionLoading: vi.fn(),
          setEditingCompetitionId: vi.fn(),
          setCreatedEntries: vi.fn(),
          closeCompetitionTabModal: vi.fn(),
          onSaved: vi.fn(),
        }),
      { wrapper },
    );
    return result;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[SC-1] 読み込み時にスプリットがあった記録で全部消したら、空配列で replaceSplitTimes を呼ぶ", async () => {
    const result = setup();
    await act(async () => {
      await result.current(
        baseParams({
          editingCompetitionId: COMP_ID,
          records: [existingRecord(REC_WITH_SPLITS, [])],
          originalRecordIds: [REC_WITH_SPLITS],
          originalSplitRecordIds: [REC_WITH_SPLITS],
        }),
      );
    });

    expect(updateRecord).toHaveBeenCalledTimes(1);
    expect(replaceSplitTimes).toHaveBeenCalledTimes(1);
    expect(replaceSplitTimes).toHaveBeenCalledWith({ recordId: REC_WITH_SPLITS, splitTimes: [] });
  });

  it("[SC-2] 読み込み時にスプリットが無かった記録では、0件なら replaceSplitTimes を呼ばない", async () => {
    const result = setup();
    await act(async () => {
      await result.current(
        baseParams({
          editingCompetitionId: COMP_ID,
          records: [existingRecord(REC_WITHOUT_SPLITS, [])],
          originalRecordIds: [REC_WITHOUT_SPLITS],
          originalSplitRecordIds: [],
        }),
      );
    });

    expect(updateRecord).toHaveBeenCalledTimes(1);
    expect(replaceSplitTimes).toHaveBeenCalledTimes(0);
  });

  it("[SC-3] スプリットがあれば従来どおりその内容で書き戻す", async () => {
    const result = setup();
    await act(async () => {
      await result.current(
        baseParams({
          editingCompetitionId: COMP_ID,
          records: [existingRecord(REC_WITHOUT_SPLITS, [{ distance: 25, splitTime: 14.5 }])],
          originalRecordIds: [REC_WITHOUT_SPLITS],
          originalSplitRecordIds: [],
        }),
      );
    });

    await waitFor(() => expect(replaceSplitTimes).toHaveBeenCalledTimes(1));
    expect(replaceSplitTimes).toHaveBeenCalledWith({
      recordId: REC_WITHOUT_SPLITS,
      splitTimes: [{ distance: 25, split_time: 14.5 }],
    });
  });
});
