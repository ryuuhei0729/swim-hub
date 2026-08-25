/**
 * useCompetitionTabSave — pool_type 自己修復 (D-6) と権限越えガード (V-11) テスト
 *
 * 既存の __tests__/hooks/useCompetitionTabSave.test.tsx は
 * 「親(competition) INSERT/UPDATE 分岐」「エントリー diff」「記録 diff の ADD/UPDATE/DELETE」
 * という既存契約の回帰を守るためのテストであり、pool_type の自己修復までは
 * カバーしていない (Sprint Contract より)。このファイルは D-6 専用に追加する。
 *
 * D-6: 既存記録を UPDATE する際、records.pool_type を保存対象の競技会の pool_type に
 * 揃える (症状B-1の緩和)。スコープ厳守: 自分の記録を保存する既存経路の中だけであり、
 * 他人の記録への一括 UPDATE を行ってはならない (V-11)。
 *
 * 【R2 (Reviewer 再レビュー / PM 申し送り) による構造変更】
 * 当初の実装は records の pool_type を得るために competitions テーブルを毎回再 SELECT
 * していた (Critical-1: この SELECT が失敗すると `?? 0` で既存レコードが破壊された)。
 * R2 では「この SELECT は構造的に冗長」と判定され撤去された。basicData.poolType は
 * 呼び出し元 (CompetitionTabModal) が新規作成時は init 時に強制 resolved、編集時は
 * DB 再取得の成功時のみ確定させる (失敗時は保存自体を throw で止める) ため、
 * useCompetitionTabSave 側で再確認する必要が無い。
 * これにより Critical-1 が UPDATE 経路で塞いだ「取得失敗時に 0 で上書き」という穴は、
 * ADD (新規記録作成) 経路も含めて構造的に消える (再 SELECT 自体が無いので失敗しうる余地がない)。
 * このファイルの旧 Critical-1 テスト (SELECT error/null-data で pool_type キーを省く) は
 * この構造変更で前提が失われたため、「同じ不変条件 (推測値を書かない/正しい値が書かれる) を
 * 新しい構造で検証する」形に更新した (削除ではなく置き換え)。
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
    // CompetitionTabModal (D-1/D-3 実装済み) が実際に渡すフィールド。
    // false の場合、basicData は「DB 再取得未完了の暫定値」であることを意味する。
    competitionRowResolved: true,
    ...overrides,
  }) as CompetitionTabSaveParams;

/**
 * 呼び出し (from/select/eq/update) を記録する汎用フェイク。
 * R2 以降、records の pool_type は params.basicData.poolType を直接使うため、
 * competitions テーブルへの select は team_id (エントリー diff 用) と image_paths
 * (画像処理用) のみが残る。select 文字列自体を検証できるようにしておく
 * (クエリ引数を捨てるモックにしない)。
 */
function createFakeSupabase(opts: { teamId?: string | null } = {}) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

  const resolveForSelect = (table: string, cols: string): unknown => {
    if (table === "competitions") {
      if (cols.includes("team_id")) {
        return { data: { team_id: opts.teamId ?? null }, error: null };
      }
      if (cols.includes("image_paths")) {
        return { data: { image_paths: [] }, error: null };
      }
    }
    return { data: null, error: null };
  };

  const makeSelectChain = (table: string, cols: string) => {
    const chain: Record<string, unknown> = {};
    chain.eq = (...args: unknown[]) => {
      calls.push({ table, method: "eq", args });
      return chain;
    };
    chain.single = (...args: unknown[]) => {
      calls.push({ table, method: "single", args });
      return Promise.resolve(resolveForSelect(table, cols));
    };
    chain.then = (onFulfilled?: (v: unknown) => unknown) =>
      Promise.resolve(resolveForSelect(table, cols)).then(onFulfilled);
    return chain;
  };

  const from = vi.fn((table: string) => ({
    select: (...args: unknown[]) => {
      const cols = String(args[0] ?? "");
      calls.push({ table, method: "select", args });
      return makeSelectChain(table, cols);
    },
    update: (payload: unknown) => {
      calls.push({ table, method: "update", args: [payload] });
      return {
        eq: (...args: unknown[]) => {
          calls.push({ table, method: "update.eq", args });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
    delete: () => ({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }),
  }));
  return { from, calls };
}

describe("useCompetitionTabSave — D-6 records.pool_type 自己修復 / V-11 権限越えガード / R2", () => {
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

  const setup = (supabaseOpts: { teamId?: string | null } = {}) => {
    const fake = createFakeSupabase(supabaseOpts);
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

  const oneRecord = (overrides: { id?: string } = {}) => [
    {
      id: overrides.id,
      styleId: "2",
      time: 30.0,
      note: "",
      isRelaying: false,
      videoPath: "",
      reactionTime: "",
      splitTimes: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // V-7 (D-3 ガード): 大会本体 UPDATE の競技会行未解決ガード。R2 の記録側リファクタとは
  // 独立した防御であり、そのまま維持する (PM 指示: "この防御のテストも維持してください")。
  // ---------------------------------------------------------------------------
  it(
    "[V-7] competitionRowResolved が false (DB 再取得未完了/失敗) の場合、" +
      "競技会本体の updateCompetition は発行されない。エントリー保存は続行される",
    async () => {
      const { result } = setup();
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
            competitionRowResolved: false,
            basicData: { date: "2026-07-10", endDate: "", title: "", place: "", poolType: 0, note: "" },
            entries: [{ id: "temp-1", styleId: "2", entryTime: 0, note: "", isRelaying: false }],
            originalEntryIds: [],
          }),
        );
      });

      expect(updateCompetition).not.toHaveBeenCalled();
      expect(mocks.createPersonalEntry).toHaveBeenCalledTimes(1);
    },
  );

  it(
    "[V-7 ミューテーション対照] competitionRowResolved が true の場合は通常どおり updateCompetition が呼ばれる " +
      "(このテストが常に green なままだと V-7 がトートロジー化していないことの確認にならないため対照実験として残す)",
    async () => {
      const { result } = setup();

      await act(async () => {
        await result.current(
          baseParams({
            competitionRowResolved: true,
            basicData: { date: "2026-07-10", endDate: "", title: "", place: "", poolType: 1, note: "" },
          }),
        );
      });

      expect(updateCompetition).toHaveBeenCalledWith(
        "comp-1",
        expect.objectContaining({ pool_type: 1 }),
      );
    },
  );

  // ---------------------------------------------------------------------------
  // D-6/V-11: 既存記録 UPDATE の pool_type 自己修復 (R2 以降は basicData.poolType 直接参照)
  // ---------------------------------------------------------------------------
  it("[D-6/V-11] 既存記録の UPDATE 時、records.pool_type が basicData.poolType (長水路=1) に揃う", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current(
        baseParams({
          basicData: { date: "2026-07-10", endDate: "", title: "", place: "", poolType: 1, note: "" },
          originalRecordIds: ["22222222-2222-2222-2222-222222222222"],
          records: oneRecord({ id: "22222222-2222-2222-2222-222222222222" }),
        }),
      );
    });

    expect(updateRecord).toHaveBeenCalledTimes(1);
    expect(updateRecord).toHaveBeenCalledWith(
      "22222222-2222-2222-2222-222222222222",
      expect.objectContaining({ pool_type: 1 }),
    );
  });

  it("[D-6/V-11] 短水路(0)の競技会では records.pool_type が 0 に揃う (誤って長水路化しない)", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current(
        baseParams({
          basicData: { date: "2026-07-10", endDate: "", title: "", place: "", poolType: 0, note: "" },
          originalRecordIds: ["22222222-2222-2222-2222-222222222222"],
          records: oneRecord({ id: "22222222-2222-2222-2222-222222222222" }),
        }),
      );
    });

    expect(updateRecord).toHaveBeenCalledWith(
      "22222222-2222-2222-2222-222222222222",
      expect.objectContaining({ pool_type: 0 }),
    );
  });

  // ---------------------------------------------------------------------------
  // R2: ADD (新規記録作成) 経路。今回 Reviewer が塞いだ穴の本体。
  // basicData.poolType が正しく新規レコードの pool_type に入ることを検証する。
  // ---------------------------------------------------------------------------
  it(
    "[R2] ADD (新規記録作成): 長水路(1)の大会で新規記録を作ると pool_type: 1 が書かれる " +
      "(冗長な再SELECT撤去後、basicData.poolType が正しく伝わっているかの確認)",
    async () => {
      const { result } = setup();

      await act(async () => {
        await result.current(
          baseParams({
            basicData: { date: "2026-07-10", endDate: "", title: "", place: "", poolType: 1, note: "" },
            originalRecordIds: [],
            records: oneRecord(),
          }),
        );
      });

      expect(createRecord).toHaveBeenCalledTimes(1);
      expect(createRecord).toHaveBeenCalledWith(expect.objectContaining({ pool_type: 1 }));
    },
  );

  it(
    "[R2] ADD (新規記録作成): 短水路(0)の大会で新規記録を作ると pool_type: 0 が書かれる " +
      "(長水路に化けない対照実験)",
    async () => {
      const { result } = setup();

      await act(async () => {
        await result.current(
          baseParams({
            basicData: { date: "2026-07-10", endDate: "", title: "", place: "", poolType: 0, note: "" },
            originalRecordIds: [],
            records: oneRecord(),
          }),
        );
      });

      expect(createRecord).toHaveBeenCalledWith(expect.objectContaining({ pool_type: 0 }));
    },
  );

  it(
    "[R2] 構造確認: records の pool_type を得るために competitions テーブルへの再SELECTが発生しない " +
      "(Critical-1 が UPDATE 経路で塞いだ穴が、そもそも SELECT が無いことで ADD 経路にも残らない)",
    async () => {
      const { result, fake } = setup();

      await act(async () => {
        await result.current(
          baseParams({
            basicData: { date: "2026-07-10", endDate: "", title: "", place: "", poolType: 1, note: "" },
            originalRecordIds: ["22222222-2222-2222-2222-222222222222"],
            records: [
              ...oneRecord({ id: "22222222-2222-2222-2222-222222222222" }),
              { styleId: "2", time: 60.0, note: "", isRelaying: false, videoPath: "", reactionTime: "", splitTimes: [] },
            ],
          }),
        );
      });

      // team_id select (entries diff 用) や image_paths select は許容するが、
      // "pool_type" 単体 select (旧 Critical-1 の元ネタ) は発生してはならない。
      const poolTypeOnlySelects = fake.calls.filter(
        (c) =>
          c.table === "competitions" &&
          c.method === "select" &&
          String(c.args[0]).includes("pool_type") &&
          !String(c.args[0]).includes("team_id"),
      );
      expect(poolTypeOnlySelects.length).toBe(0);
    },
  );

  it(
    "[R2 境界] basicData.poolType が 0/1 以外の不正値の場合、isPoolType の narrowing により " +
      "0 にフォールバックする (推測で長水路にはしない安全側デフォルト)",
    async () => {
      const { result } = setup();

      await act(async () => {
        await result.current(
          baseParams({
            // フォーム state は number 型のため理論上 0/1 以外も渡り得る境界値
            basicData: { date: "2026-07-10", endDate: "", title: "", place: "", poolType: 99, note: "" },
            originalRecordIds: [],
            records: oneRecord(),
          }),
        );
      });

      expect(createRecord).toHaveBeenCalledWith(expect.objectContaining({ pool_type: 0 }));
    },
  );

  it(
    "[V-11] records.pool_type の自己修復は updateRecord (自分の記録の diff 経路) 経由のみで行われ、" +
      "competition_id 等をキーにした一括 UPDATE (他人の記録も含む可能性がある) を発行しない",
    async () => {
      const { result, fake } = setup();

      await act(async () => {
        await result.current(
          baseParams({
            basicData: { date: "2026-07-10", endDate: "", title: "", place: "", poolType: 1, note: "" },
            originalRecordIds: ["22222222-2222-2222-2222-222222222222"],
            records: oneRecord({ id: "22222222-2222-2222-2222-222222222222" }),
          }),
        );
      });

      // records テーブルへの直接 .update() 呼び出し (一括更新の疑い) が発生していないこと。
      // 正しい経路は updateRecord (props で渡された関数、= 個別 ID 指定の API) のみを使う。
      const directRecordsTableUpdates = fake.calls.filter(
        (c) => c.table === "records" && c.method === "update",
      );
      expect(directRecordsTableUpdates.length).toBe(0);
    },
  );
});
