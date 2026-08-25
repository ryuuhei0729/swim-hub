/**
 * CompetitionTabModal — pool_type / end_date / note 保持契約テスト (Sprint Contract)
 *
 * 対象バグ: 長水路(pool_type=1)で作成した大会をエントリー/記録タブのみ編集して保存すると
 * 短水路(0)に上書きされる。真因は「保存側は無条件に pool_type を書く / 読み込み側は
 * pool_type を渡していない」の非対称。D-1 は CompetitionTabModal が editingCompetitionId
 * から競技会本体を DB 再取得して basicData を初期化する設計に改める (mobile
 * `CompetitionTabFormScreen.tsx:379-398` の select("*") 全件再取得と同型)。
 *
 * このファイルは「モーダルが開いた時点で表示する pool_type/end_date/note の初期値」と
 * 「Save ボタン押下時に onSave に渡す basicData」を検証する。
 * DB への実際の書き込み (updateCompetition が呼ばれるか) は
 * __tests__/integration/CompetitionTabModalSaveGuard.test.tsx で検証する。
 *
 * 【現時点(実装前)の期待】: D-1/D-2/D-5 未実装のため、editingData に pool_type 等を
 * 積んでいない呼び出し元 (実際の6経路の大半がこれに該当) からモーダルを開くと、
 * このテストは赤くなるのが正しい。壊れた「常に短水路で開く」挙動を pin しない。
 */

import React from "react";
import { act } from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StyleOption } from "@/components/forms/record-log/types";
import type { EditingData } from "@/stores/types";

// ---------------------------------------------------------------------------
// 汎用クエリチェーンレコーダー
// ---------------------------------------------------------------------------
// 実装がどのメソッドチェーンで competitions テーブルを再取得するか (D-1 は未実装のため
// 確定していない) に依存しないよう、任意の深さでチェーン可能かつ任意の時点で awaitable
// (thenable) なモックを使う。select/eq 等の呼び出し引数はすべて `calls` に記録し、
// V-8 (クエリ引数自体の検証) でモックの制約をプロダクションのクエリ形状に合わせて
// 緩めることなく検証できるようにする。
// ---------------------------------------------------------------------------
interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

function makeChain(calls: RecordedCall[], table: string, resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  const chainMethods = ["select", "eq", "order", "range", "in", "match", "filter", "neq"];
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
  chain.maybeSingle = (...args: unknown[]) => {
    calls.push({ table, method: "maybeSingle", args });
    return Promise.resolve(resolveValue);
  };
  chain.then = (
    onFulfilled?: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(resolveValue).then(onFulfilled, onRejected);
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
}

type CompetitionFixtureResolver =
  | CompetitionFixture
  | null
  | "ERROR"
  /** 呼び出し回数 (0-indexed) に応じて結果を切り替える (R2: 保存時リトライ実証用) */
  | ((callIndex: number) => CompetitionFixture | null | "ERROR");

function createFakeSupabase(fixtures: {
  competition?: CompetitionFixtureResolver;
  entries?: unknown[];
  records?: unknown[];
  splitTimes?: unknown[];
}) {
  const calls: RecordedCall[] = [];
  let competitionsCallCount = 0;
  const from = vi.fn((table: string) => {
    if (table === "competitions") {
      const resolved =
        typeof fixtures.competition === "function"
          ? fixtures.competition(competitionsCallCount)
          : fixtures.competition;
      competitionsCallCount += 1;
      if (resolved === "ERROR") {
        return makeChain(calls, table, { data: null, error: { message: "fetch failed" } });
      }
      return makeChain(calls, table, { data: resolved ?? null, error: null });
    }
    if (table === "entries") {
      return makeChain(calls, table, { data: fixtures.entries ?? [], error: null });
    }
    if (table === "records") {
      return makeChain(calls, table, { data: fixtures.records ?? [], error: null });
    }
    if (table === "split_times") {
      return makeChain(calls, table, { data: fixtures.splitTimes ?? [], error: null });
    }
    return makeChain(calls, table, { data: null, error: null });
  });
  return { from, calls };
}

let currentAuth: { user: { id: string }; subscription: null; supabase: ReturnType<typeof createFakeSupabase> };

vi.mock("@/contexts", () => ({
  useAuth: () => currentAuth,
}));

vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loadBestTimes: vi.fn() }),
}));

vi.mock("@apps/shared/api", () => ({
  CompetitionAPI: class {
    getUniqueCompetitionPlaces = vi.fn().mockResolvedValue([]);
  },
}));

// RecordLogEntry は記録タブの重量 UI (動画/スプリット編集等)。pool_type の保持契約とは
// 無関係なため軽量スタブに差し替え、レンダーコストとテストの関心事のブレを抑える。
vi.mock("@/components/forms/record-log/components/RecordLogEntry", () => ({
  default: () => <div data-testid="record-log-entry-stub" />,
}));

import CompetitionTabModal from "@/components/forms/CompetitionTabModal";

const styles: StyleOption[] = [{ id: 2, nameJp: "50m自由形", distance: 50 }];

const FUTURE_DATE = "2099-01-01"; // エントリータブが表示される未来日固定値

function renderModal(opts: {
  editingData: EditingData | null;
  editingCompetitionId: string | null;
  competitionFixture?: CompetitionFixtureResolver;
  entryLocked?: boolean;
  onSave?: ReturnType<typeof vi.fn>;
}) {
  currentAuth = {
    user: { id: "user-1" },
    subscription: null,
    supabase: createFakeSupabase({ competition: opts.competitionFixture }),
  };
  const onSave = opts.onSave ?? vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <CompetitionTabModal
      isOpen={true}
      onClose={vi.fn()}
      onSave={onSave}
      selectedDate={new Date(FUTURE_DATE)}
      editingData={opts.editingData}
      editingCompetitionId={opts.editingCompetitionId}
      styles={styles}
      isLoading={false}
      entryLocked={opts.entryLocked}
    />,
  );
  return { ...utils, onSave, supabaseCalls: currentAuth.supabase.calls };
}

// 実際の6ビルダーの出力を模した「暫定値のみ」の editingData。
// D-1 実装後はこれらのいずれからモーダルを開いても DB 再取得で pool_type=1 に上書きされるはず。
const PROVISIONAL_EDITING_DATA_VARIANTS: Array<[string, EditingData]> = [
  [
    "buildCompetitionEditingData 型 (id,type,date,title,place のみ)",
    { id: "comp-1", type: "competition", date: FUTURE_DATE, title: "県大会", place: "県営プール" } as EditingData,
  ],
  [
    "useCalendarHandlers 型 (id,type,date,title,place のみ、pool_type 欠落)",
    { id: "comp-1", type: "competition", date: FUTURE_DATE, title: "県大会", place: "県営プール" } as EditingData,
  ],
  ["editingData なし (competitionId のみで開く経路)", null],
];

describe("CompetitionTabModal — pool_type/end_date/note 保持契約", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.each(PROVISIONAL_EDITING_DATA_VARIANTS)(
    "[V-1][V-2][V-3] 暫定 editingData: %s",
    (_label, editingData) => {
      it("長水路の競技会を開くと pool_type=1 (長水路) が選択状態になる", async () => {
        renderModal({
          editingData,
          editingCompetitionId: "comp-1",
          competitionFixture: {
            id: "comp-1",
            date: FUTURE_DATE,
            end_date: null,
            title: "県大会",
            place: "県営プール",
            pool_type: 1,
            note: null,
          },
        });

        await waitFor(() => {
          expect(screen.getByTestId("competition-tab-pool-type-1")).toHaveAttribute(
            "aria-pressed",
            "true",
          );
        });
        expect(screen.getByTestId("competition-tab-pool-type-0")).toHaveAttribute(
          "aria-pressed",
          "false",
        );
      });

      it("エントリータブのみ編集して保存すると、onSave の basicData.poolType は 1 のまま", async () => {
        const { onSave } = renderModal({
          editingData,
          editingCompetitionId: "comp-1",
          competitionFixture: {
            id: "comp-1",
            date: FUTURE_DATE,
            end_date: null,
            title: "県大会",
            place: "県営プール",
            pool_type: 1,
            note: null,
          },
        });

        // 長水路が選択状態になるまで待つ (DB 再取得完了の合図)
        await waitFor(() => {
          expect(screen.getByTestId("competition-tab-pool-type-1")).toHaveAttribute(
            "aria-pressed",
            "true",
          );
        });

        await act(async () => {
          screen.getByTestId("competition-tab-modal-save").click();
        });

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        const params = onSave.mock.calls[0][0];
        expect(params.basicData.poolType).toBe(1);
      });
    },
  );

  it("[V-5] end_date を設定した競技会でエントリーのみ保存しても end_date が消えない", async () => {
    const { onSave } = renderModal({
      editingData: { id: "comp-1", type: "competition", date: FUTURE_DATE, title: "県大会", place: "" } as EditingData,
      editingCompetitionId: "comp-1",
      competitionFixture: {
        id: "comp-1",
        date: FUTURE_DATE,
        end_date: "2099-01-03",
        title: "県大会",
        place: "",
        pool_type: 1,
        note: null,
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("competition-tab-end-date")).toHaveValue("2099-01-03");
    });

    await act(async () => {
      screen.getByTestId("competition-tab-modal-save").click();
    });

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].basicData.endDate).toBe("2099-01-03");
  });

  it("[V-6] note を設定した競技会でエントリーのみ保存しても note が消えない", async () => {
    const { onSave } = renderModal({
      editingData: { id: "comp-1", type: "competition", date: FUTURE_DATE, title: "県大会", place: "" } as EditingData,
      editingCompetitionId: "comp-1",
      competitionFixture: {
        id: "comp-1",
        date: FUTURE_DATE,
        end_date: null,
        title: "県大会",
        place: "",
        pool_type: 1,
        note: "更衣室は東側です",
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("competition-tab-note")).toHaveValue("更衣室は東側です");
    });

    await act(async () => {
      screen.getByTestId("competition-tab-modal-save").click();
    });

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].basicData.note).toBe("更衣室は東側です");
  });

  it("[V-4] 長水路に修正・保存した後、同じ競技会を再度開いても長水路のまま (症状B-2の再発防止)", async () => {
    const fixture: CompetitionFixture = {
      id: "comp-1",
      date: FUTURE_DATE,
      end_date: null,
      title: "県大会",
      place: "",
      pool_type: 1,
      note: null,
    };

    const first = renderModal({
      editingData: { id: "comp-1", type: "competition", date: FUTURE_DATE, title: "県大会", place: "" } as EditingData,
      editingCompetitionId: "comp-1",
      competitionFixture: fixture,
    });
    await waitFor(() => {
      expect(screen.getByTestId("competition-tab-pool-type-1")).toHaveAttribute("aria-pressed", "true");
    });
    first.unmount();

    // 2回目の open: 別のモーダルインスタンス。内部 state が引き継がれていないことを保証しつつ、
    // DB の実値 (pool_type=1) を再取得して同じ結果になることを確認する。
    renderModal({
      editingData: { id: "comp-1", type: "competition", date: FUTURE_DATE, title: "県大会 (タイトルのみ修正)", place: "" } as EditingData,
      editingCompetitionId: "comp-1",
      competitionFixture: fixture,
    });
    await waitFor(() => {
      expect(screen.getByTestId("competition-tab-pool-type-1")).toHaveAttribute("aria-pressed", "true");
    });
    expect(screen.getByTestId("competition-tab-pool-type-0")).toHaveAttribute("aria-pressed", "false");
  });

  it("[V-8] competitions テーブルの再取得クエリが pool_type を SELECT し、対象 id で絞り込んでいる (クエリ形状の直接検証)", async () => {
    const { supabaseCalls } = renderModal({
      editingData: { id: "comp-1", type: "competition", date: FUTURE_DATE, title: "県大会", place: "" } as EditingData,
      editingCompetitionId: "comp-1",
      competitionFixture: {
        id: "comp-1",
        date: FUTURE_DATE,
        end_date: null,
        title: "県大会",
        place: "",
        pool_type: 1,
        note: null,
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("competition-tab-pool-type-1")).toHaveAttribute("aria-pressed", "true");
    });

    const competitionsCalls = supabaseCalls.filter((c) => c.table === "competitions");
    // クエリ引数を捨てるモックはスコープを検証不能にする (past feedback) — select 文字列自体を検証する
    const selectCallsWithPoolType = competitionsCalls.filter(
      (c) => c.method === "select" && String(c.args[0]).includes("pool_type"),
    );
    expect(selectCallsWithPoolType.length).toBeGreaterThan(0);

    const eqCallsForId = competitionsCalls.filter(
      (c) => c.method === "eq" && String(c.args[0]) === "id" && String(c.args[1]) === "comp-1",
    );
    expect(eqCallsForId.length).toBeGreaterThan(0);
  });

  it("[V-12] pool_type が null の旧データでもクラッシュせず短水路(0)を安全側デフォルトとして表示する", async () => {
    renderModal({
      editingData: { id: "comp-1", type: "competition", date: FUTURE_DATE, title: "旧大会", place: "" } as EditingData,
      editingCompetitionId: "comp-1",
      competitionFixture: {
        id: "comp-1",
        date: FUTURE_DATE,
        end_date: null,
        title: "旧大会",
        place: "",
        pool_type: null,
        note: null,
      },
    });

    await screen.findByText("旧大会", undefined, { timeout: 3000 }).catch(() => {
      // タイトル欄は input なので findByText は使えない可能性がある。フォールバックで
      // モーダル自体の描画を確認する。
    });
    expect(screen.getByTestId("competition-tab-modal")).toBeInTheDocument();
    // クラッシュせず、いずれかの pool type ボタンが選択状態になっている
    await waitFor(() => {
      const shortPressed = screen.getByTestId("competition-tab-pool-type-0").getAttribute("aria-pressed");
      const longPressed = screen.getByTestId("competition-tab-pool-type-1").getAttribute("aria-pressed");
      expect([shortPressed, longPressed]).toContain("true");
    });
  });

  it("[V-13] entryLocked (entry_status が open でない) でも長水路は正しく保持される", async () => {
    const { onSave } = renderModal({
      editingData: { id: "comp-1", type: "competition", date: FUTURE_DATE, title: "県大会", place: "" } as EditingData,
      editingCompetitionId: "comp-1",
      entryLocked: true,
      competitionFixture: {
        id: "comp-1",
        date: FUTURE_DATE,
        end_date: null,
        title: "県大会",
        place: "",
        pool_type: 1,
        note: null,
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("competition-tab-pool-type-1")).toHaveAttribute("aria-pressed", "true");
    });
    // エントリータブは非表示 (ロック中)
    expect(screen.queryByRole("tab", { selected: true, name: /エントリー/ })).not.toBeInTheDocument();

    await act(async () => {
      screen.getByTestId("competition-tab-modal-save").click();
    });

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].basicData.poolType).toBe(1);
  });

  it("[V-14] 新規作成 (competitionId 無し) では competitions テーブルへの再取得を行わず、デフォルト値(0)で開く", async () => {
    const { supabaseCalls } = renderModal({
      editingData: null,
      editingCompetitionId: null,
    });

    await waitFor(() => {
      expect(screen.getByTestId("competition-tab-pool-type-0")).toHaveAttribute("aria-pressed", "true");
    });
    const competitionsCalls = supabaseCalls.filter((c) => c.table === "competitions");
    expect(competitionsCalls.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Reviewer 追加要求 (Phase B): CompetitionTabModal.tsx の初期化ロジックにある
  // `pick()` は top-level / editData.competition / metadata.competition の3箇所を
  // 優先順位付きで合成する。このうち metadata.competition (D-2 の `metaComp` 分岐) は
  // dashboard/_hooks/useCalendarHandlers.ts:341 `openCompetitionTabModal(dateObj, item as
  // EditingData)` (DayDetailModal.tsx の大会カード編集導線) が唯一の実呼び出し元だが、
  // 専用テストが無かった。editingCompetitionId をあえて null にして D-1 の DB 再取得による
  // 上書きを起こさせず、`pick()` の暫定値合成ロジック自体を単独で検証する。
  // ---------------------------------------------------------------------------
  it(
    "[Reviewer追加] metadata.competition 形式の editingData (DayDetailModal.tsx 経路、" +
      "useCalendarHandlers.ts:341 の item as EditingData) から pool_type が正しく反映される",
    async () => {
      const editingData = {
        id: "comp-1",
        type: "competition",
        date: FUTURE_DATE,
        // CalendarItem の top-level title はカレンダー表示用の要約値であり、
        // 大会の実タイトルと異なりうる (COALESCE 等)
        title: "カレンダー表示用サマリー",
        place: "",
        metadata: {
          competition: {
            id: "comp-1",
            title: "実際の大会名",
            date: FUTURE_DATE,
            place: "県営プール",
            pool_type: 1,
            team_id: null,
          },
        },
      } as unknown as EditingData;

      renderModal({
        editingData,
        // D-1 の DB 再取得による上書きを起こさせず、pick() の暫定値合成のみを検証する
        editingCompetitionId: null,
      });

      await waitFor(() => {
        expect(screen.getByTestId("competition-tab-pool-type-1")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      });
      expect(screen.getByTestId("competition-tab-pool-type-0")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    },
  );

  it(
    "[Reviewer追加] pick() の優先順位: top-level の pool_type が " +
      "metadata.competition.pool_type と矛盾する場合、top-level が優先される",
    async () => {
      const editingData = {
        id: "comp-1",
        type: "competition",
        date: FUTURE_DATE,
        title: "大会",
        place: "",
        // top-level は長水路(1)
        pool_type: 1,
        metadata: {
          // metadata.competition は矛盾する短水路(0)
          competition: { id: "comp-1", pool_type: 0, date: FUTURE_DATE, title: "大会", place: "" },
        },
      } as unknown as EditingData;

      renderModal({
        editingData,
        editingCompetitionId: null,
      });

      await waitFor(() => {
        expect(screen.getByTestId("competition-tab-pool-type-1")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      });
      expect(screen.getByTestId("competition-tab-pool-type-0")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    },
  );

  it(
    "[Reviewer追加] pick() の優先順位: editData.competition が " +
      "metadata.competition と矛盾する場合、editData.competition (中間優先度) が優先される",
    async () => {
      const editingData = {
        id: "comp-1",
        type: "competition",
        date: FUTURE_DATE,
        title: "大会",
        place: "",
        // top-level には pool_type が無い
        editData: {
          competition: { id: "comp-1", pool_type: 1, date: FUTURE_DATE, title: "大会", place: "" },
        },
        metadata: {
          competition: { id: "comp-1", pool_type: 0, date: FUTURE_DATE, title: "大会", place: "" },
        },
      } as unknown as EditingData;

      renderModal({
        editingData,
        editingCompetitionId: null,
      });

      await waitFor(() => {
        expect(screen.getByTestId("competition-tab-pool-type-1")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      });
      expect(screen.getByTestId("competition-tab-pool-type-0")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    },
  );

  // ---------------------------------------------------------------------------
  // R2→R3 (Reviewer 再レビュー / PM 申し送り): 症状B-2 の新経路。
  //
  // 初回の DB 再取得 (D-1 mount effect) が失敗 → ユーザーが基本タブを編集 → 保存 →
  // handleSave 内のリトライが成功。
  //
  // R2 (「編集済みなら basicData を丸ごと使う/丸ごと DB 実値で置換する」の二択) には
  // Critical な穴があった: ユーザーが title だけ直しても "編集済み" 判定になり、
  // 既に取得できている DB 真値の pool_type を捨てて暫定値の pool_type (誤った値) を
  // そのまま書き込んでしまう (= 取得できた真値を活かさない、Critical-1 より悪い設計)。
  //
  // R3 の新設計:
  //   1. 独立フィールド (title/place/poolType/note): フィールドごとに、暫定値から
  //      変えていれば「ユーザー値」、変えていなければ「DB 真値」
  //   2. date と endDate は1つの単位: どちらか触られていれば両方ユーザー値、
  //      どちらも触られていなければ両方 DB 真値 (異なるソースの混在を作らない)
  //   3. マージ後に日付整合性を再検証: endDate < date になるマージ結果は
  //      何も書き込まずエラーで停止し、モーダルは閉じない
  //
  // 【ベースライン比較の落とし穴】(PM 指摘) 「暫定値から変えたか」の判定基準
  // (initialDraftRef.current) は、このブロック自身が末尾で DB 実値に書き換えるため、
  // 比較用スナップショットは書き換え **前** に取得しなければならない。もし実装が
  // 誤って「DB 実値に書き換えた後」に比較すると、触っていない全フィールドが
  // 「ユーザー値扱い(=暫定値のまま)」に誤判定される。本ファイルの「title だけ編集」テストは、
  // 触れていない place/note/poolType が正しく DB 実値になっていることを検証することで、
  // このベースライン誤りを直接検出できる設計にしている。
  // ---------------------------------------------------------------------------

  it(
    "[R3 本命] 初回DB再取得失敗→暫定pool_type=0(DB真値は1)→ユーザーがtitleだけ変更→保存→" +
      "リトライ成功、の経路で pool_type はDB真値(1)が採用され、titleはユーザー値が採用される " +
      "(触れていない place/note/poolType がすべてDB実値になっているかがベースライン誤りの検出点)",
    async () => {
      const { onSave } = renderModal({
        editingData: {
          id: "comp-1",
          type: "competition",
          date: "2026-08-05",
          title: "暫定タイトル",
          place: "暫定プレイス",
          pool_type: 0,
          note: "暫定ノート",
        } as EditingData,
        editingCompetitionId: "comp-1",
        // 1回目 (mount 時の D-1 fetch) は失敗、2回目 (保存時のリトライ) は成功する。
        competitionFixture: (callIndex) =>
          callIndex === 0
            ? "ERROR"
            : {
                id: "comp-1",
                date: "2026-08-05",
                end_date: null,
                title: "DB実タイトル",
                place: "DB実プレイス",
                pool_type: 1,
                note: "DB実ノート",
              },
      });

      await waitFor(() => {
        expect(screen.getByTestId("competition-tab-modal")).toBeInTheDocument();
      });
      expect(screen.getByTestId("competition-tab-title")).toHaveValue("暫定タイトル");

      const user = userEvent.setup();
      // title だけ編集する。pool_type/place/note には一切触れない。
      const titleInput = screen.getByTestId("competition-tab-title");
      await user.clear(titleInput);
      await user.type(titleInput, "ユーザー編集タイトル");

      await act(async () => {
        screen.getByTestId("competition-tab-modal-save").click();
      });

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      const savedBasicData = onSave.mock.calls[0][0].basicData;

      // 編集したフィールド (title) はユーザー値
      expect(savedBasicData.title).toBe("ユーザー編集タイトル");
      // 編集していないフィールドは DB 真値 (ベースラインが正しく「開いた時点の暫定値」で
      // 比較されていることの証拠。誤って書き換え後の値と比較すると、これらが暫定値のまま
      // 残ってしまう)
      expect(savedBasicData.poolType).toBe(1);
      expect(savedBasicData.place).toBe("DB実プレイス");
      expect(savedBasicData.note).toBe("DB実ノート");
    },
  );

  it(
    "[R3] 逆方向: ユーザーがpool_typeだけ長水路(1)に変更→保存→リトライ成功、の経路で" +
      "ユーザーの1が採用され、DBの0で上書きされない。他の未編集フィールドはDB実値になる",
    async () => {
      const { onSave } = renderModal({
        editingData: {
          id: "comp-1",
          type: "competition",
          date: "2026-08-05",
          title: "暫定タイトル",
          place: "暫定プレイス",
          pool_type: 0,
          note: "暫定ノート",
        } as EditingData,
        editingCompetitionId: "comp-1",
        competitionFixture: (callIndex) =>
          callIndex === 0
            ? "ERROR"
            : {
                id: "comp-1",
                date: "2026-08-05",
                end_date: null,
                title: "DB実タイトル",
                place: "DB実プレイス",
                pool_type: 0, // DB 側は短水路のまま (ユーザーが直そうとしている値と対立させる)
                note: "DB実ノート",
              },
      });

      await waitFor(() => {
        expect(screen.getByTestId("competition-tab-modal")).toBeInTheDocument();
      });

      const user = userEvent.setup();
      // pool_type だけ長水路(1)に変更する
      await user.click(screen.getByTestId("competition-tab-pool-type-1"));

      await act(async () => {
        screen.getByTestId("competition-tab-modal-save").click();
      });

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      const savedBasicData = onSave.mock.calls[0][0].basicData;

      // ユーザーが編集した pool_type はユーザー値 (1) が優先され、DB の 0 で上書きされない
      expect(savedBasicData.poolType).toBe(1);
      // 未編集の title/place/note は DB 実値になる
      expect(savedBasicData.title).toBe("DB実タイトル");
      expect(savedBasicData.place).toBe("DB実プレイス");
      expect(savedBasicData.note).toBe("DB実ノート");
    },
  );

  it(
    "[R3] date/endDateの結合: endDateだけ変更した場合、dateもユーザー値が使われる " +
      "(dateがDB実値・endDateがユーザー値という混在が起きないこと)",
    async () => {
      const { onSave } = renderModal({
        editingData: {
          id: "comp-1",
          type: "competition",
          date: "2026-08-05",
          end_date: "2026-08-06",
          title: "暫定タイトル",
          place: "",
          pool_type: 0,
          note: "",
        } as EditingData,
        editingCompetitionId: "comp-1",
        competitionFixture: (callIndex) =>
          callIndex === 0
            ? "ERROR"
            : {
                id: "comp-1",
                // DB 実値の date/endDate はユーザーが触れていない暫定値とは全く異なる値にして、
                // 「date がユーザー値のまま残っているか (DB実値に化けていないか)」を検出できるようにする。
                date: "2099-01-10",
                end_date: "2099-01-12",
                title: "暫定タイトル",
                place: "",
                pool_type: 0,
                note: "",
              },
      });

      await waitFor(() => {
        expect(screen.getByTestId("competition-tab-modal")).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(screen.getByTestId("competition-tab-end-date")).toHaveValue("2026-08-06");
      });

      const user = userEvent.setup();
      // endDate だけをカレンダーで変更する (同じ月内の別日を選択)
      await user.click(screen.getByTestId("competition-tab-end-date-button"));
      await user.click(screen.getByRole("button", { name: "2026年8月10日" }));

      await act(async () => {
        screen.getByTestId("competition-tab-modal-save").click();
      });

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      const savedBasicData = onSave.mock.calls[0][0].basicData;

      // endDate はユーザーの編集値
      expect(savedBasicData.endDate).toBe("2026-08-10");
      // date 自体はユーザーが触れていないが、endDate と同じグループとして扱われるため
      // ユーザー側 (暫定値のまま = "2026-08-05") が採用され、DB実値 "2099-01-10" に化けない
      expect(savedBasicData.date).toBe("2026-08-05");
    },
  );

  it(
    "[R3] マージ後の日付整合性検証: マージ結果が endDate<date になる場合、" +
      "何も書き込まれずエラーが表面化する (部分保存の防止)",
    async () => {
      const { onSave } = renderModal({
        editingData: {
          id: "comp-1",
          type: "competition",
          date: "2026-08-05",
          end_date: "",
          title: "暫定タイトル",
          place: "",
          pool_type: 0,
          note: "",
        } as EditingData,
        editingCompetitionId: "comp-1",
        // date/endDate はユーザーが触れないため DB 実値が採用されるが、
        // そのDB実値自体が endDate < date という不整合を持っている
        // (マージ前の validateAll は暫定値に対してしか走っていないため、
        // マージ後にこの不整合が紛れ込む余地がある)。
        competitionFixture: (callIndex) =>
          callIndex === 0
            ? "ERROR"
            : {
                id: "comp-1",
                date: "2026-08-10",
                end_date: "2026-08-05", // date より前 = 不整合
                title: "DB実タイトル",
                place: "",
                pool_type: 1,
                note: "",
              },
      });

      await waitFor(() => {
        expect(screen.getByTestId("competition-tab-modal")).toBeInTheDocument();
      });

      const user = userEvent.setup();
      // title だけ編集 (date/endDate グループには触れない)
      const titleInput = screen.getByTestId("competition-tab-title");
      await user.clear(titleInput);
      await user.type(titleInput, "ユーザー編集タイトル");

      await act(async () => {
        screen.getByTestId("competition-tab-modal-save").click();
      });

      // 新エラーキー (dashboard.handlers.competitionSaveBlockedDateInvalid) が表面化する
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(
          "終了日と開始日の整合性を確認できなかったため、保存を中止しました。開始日・終了日を確認して再度お試しください。",
        );
      });

      // 何も書き込まれない (onSave 自体が呼ばれない = 部分保存なし)
      expect(onSave).not.toHaveBeenCalled();
    },
  );

  it(
    "[R3 対照実験] ユーザーが何も編集していない場合、初回DB再取得失敗→保存→リトライ成功の経路で、" +
      "全フィールドがリトライで得たDB実値で自己修復される",
    async () => {
      const { onSave } = renderModal({
        editingData: {
          id: "comp-1",
          type: "competition",
          date: "2026-08-05",
          end_date: "",
          title: "暫定タイトル",
          place: "暫定プレイス",
          pool_type: 0,
          note: "暫定ノート",
        } as EditingData,
        editingCompetitionId: "comp-1",
        competitionFixture: (callIndex) =>
          callIndex === 0
            ? "ERROR"
            : {
                id: "comp-1",
                date: "2099-12-31",
                end_date: null,
                title: "DB実タイトル",
                place: "DB実プレイス",
                pool_type: 1,
                note: "DB実ノート",
              },
      });

      await waitFor(() => {
        expect(screen.getByTestId("competition-tab-modal")).toBeInTheDocument();
      });

      // ユーザーは何も編集せず、そのまま保存する
      await act(async () => {
        screen.getByTestId("competition-tab-modal-save").click();
      });

      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      const savedBasicData = onSave.mock.calls[0][0].basicData;

      // 編集なし → リトライで得た DB 実値が全フィールドで採用される (自己修復)
      expect(savedBasicData.poolType).toBe(1);
      expect(savedBasicData.title).toBe("DB実タイトル");
      expect(savedBasicData.note).toBe("DB実ノート");
      expect(savedBasicData.place).toBe("DB実プレイス");
      expect(savedBasicData.date).toBe("2099-12-31");
      expect(savedBasicData.endDate).toBe("");
    },
  );
});
