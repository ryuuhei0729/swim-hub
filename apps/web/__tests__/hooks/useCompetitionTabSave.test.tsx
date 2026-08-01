/**
 * useCompetitionTabSave テスト
 *
 * dashboard / /competition 履歴タブの双方から共有される大会タブモーダル一括保存ロジック。
 * ダッシュボードの旧 handleCompetitionTabSave から挙動を変えずに切り出したフックであるため、
 * 「親(competition) INSERT/UPDATE 分岐」「エントリー diff (個人/チーム経路の分岐)」
 * 「記録 diff の ADD/UPDATE/DELETE」という既存契約を回帰させないことを検証する。
 */

import { act, renderHook, waitFor } from "@testing-library/react";
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

describe("useCompetitionTabSave", () => {
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

  const setup = (
    user: { id: string } | null = { id: "user-1" },
    supabaseOpts: { teamId?: string | null; poolType?: 0 | 1 } = {},
  ) => {
    const supabase = createFakeSupabase(supabaseOpts);
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
          supabase: supabase as any,
          user,
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
    return result;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("user が null の場合は認証エラーを投げ、createCompetition/updateCompetition は呼ばれない", async () => {
    const result = setup(null);

    let caught: unknown = null;
    await act(async () => {
      try {
        await result.current(baseParams());
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect(createCompetition).not.toHaveBeenCalled();
    expect(updateCompetition).not.toHaveBeenCalled();
  });

  it("editingCompetitionId が null の場合は createCompetition が呼ばれる", async () => {
    const result = setup();

    await act(async () => {
      await result.current(
        baseParams({
          basicData: { date: "2026-07-10", endDate: "", title: "テスト大会", place: "会場A", poolType: 1, note: "" },
        }),
      );
    });

    expect(createCompetition).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-07-10", title: "テスト大会", place: "会場A", pool_type: 1 }),
    );
    expect(updateCompetition).not.toHaveBeenCalled();
    expect(setEditingCompetitionId).toHaveBeenCalledWith("new-comp-id");
  });

  it("editingCompetitionId が指定されている場合は updateCompetition が呼ばれる", async () => {
    const result = setup();

    await act(async () => {
      await result.current(baseParams({ editingCompetitionId: "comp-1" }));
    });

    expect(updateCompetition).toHaveBeenCalledWith("comp-1", expect.objectContaining({ date: "2026-07-10" }));
    expect(createCompetition).not.toHaveBeenCalled();
  });

  it("個人大会 (team_id なし) のエントリー追加は createPersonalEntry を使う", async () => {
    const result = setup({ id: "user-1" }, { teamId: null });
    mocks.createPersonalEntry.mockResolvedValue({
      id: "entry-new",
      competition_id: "comp-1",
      user_id: "user-1",
      style_id: 2,
      entry_time: null,
      note: null,
      team_id: null,
    });

    await act(async () => {
      await result.current(
        baseParams({
          editingCompetitionId: "comp-1",
          entries: [{ id: "temp-1", styleId: "2", entryTime: 0, note: "", isRelaying: false }],
          originalEntryIds: [],
        }),
      );
    });

    expect(mocks.createPersonalEntry).toHaveBeenCalledTimes(1);
    expect(mocks.createTeamEntry).not.toHaveBeenCalled();
    expect(setCreatedEntries).toHaveBeenCalled();
  });

  it("チーム大会 (team_id あり) のエントリー追加は createTeamEntry を使う", async () => {
    const result = setup({ id: "user-1" }, { teamId: "team-1" });
    mocks.createTeamEntry.mockResolvedValue({
      id: "entry-new",
      competition_id: "comp-1",
      user_id: "user-1",
      style_id: 2,
      entry_time: null,
      note: null,
      team_id: "team-1",
    });

    await act(async () => {
      await result.current(
        baseParams({
          editingCompetitionId: "comp-1",
          entries: [{ id: "temp-1", styleId: "2", entryTime: 0, note: "", isRelaying: false }],
          originalEntryIds: [],
        }),
      );
    });

    expect(mocks.createTeamEntry).toHaveBeenCalledWith(
      "team-1",
      "user-1",
      expect.objectContaining({ competition_id: "comp-1", style_id: 2 }),
    );
    expect(mocks.createPersonalEntry).not.toHaveBeenCalled();
  });

  it("記録 diff の ADD/UPDATE/DELETE がそれぞれ正しい API 呼び出しに変換される", async () => {
    const result = setup();

    await act(async () => {
      await result.current(
        baseParams({
          editingCompetitionId: "comp-1",
          originalRecordIds: ["22222222-2222-2222-2222-222222222222", "record-to-delete"],
          records: [
            {
              id: "22222222-2222-2222-2222-222222222222",
              styleId: "2",
              time: 30.0,
              note: "",
              isRelaying: false,
              videoPath: "",
              reactionTime: "",
              splitTimes: [],
            },
            {
              id: "temp-new",
              styleId: "2",
              time: 60.0,
              note: "",
              isRelaying: false,
              videoPath: "",
              reactionTime: "",
              splitTimes: [],
            },
          ],
        }),
      );
    });

    expect(updateRecord).toHaveBeenCalledTimes(1);
    expect(updateRecord).toHaveBeenCalledWith(
      "22222222-2222-2222-2222-222222222222",
      expect.objectContaining({ style_id: 2, time: 30.0 }),
    );

    expect(createRecord).toHaveBeenCalledTimes(1);
    expect(createRecord).toHaveBeenCalledWith(
      expect.objectContaining({ style_id: 2, time: 60.0, competition_id: "comp-1" }),
    );

    expect(deleteRecord).toHaveBeenCalledWith("record-to-delete");
  });

  it("全成功後に setEditingCompetitionId(null) / closeCompetitionTabModal / onSaved が呼ばれる", async () => {
    const result = setup();

    await act(async () => {
      await result.current(baseParams({ editingCompetitionId: "comp-1" }));
    });

    await waitFor(() => {
      expect(closeCompetitionTabModal).toHaveBeenCalledTimes(1);
    });
    expect(setEditingCompetitionId).toHaveBeenCalledWith(null);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(setCompetitionLoading).toHaveBeenCalledWith(false);
  });
});
