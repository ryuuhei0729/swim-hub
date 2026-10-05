/**
 * CompetitionTabModal — 編集モードの初期読み込み中は入力不可、読み込み後の編集は巻き戻らない
 *
 * 既知バグ: 編集モードで開いた直後、DB から大会本体・エントリー・レコードを取得する初期化
 * fetch が返る前にユーザーが入力すると、遅れて返った応答がフォームを DB 値で上書きし、
 * 入力が無言で失われる。
 *
 * 仕様 (PM 裁定): 3つの取得 (大会本体 / エントリー / レコード) がすべて settled (成功・0件・失敗・
 * 例外) になるまで、タブ本文を入力不可 (inert + aria-busy)、保存ボタンは disabled にし、
 * `role="status"` のオーバーレイを出す。完了後はユーザーの編集を再取得・遅延応答が上書き
 * してはならない。一度 settled になったら開いている間は再 fetch しない (失敗後も)。
 * styles 配列の参照が変わっても取得中の fetch を cancel し直さない。user が null のときは
 * エントリー/レコードを取得せず settled 扱い (固まらない)。新規作成では読み込み表示は出ない。
 *
 * 再現経路 (jsdom): supabase の competitions / entries / records の fetch を手で解決/拒否できる
 * Promise にし、styles の参照更新で effect の deps を変える。
 * 注意: jsdom の fireEvent は inert を無視する (実ブラウザのキー入力遮断は e2e で確認する)。
 * RTL の render は StrictMode ではない。
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { EditingData } from "@/stores/types";
import type { StyleOption } from "@/components/forms/record-log/types";

type Result = { data: unknown; error: { message: string } | null };
type Kind = "competitions" | "entries" | "records";
type Pending = { resolve: (v: Result) => void; reject: (e: unknown) => void; done: boolean };

const state = vi.hoisted(() => ({
  pending: { competitions: [], entries: [], records: [] } as unknown as Record<
    "competitions" | "entries" | "records",
    Array<{ resolve: (v: { data: unknown; error: { message: string } | null }) => void; reject: (e: unknown) => void; done: boolean }>
  >,
  supabase: null as unknown,
  user: { id: "user-1" } as { id: string } | null,
}));

/** competitions / entries / records の fetch だけ手動で解決/拒否。それ以外は即時に空で返す */
function createSupabaseMock() {
  const makeChain = (onThen: (p: Pending) => void) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "single", "in", "not", "limit"]) chain[m] = () => chain;
    chain.then = (onF: (v: Result) => unknown, onR?: (e: unknown) => unknown) =>
      new Promise<Result>((resolve, reject) => onThen({ resolve, reject, done: false })).then(onF, onR);
    return chain;
  };
  const immediate = () => makeChain((p) => p.resolve({ data: [], error: null }));
  return {
    from: (table: string) => {
      if (table === "competitions" || table === "entries" || table === "records") {
        return makeChain((p) => state.pending[table as Kind].push(p));
      }
      return immediate();
    },
  };
}

vi.mock("@apps/shared/hooks/queries/goalTargets", () => ({
  useGoalTargetsQuery: () => ({ data: [], isError: false, isPending: false }),
}));
vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: state.user, subscription: null, supabase: state.supabase }),
}));
vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loadBestTimes: vi.fn() }),
}));
vi.mock("@apps/shared/api", () => ({
  CompetitionAPI: class {
    getUniqueCompetitionPlaces = vi.fn().mockResolvedValue([]);
  },
}));

import CompetitionTabModal from "@/components/forms/CompetitionTabModal";

const COMP_ID = "11111111-1111-4111-8111-111111111111";
const REC_ID = "22222222-2222-4222-8222-222222222222";
const PAST_DATE = "2020-01-01";

const STYLES: StyleOption[] = [
  { id: 4, nameJp: "200m自由形", distance: 200 },
  { id: 5, nameJp: "400m自由形", distance: 400 },
];

const DB_COMP = {
  date: PAST_DATE,
  end_date: null,
  title: "DB-TITLE",
  place: "DB-PLACE",
  pool_type: 1,
  note: "DB-COMP-NOTE",
};

const DB_RECORD = {
  id: REC_ID,
  style_id: 4,
  time: 120,
  is_relaying: false,
  note: "DB-NOTE",
  video_path: null,
  reaction_time: null,
};

function renderModal(options: { initialTab?: "competition" | "record"; create?: boolean } = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const editingData = options.create
    ? null
    : ({
        id: COMP_ID,
        type: "competition",
        date: PAST_DATE,
        title: "PROVISIONAL-TITLE",
        place: "PROVISIONAL-PLACE",
        pool_type: 1,
      } as EditingData);

  const ui = (styles: StyleOption[], isOpen = true) => (
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <CompetitionTabModal
        isOpen={isOpen}
        onClose={vi.fn()}
        onSave={onSave}
        selectedDate={new Date(PAST_DATE)}
        editingData={editingData}
        editingCompetitionId={options.create ? null : COMP_ID}
        styles={styles}
        isLoading={false}
        initialTab={options.initialTab ?? "record"}
      />
    </NextIntlClientProvider>
  );
  const view = render(ui(STYLES));
  return {
    onSave,
    rerenderWithNewStyles: () => view.rerender(ui([...STYLES])),
    rerenderOpen: (isOpen: boolean) => view.rerender(ui(STYLES, isOpen)),
  };
}

const overlay = () => screen.queryByTestId("competition-tab-modal-hydrating");
const busyRegion = () => document.querySelector('[aria-busy="true"]');

async function waitForPending(kind: Kind, n: number) {
  await waitFor(() => expect(state.pending[kind].length).toBeGreaterThanOrEqual(n));
}

async function resolvePending(kind: Kind, index: number, data: unknown, error: Result["error"] = null) {
  await act(async () => {
    const p = state.pending[kind][index]!;
    p.done = true;
    p.resolve({ data, error });
  });
}

async function rejectPending(kind: Kind, index: number) {
  await act(async () => {
    const p = state.pending[kind][index]!;
    p.done = true;
    p.reject(new Error("network"));
  });
}

/** まだ解決していない取得を、すべて指定データで解決する (再 fetch が走っていても全て返す) */
async function resolveAllOutstanding(data: { competitions?: unknown; entries?: unknown; records?: unknown } = {}) {
  const payloads: Record<Kind, unknown> = {
    competitions: data.competitions ?? DB_COMP,
    entries: data.entries ?? [],
    records: data.records ?? [DB_RECORD],
  };
  for (const kind of ["competitions", "entries", "records"] as Kind[]) {
    for (let i = 0; i < state.pending[kind].length; i++) {
      if (!state.pending[kind][i]!.done) await resolvePending(kind, i, payloads[kind]);
    }
  }
}

async function waitForInitialFetches() {
  await waitForPending("competitions", 1);
  await waitForPending("entries", 1);
  await waitForPending("records", 1);
}

async function hydrate() {
  await waitForInitialFetches();
  await resolveAllOutstanding();
  await waitFor(() => expect(overlay()).not.toBeInTheDocument());
}

/** 取得結果なし (失敗・0件) の既定行を、保存対象になる行 (種目+タイム+メモ) に編集する */
async function fillNewRecordRow(note: string) {
  fireEvent.click(await screen.findByTestId("record-style-distance-1-200"));
  fireEvent.click(screen.getByTestId("record-style-stroke-1-Fr"));
  fireEvent.change(screen.getByTestId("record-time-1"), { target: { value: "2:00.00" } });
  fireEvent.change(screen.getByTestId("record-note-1"), { target: { value: note } });
}

const totalFetches = () =>
  state.pending.competitions.length + state.pending.entries.length + state.pending.records.length;

async function saveAndGetPayload(onSave: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByTestId("competition-tab-modal-save"));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  return onSave.mock.calls[0]![0] as {
    basicData: { title: string; place: string; note: string };
    records: Array<{ id?: string; note: string; time: string }>;
    originalRecordIds: string[];
  };
}

describe("CompetitionTabModal: 読み込み中は入力不可 / 読み込み後の編集は巻き戻らない", () => {
  beforeEach(() => {
    for (const k of ["competitions", "entries", "records"] as Kind[]) state.pending[k].length = 0;
    state.supabase = createSupabaseMock();
    state.user = { id: "user-1" };
  });

  describe("(a)(b) 読み込み中の入力不可と、完了後の解除", () => {
    it("[a] 読み込み中は、role=status のオーバーレイが出て、本文 (inert 要素の外にオーバーレイ) が inert + aria-busy、保存ボタンが disabled", async () => {
      renderModal();
      await waitForInitialFetches();

      const el = overlay();
      expect(el).toBeInTheDocument();
      expect(el).toHaveAttribute("role", "status");
      expect(busyRegion()).not.toBeNull();
      expect(busyRegion()).toHaveAttribute("inert");
      // オーバーレイ自体は inert 領域の外にある (スクリーンリーダーに「読み込み中」が伝わる)
      expect(el!.closest("[inert]")).toBeNull();
      expect(screen.getByTestId("competition-tab-modal-save")).toBeDisabled();
    });

    it("[a-2] 3つの取得のうち1つでも未完了なら読み込み中のまま。全て終わると解除され DB 値が表示される", async () => {
      renderModal({ initialTab: "competition" });
      await waitForInitialFetches();

      await resolvePending("competitions", 0, DB_COMP);
      await resolvePending("entries", 0, []);
      expect(overlay()).toBeInTheDocument();
      expect(screen.getByTestId("competition-tab-modal-save")).toBeDisabled();

      await resolvePending("records", 0, [DB_RECORD]);
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());

      expect(busyRegion()).toBeNull();
      expect(document.querySelector("[inert]")).toBeNull();
      expect(screen.getByTestId("competition-tab-modal-save")).not.toBeDisabled();
      expect(screen.getByTestId("competition-tab-title")).toHaveValue("DB-TITLE");
      expect(screen.getByTestId("competition-tab-place")).toHaveValue("DB-PLACE");
    });

    it("[a-3] 読み込み中に保存ボタンを押しても onSave は呼ばれない", async () => {
      const { onSave } = renderModal();
      await waitForInitialFetches();

      fireEvent.click(screen.getByTestId("competition-tab-modal-save"));
      await act(async () => {});
      expect(onSave).not.toHaveBeenCalled();
    });

    it("[a-4] 読み込み完了後、レコードに DB 値が反映される", async () => {
      renderModal();
      await hydrate();

      await waitFor(() => expect(screen.getByTestId("record-note-1")).toHaveValue("DB-NOTE"));
    });
  });

  describe("(c) 読み込み後の編集が、再実行・遅延応答で上書きされない", () => {
    it("[c-1] 読み込み後に編集 → styles の参照が何度変わっても、タイトル・記録メモが残り、保存 payload に入る", async () => {
      const { onSave, rerenderWithNewStyles } = renderModal({ initialTab: "competition" });
      await hydrate();

      fireEvent.change(screen.getByTestId("competition-tab-title"), { target: { value: "USER-TITLE" } });
      fireEvent.click(screen.getByRole("tab", { name: "レースレコード" }));
      fireEvent.change(await screen.findByTestId("record-note-1"), { target: { value: "USER-NOTE" } });

      rerenderWithNewStyles();
      rerenderWithNewStyles();
      await resolveAllOutstanding();

      expect(screen.getByTestId("record-note-1")).toHaveValue("USER-NOTE");
      fireEvent.click(screen.getByRole("tab", { name: "大会" }));
      expect(screen.getByTestId("competition-tab-title")).toHaveValue("USER-TITLE");

      const payload = await saveAndGetPayload(onSave);
      expect(payload.basicData.title).toBe("USER-TITLE");
      expect(payload.records.some((r) => r.note === "USER-NOTE")).toBe(true);
      expect(payload.records.some((r) => r.note === "DB-NOTE")).toBe(false);
      // 既存レコードの diff (更新/削除) が壊れないよう、DB の既存レコード ID は保持されること
      expect(payload.originalRecordIds).toEqual([REC_ID]);
    });

    it("[c-2] 読み込み後に入力したメモが残る一方、入力していない場所は DB の実値のまま", async () => {
      const { onSave, rerenderWithNewStyles } = renderModal({ initialTab: "competition" });
      await hydrate();

      fireEvent.change(screen.getByTestId("competition-tab-note"), { target: { value: "USER-NOTE" } });
      rerenderWithNewStyles();
      await resolveAllOutstanding();

      expect(screen.getByTestId("competition-tab-place")).toHaveValue("DB-PLACE");
      const payload = await saveAndGetPayload(onSave);
      expect(payload.basicData.note).toBe("USER-NOTE");
      expect(payload.basicData.place).toBe("DB-PLACE");
    });
  });

  describe("(W1) 一度 settled になったら、開いている間は再 fetch しない (失敗・0件でも)", () => {
    it("[W1-1] 記録の取得が失敗 → 編集 → styles 参照変更 → 再 fetch は走らず、編集が残る", async () => {
      const { onSave, rerenderWithNewStyles } = renderModal();
      await waitForInitialFetches();
      await resolvePending("competitions", 0, DB_COMP);
      await resolvePending("entries", 0, []);
      await resolvePending("records", 0, null, { message: "boom" });
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());

      await fillNewRecordRow("USER-NOTE");
      const before = totalFetches();

      rerenderWithNewStyles();
      rerenderWithNewStyles();
      await act(async () => {});

      expect(totalFetches()).toBe(before);
      // 仮に再 fetch が走っていても返す (走っていないことが本命の assert)
      await resolveAllOutstanding();
      expect(screen.getByTestId("record-note-1")).toHaveValue("USER-NOTE");
      const payload = await saveAndGetPayload(onSave);
      expect(payload.records.some((r) => r.note === "USER-NOTE")).toBe(true);
    });

    it("[W1-2] 記録の取得が通信例外 (reject) → 編集 → styles 参照変更 → 再 fetch は走らない", async () => {
      const { rerenderWithNewStyles } = renderModal();
      await waitForInitialFetches();
      await resolvePending("competitions", 0, DB_COMP);
      await resolvePending("entries", 0, []);
      await rejectPending("records", 0);
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());

      fireEvent.change(await screen.findByTestId("record-note-1"), { target: { value: "USER-NOTE" } });
      const before = totalFetches();
      rerenderWithNewStyles();
      await act(async () => {});

      expect(totalFetches()).toBe(before);
      await resolveAllOutstanding();
      expect(screen.getByTestId("record-note-1")).toHaveValue("USER-NOTE");
    });

    it("[W1-3] 記録が0件の応答 → 編集 → styles 参照変更 → 再 fetch は走らず、編集が残る", async () => {
      const { onSave, rerenderWithNewStyles } = renderModal();
      await waitForInitialFetches();
      await resolvePending("competitions", 0, DB_COMP);
      await resolvePending("entries", 0, []);
      await resolvePending("records", 0, []);
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());

      await fillNewRecordRow("USER-NOTE");
      const before = totalFetches();
      rerenderWithNewStyles();
      rerenderWithNewStyles();
      await act(async () => {});

      expect(totalFetches()).toBe(before);
      // 仮に再 fetch が走っていて DB 値が返ってきても、編集は残らなければならない
      await resolveAllOutstanding();
      expect(screen.getByTestId("record-note-1")).toHaveValue("USER-NOTE");
      const payload = await saveAndGetPayload(onSave);
      expect(payload.records.some((r) => r.note === "USER-NOTE")).toBe(true);
    });
    it("[W1-4] 大会本体の取得が失敗 → 編集 → 再 fetch は走らず、編集が残る", async () => {
      const { onSave } = renderModal({ initialTab: "competition" });
      await waitForInitialFetches();
      await resolvePending("competitions", 0, null, { message: "boom" });
      await resolvePending("entries", 0, []);
      await resolvePending("records", 0, []);
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());

      fireEvent.change(screen.getByTestId("competition-tab-title"), { target: { value: "USER-TITLE" } });
      await act(async () => {});

      // 失敗後に自分自身の state 変化で再実行されても、大会本体を再取得しない
      expect(state.pending.competitions.length).toBe(1);
      expect(screen.getByTestId("competition-tab-title")).toHaveValue("USER-TITLE");

      // 大会本体が未解決のまま保存すると、保存時に1回だけ再取得してマージする (既存仕様)。
      // その応答が返っても、ユーザーが編集したタイトルが優先される
      fireEvent.click(screen.getByTestId("competition-tab-modal-save"));
      await waitFor(() => expect(state.pending.competitions.length).toBe(2));
      await resolvePending("competitions", 1, DB_COMP);
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      const payload = onSave.mock.calls[0]![0] as { basicData: { title: string } };
      expect(payload.basicData.title).toBe("USER-TITLE");
    });

    it("[W1-5] エントリーの取得が失敗・0件でも、settled 後にエントリーを再取得しない", async () => {
      renderModal({ initialTab: "competition" });
      await waitForInitialFetches();
      await resolvePending("competitions", 0, DB_COMP);
      await resolvePending("entries", 0, [], null);
      await resolvePending("records", 0, []);
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());
      await act(async () => {});

      expect(state.pending.entries.length).toBe(1);
      expect(state.pending.records.length).toBe(1);
    });
  });

  describe("(W2) 取得中に styles の参照が変わっても、取得中の fetch を cancel し直さない", () => {
    it("[W2] 取得中に styles 参照を何度変えても、最初の fetch の応答で settled になり、DB 値が反映され入力できる", async () => {
      const { onSave, rerenderWithNewStyles } = renderModal();
      await waitForInitialFetches();

      rerenderWithNewStyles();
      rerenderWithNewStyles();
      rerenderWithNewStyles();
      await act(async () => {});
      // 取得中の再実行で fetch が増えない
      expect(state.pending.records.length).toBe(1);
      expect(state.pending.entries.length).toBe(1);

      // 最初に発行した fetch (index 0) の応答だけで settled になる (cancel されていない)
      await resolvePending("competitions", 0, DB_COMP);
      await resolvePending("entries", 0, []);
      await resolvePending("records", 0, [DB_RECORD]);
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());

      await waitFor(() => expect(screen.getByTestId("record-note-1")).toHaveValue("DB-NOTE"));
      fireEvent.change(screen.getByTestId("record-note-1"), { target: { value: "USER-NOTE" } });
      const payload = await saveAndGetPayload(onSave);
      expect(payload.records.some((r) => r.note === "USER-NOTE")).toBe(true);
    });
  });

  describe("(X) 閉じて開き直したとき、前回の取得の遅延応答が今回の読み込みを終わらせない", () => {
    it("[X] 取得中に閉じ → 古い応答が全て返る → 開き直すと、新しい取得が終わるまで読み込み中のまま", async () => {
      const { rerenderOpen } = renderModal();
      await waitForInitialFetches();

      rerenderOpen(false);
      // 閉じた後に返る古い応答 (無視されなければならない)
      await resolvePending("competitions", 0, DB_COMP);
      await resolvePending("entries", 0, []);
      await resolvePending("records", 0, [DB_RECORD]);

      rerenderOpen(true);
      await waitForPending("competitions", 2);
      expect(overlay()).toBeInTheDocument();
      expect(screen.getByTestId("competition-tab-modal-save")).toBeDisabled();

      await resolveAllOutstanding();
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());
    });
  });

  describe("(d) 取得に失敗しても入力不可のまま固まらない", () => {
    it("[d-1] 3つ全ての取得がエラー応答でも、オーバーレイが消え、保存ボタンが有効になる", async () => {
      renderModal();
      await waitForInitialFetches();
      await resolvePending("competitions", 0, null, { message: "boom" });
      await resolvePending("entries", 0, null, { message: "boom" });
      await resolvePending("records", 0, null, { message: "boom" });

      await waitFor(() => expect(overlay()).not.toBeInTheDocument());
      expect(busyRegion()).toBeNull();
      expect(screen.getByTestId("competition-tab-modal-save")).not.toBeDisabled();
    });

    it("[d-2] 大会本体の取得が通信例外 (reject) でも、オーバーレイが消える", async () => {
      renderModal();
      await waitForInitialFetches();
      await rejectPending("competitions", 0);
      await resolvePending("entries", 0, []);
      await resolvePending("records", 0, []);

      await waitFor(() => expect(overlay()).not.toBeInTheDocument());
      expect(screen.getByTestId("competition-tab-modal-save")).not.toBeDisabled();
    });

    it("[d-3] エントリーの取得が通信例外 (reject) でも、オーバーレイが消える", async () => {
      renderModal();
      await waitForInitialFetches();
      await resolvePending("competitions", 0, DB_COMP);
      await rejectPending("entries", 0);
      await resolvePending("records", 0, []);

      await waitFor(() => expect(overlay()).not.toBeInTheDocument());
    });

    it("[d-4] user が null のときは、エントリー/レコードを取得せず settled 扱いになり、固まらない", async () => {
      state.user = null;
      renderModal();
      await waitForPending("competitions", 1);
      await resolvePending("competitions", 0, DB_COMP);

      await waitFor(() => expect(overlay()).not.toBeInTheDocument());
      expect(state.pending.entries.length).toBe(0);
      expect(state.pending.records.length).toBe(0);
    });
  });

  describe("新規作成モード", () => {
    it("[e] 新規作成 (編集対象なし) では読み込み表示が出ず、取得も走らず、保存ボタンが有効", async () => {
      renderModal({ create: true });

      expect(overlay()).not.toBeInTheDocument();
      expect(busyRegion()).toBeNull();
      expect(screen.getByTestId("competition-tab-modal-save")).not.toBeDisabled();
      expect(totalFetches()).toBe(0);
    });
  });
});
