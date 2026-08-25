/**
 * CompetitionTabModal × useCompetitionTabSave 統合テスト (Sprint Contract V-1 / V-7)
 *
 * 目的: CompetitionTabModal (basicData を構築する側) と useCompetitionTabSave
 * (実際に DB へ書き込む側) を実物同士で結線し、「competitions テーブルの実際の
 * UPDATE 呼び出し」まで観測できるブラックボックステストにする。
 *
 * D-3 の「書き込み前バリデーション（ガード）」がどこに実装されるか (モーダル側で
 * onSave 自体を呼ばない/hookに新フィールドを渡す等) は実装の自由度に委ねられるべき
 * であり、QA が内部インターフェースを先に固定してしまうと実装の選択を不当に縛る。
 * そのためこのテストは「competitions 行の DB 再取得が失敗した状態で保存操作を行うと、
 * 競技会本体の UPDATE が発行されない」という外部観測可能な契約のみを検証する。
 *
 * 【ミューテーションテストについて】(V-7 必須要件)
 * 「D-3 のガードを削除すると赤くなること」は、実装が入った後の Phase B で
 * 実際にガード実装を一時的に外して本テストが red になることを実測することで
 * 満たす (このファイル自体は現状 D-1/D-3 未実装のため red で正しい)。
 */

import React from "react";
import { act } from "react";
import { renderWithI18n as render, screen, waitFor } from "../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StyleOption } from "@/components/forms/record-log/types";
import type { EditingData } from "@/stores/types";
import { useCompetitionTabSave } from "@/hooks/useCompetitionTabSave";

// ---------------------------------------------------------------------------
// 汎用クエリチェーンレコーダー (CompetitionTabModal.poolType.test.tsx と同型)
// ---------------------------------------------------------------------------
interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

function makeChain(calls: RecordedCall[], table: string, resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  const chainMethods = ["select", "eq", "order", "range", "in", "match", "filter", "neq", "update", "delete"];
  chainMethods.forEach((m) => {
    chain[m] = (...args: unknown[]) => {
      calls.push({ table, method: m, args });
      return chain;
    };
  });
  chain.single = (...args: unknown[]) => {
    calls.push({ table, method: "single", args });
    return Promise.resolve(resolveValue);
  };
  chain.then = (
    onFulfilled?: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(resolveValue).then(onFulfilled, onRejected);
  return chain;
}

/**
 * select 文字列に応じてチェーンを構築する版 (Critical-2 のリトライ検証用)。
 * D-1 の「大会本体フルロー」select (date/end_date/title/place/pool_type/note を含み、
 * team_id 単体 select とは区別される) だけを呼び出し回数に応じて切り替え可能にし、
 * 他の select (team_id / pool_type 単体 / image_paths) は常に成功させる。
 * これにより「リトライ対象の fetch だけ」を制御し、無関係なクエリを巻き込まない。
 */
function makeSelectAwareCompetitionsChain(
  calls: RecordedCall[],
  cols: string,
  resolver: CompetitionFixtureResolver,
  callCounterRef: { fullRowCallCount: number },
  successFixture: CompetitionFixture,
) {
  const isFullRowSelect = cols.includes("pool_type") && cols.includes("note") && cols.includes("date");
  const isTeamIdSelect = cols.includes("team_id") && !isFullRowSelect;
  const isPoolTypeOnlySelect = cols.includes("pool_type") && !isFullRowSelect;
  const isImagePathsSelect = cols.includes("image_paths");

  const resolve = (): { data: unknown; error: unknown } => {
    if (isTeamIdSelect) return { data: { team_id: successFixture.team_id ?? null }, error: null };
    if (isPoolTypeOnlySelect) return { data: { pool_type: successFixture.pool_type ?? 0 }, error: null };
    if (isImagePathsSelect) return { data: { image_paths: successFixture.image_paths ?? [] }, error: null };

    // フルロー select: リトライ検証対象。呼び出し回数に応じて resolver を評価する。
    const callIndex = callCounterRef.fullRowCallCount;
    callCounterRef.fullRowCallCount += 1;
    const resolved = typeof resolver === "function" ? resolver(callIndex) : resolver;
    if (resolved === "ERROR") return { data: null, error: { message: "fetch failed" } };
    return { data: resolved ?? null, error: null };
  };

  const chain: Record<string, unknown> = {};
  const chainMethods = ["eq", "order", "range", "in", "match", "filter", "neq"];
  chainMethods.forEach((m) => {
    chain[m] = (...args: unknown[]) => {
      calls.push({ table: "competitions", method: m, args });
      return chain;
    };
  });
  chain.single = () => {
    calls.push({ table: "competitions", method: "single", args: [] });
    return Promise.resolve(resolve());
  };
  chain.then = (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(resolve()).then(onFulfilled, onRejected);
  return chain;
}

interface CompetitionFixture {
  id?: string;
  date?: string;
  end_date?: string | null;
  title?: string;
  place?: string;
  pool_type?: number | null;
  note?: string | null;
  team_id?: string | null;
  image_paths?: string[];
}

type CompetitionFixtureResolver =
  | CompetitionFixture
  | null
  | "ERROR"
  /** 呼び出し回数 (0-indexed) に応じて結果を切り替える (Critical-2: リトライ実証用) */
  | ((callIndex: number) => CompetitionFixture | null | "ERROR");

function createFakeSupabase(fixtures: {
  competition?: CompetitionFixtureResolver;
  /** team_id/pool_type 単体 select 等、フルロー select 以外で使う成功時の値 */
  successFixture?: CompetitionFixture;
  /** 既存レコード一覧 (R3: title-only 編集後も records.pool_type が正しく伝播するかの検証用) */
  records?: unknown[];
}) {
  const calls: RecordedCall[] = [];
  const callCounterRef = { fullRowCallCount: 0 };
  // successFixture が明示されない場合、competition が固定オブジェクト (関数/"ERROR" 以外) なら
  // それを流用する (V-1/V-7 の既存テストとの後方互換性: team_id/pool_type 単体 select も
  // 同じ大会の値を返すのが自然)。
  const inferredFixture =
    typeof fixtures.competition === "object" && fixtures.competition !== null
      ? fixtures.competition
      : undefined;
  const successFixture: CompetitionFixture = fixtures.successFixture ?? inferredFixture ?? {
    team_id: null,
    pool_type: 0,
    image_paths: [],
  };
  const from = vi.fn((table: string) => {
    if (table === "competitions") {
      return {
        select: (...args: unknown[]) => {
          const cols = String(args[0] ?? "");
          calls.push({ table, method: "select", args });
          return makeSelectAwareCompetitionsChain(
            calls,
            cols,
            fixtures.competition ?? null,
            callCounterRef,
            successFixture,
          );
        },
        update: (payload: unknown) => {
          calls.push({ table, method: "update", args: [payload] });
          return { eq: () => Promise.resolve({ data: null, error: null }) };
        },
      };
    }
    if (table === "records") {
      return makeChain(calls, table, { data: fixtures.records ?? [], error: null });
    }
    if (table === "entries" || table === "split_times") {
      return makeChain(calls, table, { data: [], error: null });
    }
    return makeChain(calls, table, { data: null, error: null });
  });
  return { from, calls, getFullRowCallCount: () => callCounterRef.fullRowCallCount };
}

let currentAuth: { user: { id: string }; subscription: null; supabase: ReturnType<typeof createFakeSupabase> };

vi.mock("@/contexts", () => ({
  useAuth: () => currentAuth,
}));

vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loadBestTimes: vi.fn() }),
}));

vi.mock("@/components/forms/record-log/components/RecordLogEntry", () => ({
  default: () => <div data-testid="record-log-entry-stub" />,
}));

vi.mock("@/lib/video-upload-client", () => ({
  uploadVideoClient: vi.fn().mockResolvedValue(undefined),
}));

const apiMocks = vi.hoisted(() => ({
  createPersonalEntry: vi.fn(),
  createTeamEntry: vi.fn(),
  updateEntry: vi.fn(),
  getUniqueCompetitionPlaces: vi.fn().mockResolvedValue([]),
  uploadCompetitionImage: vi.fn(),
  deleteCompetitionImage: vi.fn(),
}));

vi.mock("@apps/shared/api", () => ({
  EntryAPI: class {
    createPersonalEntry = apiMocks.createPersonalEntry;
    createTeamEntry = apiMocks.createTeamEntry;
    updateEntry = apiMocks.updateEntry;
  },
  CompetitionAPI: class {
    getUniqueCompetitionPlaces = apiMocks.getUniqueCompetitionPlaces;
    uploadCompetitionImage = apiMocks.uploadCompetitionImage;
    deleteCompetitionImage = apiMocks.deleteCompetitionImage;
  },
}));

import CompetitionTabModal from "@/components/forms/CompetitionTabModal";

const styles: StyleOption[] = [{ id: 2, nameJp: "50m自由形", distance: 50 }];
const FUTURE_DATE = "2099-01-01";

function Harness({
  editingData,
  editingCompetitionId,
  saveMocks,
  selectedDate,
}: {
  editingData: EditingData | null;
  editingCompetitionId: string | null;
  selectedDate?: Date;
  saveMocks: {
    createCompetition: ReturnType<typeof vi.fn>;
    updateCompetition: ReturnType<typeof vi.fn>;
    createRecord: ReturnType<typeof vi.fn>;
    updateRecord: ReturnType<typeof vi.fn>;
    deleteRecord: ReturnType<typeof vi.fn>;
    deleteEntry: ReturnType<typeof vi.fn>;
    createSplitTimes: ReturnType<typeof vi.fn>;
    replaceSplitTimes: ReturnType<typeof vi.fn>;
    setCompetitionLoading: ReturnType<typeof vi.fn>;
    setEditingCompetitionId: ReturnType<typeof vi.fn>;
    setCreatedEntries: ReturnType<typeof vi.fn>;
    closeCompetitionTabModal: ReturnType<typeof vi.fn>;
    onSaved: ReturnType<typeof vi.fn>;
  };
}) {
  const handleSave = useCompetitionTabSave({
    supabase: currentAuth.supabase as unknown as Parameters<typeof useCompetitionTabSave>[0]["supabase"],
    user: { id: "user-1" },
    styles: styles.map((s) => ({ id: Number(s.id), name_jp: s.nameJp, distance: s.distance })) as unknown as Parameters<
      typeof useCompetitionTabSave
    >[0]["styles"],
    ...saveMocks,
  });

  return (
    <CompetitionTabModal
      isOpen={true}
      onClose={vi.fn()}
      onSave={handleSave}
      selectedDate={selectedDate ?? new Date(FUTURE_DATE)}
      editingData={editingData}
      editingCompetitionId={editingCompetitionId}
      styles={styles}
      isLoading={false}
    />
  );
}

function makeSaveMocks() {
  return {
    createCompetition: vi.fn().mockResolvedValue({ id: "comp-1" }),
    updateCompetition: vi.fn().mockResolvedValue({ id: "comp-1" }),
    createRecord: vi.fn().mockResolvedValue({ id: "record-new" }),
    updateRecord: vi.fn().mockResolvedValue({ id: "record-1" }),
    deleteRecord: vi.fn().mockResolvedValue(undefined),
    deleteEntry: vi.fn().mockResolvedValue(undefined),
    createSplitTimes: vi.fn().mockResolvedValue([]),
    replaceSplitTimes: vi.fn().mockResolvedValue([]),
    setCompetitionLoading: vi.fn(),
    setEditingCompetitionId: vi.fn(),
    setCreatedEntries: vi.fn(),
    closeCompetitionTabModal: vi.fn(),
    onSaved: vi.fn(),
  };
}

/** entry タブに切り替えて1件目のエントリータイムを入力し、保存ボタンを押す */
async function fillEntryAndSave(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "エントリー" }));
  const timeInput = await screen.findByTestId("entry-time-1");
  await user.type(timeInput, "1:23.45");
  await user.tab(); // blur して parseTimeFlexible を確定させる
  await act(async () => {
    screen.getByTestId("competition-tab-modal-save").click();
  });
}

/** title だけ編集して保存する (R3: フィールド単位マージの検証用。他フィールドには触れない) */
async function editTitleOnlyAndSave(user: ReturnType<typeof userEvent.setup>, newTitle: string) {
  const titleInput = screen.getByTestId("competition-tab-title");
  await user.clear(titleInput);
  await user.type(titleInput, newTitle);
  await act(async () => {
    screen.getByTestId("competition-tab-modal-save").click();
  });
}

describe("CompetitionTabModal × useCompetitionTabSave 統合 — D-3 ガード / pool_type 保持", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[V-1] 競技会行の再取得に成功していれば、エントリーのみ保存しても pool_type=1 で UPDATE される", async () => {
    currentAuth = {
      user: { id: "user-1" },
      subscription: null,
      supabase: createFakeSupabase({
        competition: {
          id: "comp-1",
          date: FUTURE_DATE,
          end_date: null,
          title: "県大会",
          place: "",
          pool_type: 1,
          note: null,
          team_id: null,
        },
      }),
    };
    apiMocks.createPersonalEntry.mockResolvedValue({
      id: "entry-new",
      competition_id: "comp-1",
      user_id: "user-1",
      style_id: 2,
      entry_time: 83450,
      note: null,
      team_id: null,
    });
    const saveMocks = makeSaveMocks();

    const user = userEvent.setup();
    render(
      <Harness
        editingData={{ id: "comp-1", type: "competition", date: FUTURE_DATE, title: "県大会", place: "" } as EditingData}
        editingCompetitionId="comp-1"
        saveMocks={saveMocks}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("competition-tab-pool-type-1")).toHaveAttribute("aria-pressed", "true");
    });

    await fillEntryAndSave(user);

    await waitFor(() => {
      expect(saveMocks.updateCompetition).toHaveBeenCalledWith(
        "comp-1",
        expect.objectContaining({ pool_type: 1 }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Critical-2 (Reviewer 指摘 / PM 申し送り、V-7 の契約を更新):
  //
  // 当初の D-3 契約は「競技会本体の UPDATE をスキップし、エントリー/記録の保存は続行してよい」
  // だったが、Reviewer が「保存時に competitionRowResolved===false のまま進行すると、
  // 競技会本体の UPDATE を静かにスキップした上でモーダルが『成功』として閉じる
  // (部分保存が起きたことがユーザーに一切分からない)」という Critical を発見した。
  // PM の修正方針により契約が更新された:
  //   1. 保存時に未解決なら再取得を1回リトライする
  //   2. リトライが成功したら DB 実値で保存を続行する (エントリー/記録/競技会本体すべて)
  //   3. リトライも失敗したら「何も書き込まず」エラーを表示し、モーダルを閉じない
  //      (以前の「エントリー/記録の保存は続行してよい」は 3. のケースにおいて撤回された)
  // ---------------------------------------------------------------------------

  it(
    "[Critical-2] 初回の DB 再取得が失敗していても、保存時のリトライが成功すれば、" +
      "DB の実値 (暫定値ではない) で競技会本体が UPDATE され、エントリーも保存される",
    async () => {
      currentAuth = {
        user: { id: "user-1" },
        subscription: null,
        supabase: createFakeSupabase({
          // 1回目 (モーダル mount 時の D-1 fetch) は失敗、2回目 (保存時のリトライ) は成功する。
          competition: (callIndex) =>
            callIndex === 0
              ? "ERROR"
              : {
                  id: "comp-1",
                  date: FUTURE_DATE,
                  end_date: null,
                  title: "県大会(DB実値)",
                  place: "",
                  pool_type: 1,
                  note: null,
                  team_id: null,
                },
        }),
      };
      apiMocks.createPersonalEntry.mockResolvedValue({
        id: "entry-new",
        competition_id: "comp-1",
        user_id: "user-1",
        style_id: 2,
        entry_time: 83450,
        note: null,
        team_id: null,
      });
      const saveMocks = makeSaveMocks();

      const user = userEvent.setup();
      render(
        <Harness
          editingData={{ id: "comp-1", type: "competition", date: FUTURE_DATE, title: "県大会(暫定値)", place: "" } as EditingData}
          editingCompetitionId="comp-1"
          saveMocks={saveMocks}
        />,
      );

      // mount 時の fetch は失敗するため、暫定値 (短水路デフォルト) のまま安定する
      await waitFor(() => {
        expect(screen.getByTestId("competition-tab-modal")).toBeInTheDocument();
      });

      await fillEntryAndSave(user);

      // リトライ成功 → 競技会本体が DB 実値 (長水路=1, タイトルもDB実値) で UPDATE される
      await waitFor(() => {
        expect(saveMocks.updateCompetition).toHaveBeenCalledWith(
          "comp-1",
          expect.objectContaining({ pool_type: 1, title: "県大会(DB実値)" }),
        );
      });
      // エントリーも保存される (部分保存ではなく正常フロー)
      expect(apiMocks.createPersonalEntry).toHaveBeenCalled();
      expect(saveMocks.closeCompetitionTabModal).toHaveBeenCalled();
      expect(saveMocks.onSaved).toHaveBeenCalled();
    },
  );

  it(
    "[Critical-2] 初回の DB 再取得が失敗し、保存時のリトライも失敗する場合、" +
      "競技会本体・エントリー・記録のいずれも書き込まれず (部分保存なし)、" +
      "モーダルは閉じず、エラーが表面化する",
    async () => {
      currentAuth = {
        user: { id: "user-1" },
        subscription: null,
        // 常に失敗 (リトライしても解決しない)
        supabase: createFakeSupabase({ competition: "ERROR" }),
      };
      apiMocks.createPersonalEntry.mockResolvedValue({
        id: "entry-new",
        competition_id: "comp-1",
        user_id: "user-1",
        style_id: 2,
        entry_time: 83450,
        note: null,
        team_id: null,
      });
      const saveMocks = makeSaveMocks();

      const user = userEvent.setup();
      render(
        <Harness
          editingData={{ id: "comp-1", type: "competition", date: FUTURE_DATE, title: "県大会", place: "" } as EditingData}
          editingCompetitionId="comp-1"
          saveMocks={saveMocks}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("competition-tab-modal")).toBeInTheDocument();
      });

      await fillEntryAndSave(user);

      // エラーメッセージが表面化する (i18n キー: dashboard.handlers.competitionSaveBlockedUnresolved)
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(
          "大会情報を確認できなかったため、保存を中止しました。時間をおいて再度お試しください。",
        );
      });

      // 部分保存が起きていない: 競技会本体・エントリーのいずれも書き込まれない
      expect(saveMocks.updateCompetition).not.toHaveBeenCalled();
      expect(apiMocks.createPersonalEntry).not.toHaveBeenCalled();
      expect(saveMocks.createRecord).not.toHaveBeenCalled();

      // モーダルは「保存成功」として閉じてはならない
      expect(saveMocks.closeCompetitionTabModal).not.toHaveBeenCalled();
      expect(saveMocks.onSaved).not.toHaveBeenCalled();
    },
  );

  // ---------------------------------------------------------------------------
  // R3 (Reviewer 再レビュー / PM 申し送り): フィールド単位マージ後、その値が
  // useCompetitionTabSave (D-6 の records.pool_type 自己修復) にも正しく伝播することの
  // エンドツーエンド確認。CompetitionTabModal (マージ側) と useCompetitionTabSave (書き込み側)
  // を実物同士で結線しているため、「マージが正しい」ことと「伝播経路が正しい」ことの両方が
  // 同時に検証できる。
  // ---------------------------------------------------------------------------
  it(
    "[R3] title だけ編集して保存すると、pool_type は DB 実値が採用され、" +
      "既存レコードの records.pool_type にも DB 実値 (0 による汚染なし) が伝播する",
    async () => {
      const PAST_DATE = "2020-01-01"; // showRecordTab=true / showEntryTab=false にするため過去日固定
      currentAuth = {
        user: { id: "user-1" },
        subscription: null,
        supabase: createFakeSupabase({
          competition: (callIndex) =>
            callIndex === 0
              ? "ERROR"
              : {
                  id: "comp-1",
                  date: PAST_DATE,
                  end_date: null,
                  title: "DB実タイトル",
                  place: "",
                  pool_type: 1,
                  note: null,
                  team_id: null,
                },
          records: [
            {
              id: "22222222-2222-2222-2222-222222222222",
              style_id: 2,
              time: 30.0,
              is_relaying: false,
              note: null,
              video_path: null,
              reaction_time: null,
            },
          ],
        }),
      };
      const saveMocks = makeSaveMocks();

      const user = userEvent.setup();
      render(
        <Harness
          editingData={{
            id: "comp-1",
            type: "competition",
            date: PAST_DATE,
            title: "暫定タイトル",
            place: "",
          } as EditingData}
          editingCompetitionId="comp-1"
          selectedDate={new Date(PAST_DATE)}
          saveMocks={saveMocks}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("competition-tab-title")).toHaveValue("暫定タイトル");
      });

      // title だけ編集する。pool_type/place/note/date には一切触れない。
      await editTitleOnlyAndSave(user, "ユーザー編集タイトル");

      // 競技会本体: title はユーザー値、pool_type は未編集なので DB 実値 (1)
      await waitFor(() => {
        expect(saveMocks.updateCompetition).toHaveBeenCalledWith(
          "comp-1",
          expect.objectContaining({ title: "ユーザー編集タイトル", pool_type: 1 }),
        );
      });

      // 既存レコード (record-1相当) の pool_type にも DB 実値 (1) が伝播し、
      // 暫定値の 0 で汚染されていないこと (D-6 経由の二次被害防止)
      expect(saveMocks.updateRecord).toHaveBeenCalledWith(
        "22222222-2222-2222-2222-222222222222",
        expect.objectContaining({ pool_type: 1 }),
      );
    },
  );
});
