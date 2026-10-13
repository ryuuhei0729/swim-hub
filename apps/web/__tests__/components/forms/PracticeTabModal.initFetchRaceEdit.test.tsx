/**
 * PracticeTabModal — 編集モードの初期読み込み中は入力不可、読み込み後の編集は遅延応答で巻き戻らない
 *
 * 既知バグ (2026-09-29 QA 発見): 編集モードで開いた直後、既存練習ログを取得する初期化 fetch が
 * 返る前にユーザーが入力すると、遅れて返った応答が menus を DB 値で丸ごと上書きし、
 * 入力が無言で失われる。
 *
 * 仕様 (PM 裁定): 読み込みが終わるまでタブ本文を入力不可 (inert + 半透明オーバーレイ +
 * aria-busy)、保存ボタンは disabled。読み込み完了後はユーザーの編集を、deps 再実行による
 * 遅れた2本目の応答が上書きしてはならない。取得に失敗しても入力不可のまま固まらない。
 * 新規作成 (取得なし) では読み込み表示は出ない。
 *
 * 再現経路 (jsdom): supabase.from("practice_logs") の fetch を手で解決/拒否できる Promise にし、
 * availableTags の参照更新で effect を再実行して fetch を2本走らせる。
 * 注意: jsdom の fireEvent は inert を無視する (実ブラウザのキー入力遮断は e2e で確認する)。
 * そのためここでは inert 属性・オーバーレイ・保存ボタンの disabled を検証する。
 * RTL の render は StrictMode ではない。
 */

import { renderWithI18n as render, screen, fireEvent, waitFor, act } from "../../utils/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeTag } from "@apps/shared/types";

type FetchResult = { data: unknown[] | null; error: { message: string } | null };
type Pending = { resolve: (v: FetchResult) => void; reject: (e: unknown) => void };

const state = vi.hoisted(() => ({
  pendingLogFetches: [] as Array<{
    resolve: (v: { data: unknown[] | null; error: { message: string } | null }) => void;
    reject: (e: unknown) => void;
  }>,
  supabase: null as unknown,
}));

/** practice_logs の初期化 fetch だけ手動で解決/拒否。その他のクエリは即時に空で返す */
function createSupabaseMock() {
  const generic: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "not", "limit", "in", "gte", "lte", "is"]) {
    generic[m] = () => generic;
  }
  generic.then = (onF: (v: FetchResult) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onF, onR);

  const logsChain = {
    select: () => logsChain,
    eq: () => logsChain,
    order: () => logsChain,
    then: (onF: (v: FetchResult) => unknown, onR?: (e: unknown) => unknown) =>
      new Promise<FetchResult>((resolve, reject) => {
        state.pendingLogFetches.push({ resolve, reject } as Pending);
      }).then(onF, onR),
  };

  return {
    from: (table: string) => (table === "practice_logs" ? logsChain : generic),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  };
}

vi.mock("@/contexts", () => ({
  useAuth: () => ({ subscription: null, supabase: state.supabase }),
}));

vi.mock("@swim-hub/shared/hooks", () => ({
  useCreatePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/practice-log-templates/PracticeLogTemplateSelectModal", () => ({
  PracticeLogTemplateSelectModal: () => null,
}));

import PracticeTabModal from "@/components/forms/PracticeTabModal";

const PRACTICE_ID = "11111111-1111-4111-8111-111111111111";
const DB_LOG_ID = "22222222-2222-4222-8222-222222222222";
const TIMESTAMP = "2026-10-04T00:00:00.000Z";
const TAG_A: PracticeTag = {
  id: "33333333-3333-4333-8333-333333333333",
  user_id: "user-1",
  name: "AN",
  color: "#3B82F6",
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
};
const TAG_B: PracticeTag = {
  id: "44444444-4444-4444-8444-444444444444",
  user_id: "user-1",
  name: "EN",
  color: "#86efac",
  created_at: TIMESTAMP,
  updated_at: TIMESTAMP,
};

const DB_ROW = {
  id: DB_LOG_ID,
  style: "Fr",
  swim_category: "Swim",
  distance: 50,
  rep_count: 2,
  set_count: 1,
  circle: 0,
  note: "DB-NOTE",
  video_path: null,
  video_thumbnail_path: null,
  practice_log_tags: [],
  practice_times: [],
};

const EDITING_DATA = {
  id: PRACTICE_ID,
  type: "practice",
  date: "2026-10-04",
  title: "title",
  place: "place",
  note: "",
};

function renderModal(options: { availableTags?: PracticeTag[]; create?: boolean } = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSave,
    selectedDate: new Date("2026-10-04"),
    editingData: (options.create ? null : EDITING_DATA) as never,
    editingPracticeId: options.create ? null : PRACTICE_ID,
    setAvailableTags: vi.fn(),
    isLoading: false,
    initialTab: "practiceLog" as const,
  };
  const view = render(
    <PracticeTabModal {...baseProps} availableTags={options.availableTags ?? [TAG_A, TAG_B]} />,
  );
  return {
    onSave,
    rerenderOpen: (isOpen: boolean) =>
      view.rerender(
        <PracticeTabModal
          {...baseProps}
          isOpen={isOpen}
          availableTags={options.availableTags ?? [TAG_A, TAG_B]}
        />,
      ),
    rerenderWithTags: (tags: PracticeTag[]) =>
      view.rerender(<PracticeTabModal {...baseProps} availableTags={tags} />),
  };
}

const overlay = () => screen.queryByTestId("practice-tab-modal-hydrating");
const busyRegion = () => document.querySelector('[aria-busy="true"]');

async function waitForFetches(n: number) {
  await waitFor(() => expect(state.pendingLogFetches.length).toBeGreaterThanOrEqual(n));
}

async function resolveFetch(index: number, result: FetchResult = { data: [DB_ROW], error: null }) {
  resolvedIdx.add(index);
  await act(async () => {
    state.pendingLogFetches[index]!.resolve(result);
  });
}

/** まだ解決していない取得をすべて DB 値で解決する (再 fetch が走っていても全て返す) */
const resolvedIdx = new Set<number>();
async function resolveOutstanding() {
  for (let i = 0; i < state.pendingLogFetches.length; i++) {
    if (!resolvedIdx.has(i)) await resolveFetch(i);
  }
}

async function hydrate() {
  await waitForFetches(1);
  await resolveFetch(0);
  await waitFor(() => expect(overlay()).not.toBeInTheDocument());
}

async function saveAndGetPayload(onSave: ReturnType<typeof vi.fn>) {
  fireEvent.click(screen.getByTestId("practice-tab-modal-save"));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  return onSave.mock.calls[0]![0] as {
    logs: Array<{ note: string; reps: number; tags: Array<{ id: string }>; times: Array<{ time: number }> }>;
    originalLogIds: string[];
  };
}

describe("PracticeTabModal: 読み込み中は入力不可 / 読み込み後の編集は遅延応答で巻き戻らない", () => {
  beforeEach(() => {
    state.pendingLogFetches.length = 0;
    resolvedIdx.clear();
    state.supabase = createSupabaseMock();
  });

  describe("(a)(b) 読み込み中の入力不可と、完了後の解除", () => {
    it("[a] 読み込み中は、オーバーレイが出て、本文が inert + aria-busy になり、保存ボタンが disabled", async () => {
      renderModal();
      await waitForFetches(1);

      expect(overlay()).toBeInTheDocument();
      expect(busyRegion()).not.toBeNull();
      expect(busyRegion()).toHaveAttribute("inert");
      expect(screen.getByTestId("practice-tab-modal-save")).toBeDisabled();
    });

    it("[b] 読み込みが完了すると、オーバーレイ・inert・aria-busy が解除され、保存ボタンが有効になり DB 値が表示される", async () => {
      renderModal();
      await hydrate();

      expect(overlay()).not.toBeInTheDocument();
      expect(busyRegion()).toBeNull();
      expect(document.querySelector("[inert]")).toBeNull();
      expect(screen.getByTestId("practice-tab-modal-save")).not.toBeDisabled();
      expect(screen.getByTestId("practice-log-note-1")).toHaveValue("DB-NOTE");
      expect(screen.getByTestId("practice-rep-count")).toHaveValue(2);
    });

    it("[a-2] 読み込み中に保存ボタンを押しても onSave は呼ばれない", async () => {
      const { onSave } = renderModal();
      await waitForFetches(1);

      fireEvent.click(screen.getByTestId("practice-tab-modal-save"));
      await act(async () => {});
      expect(onSave).not.toHaveBeenCalled();
    });

    it("[a-3] オーバーレイは role=status で、inert 領域の外にある", async () => {
      renderModal();
      await waitForFetches(1);

      const el = overlay();
      expect(el).toHaveAttribute("role", "status");
      expect(el!.closest("[inert]")).toBeNull();
    });
  });

  describe("(c) 読み込み後の編集が、再実行・遅延応答で上書きされない", () => {
    it("[c-1] 読み込み後に編集 → availableTags の参照が何度変わっても、メモ・本数が残り、保存 payload に入る", async () => {
      const { onSave, rerenderWithTags } = renderModal({ availableTags: [] });
      await hydrate();

      fireEvent.change(screen.getByTestId("practice-log-note-1"), { target: { value: "USER-NOTE" } });
      fireEvent.change(screen.getByTestId("practice-rep-count"), { target: { value: "7" } });

      rerenderWithTags([TAG_A]);
      rerenderWithTags([TAG_A, TAG_B]);
      await resolveOutstanding();

      expect(screen.getByTestId("practice-log-note-1")).toHaveValue("USER-NOTE");
      expect(screen.getByTestId("practice-rep-count")).toHaveValue(7);
      const payload = await saveAndGetPayload(onSave);
      expect(payload.logs.some((l) => l.note === "USER-NOTE" && l.reps === 7)).toBe(true);
      expect(payload.logs.some((l) => l.note === "DB-NOTE")).toBe(false);
      // 既存ログの diff 計算 (更新/削除) が壊れないよう、DB の既存ログ ID は保持されること
      expect(payload.originalLogIds).toEqual([DB_LOG_ID]);
    });

    it("[c-3] 読み込み後に選択したタグが、再実行・遅延応答のあとも残り、保存 payload に入る", async () => {
      const { onSave, rerenderWithTags } = renderModal({ availableTags: [] });
      await waitForFetches(1);
      rerenderWithTags([TAG_A, TAG_B]);
      await resolveOutstanding();
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());

      fireEvent.focus(screen.getByTestId("tag-input"));
      fireEvent.click(await screen.findByTestId(`tag-row-${TAG_B.id}`));
      await waitFor(() => expect(screen.getByTestId(`selected-tag-${TAG_B.id}`)).toBeInTheDocument());

      rerenderWithTags([TAG_B, TAG_A]);
      await resolveOutstanding();

      expect(screen.getByTestId(`selected-tag-${TAG_B.id}`)).toBeInTheDocument();
      const payload = await saveAndGetPayload(onSave);
      expect(payload.logs.some((l) => l.tags.some((t) => t.id === TAG_B.id))).toBe(true);
    });

    it("[c-4] 読み込み後に入力したタイムが、再実行・遅延応答のあとも残り、保存 payload に入る", async () => {
      const { onSave, rerenderWithTags } = renderModal({ availableTags: [] });
      await waitForFetches(1);
      rerenderWithTags([TAG_A, TAG_B]);
      await resolveOutstanding();
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());

      fireEvent.click(screen.getByTestId("time-input-button"));
      const timeInput = await screen.findByTestId("time-input-1-1");
      fireEvent.change(timeInput, { target: { value: "1:23.45" } });
      fireEvent.blur(timeInput);
      fireEvent.click(screen.getByTestId("save-times-button"));
      await waitFor(() => expect(screen.queryByTestId("time-input-modal")).not.toBeInTheDocument());

      rerenderWithTags([TAG_A]);
      await resolveOutstanding();

      const payload = await saveAndGetPayload(onSave);
      expect(payload.logs.some((l) => l.times.some((t) => Math.abs(t.time - 83.45) < 0.005))).toBe(true);
    });
  });

  describe("(W1) 一度 settled になったら、開いている間は再 fetch しない (失敗・0件・例外でも)", () => {
    it("[W1-1] 取得がエラー応答 → 編集 → availableTags 参照変更 → 再 fetch は走らず、編集が残る", async () => {
      const { onSave, rerenderWithTags } = renderModal({ availableTags: [] });
      await waitForFetches(1);
      await resolveFetch(0, { data: null, error: { message: "boom" } });
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());

      fireEvent.change(screen.getByTestId("practice-log-note-1"), { target: { value: "USER-NOTE" } });
      const before = state.pendingLogFetches.length;
      rerenderWithTags([TAG_A]);
      rerenderWithTags([TAG_A, TAG_B]);
      await act(async () => {});

      expect(state.pendingLogFetches.length).toBe(before);
      // 仮に再 fetch が走っていて DB 値が返ってきても、編集は残らなければならない
      await resolveOutstanding();
      expect(screen.getByTestId("practice-log-note-1")).toHaveValue("USER-NOTE");
      const payload = await saveAndGetPayload(onSave);
      expect(payload.logs.some((l) => l.note === "USER-NOTE")).toBe(true);
    });

    it("[W1-2] 取得が通信例外 (reject) → 編集 → availableTags 参照変更 → 再 fetch は走らない", async () => {
      const { rerenderWithTags } = renderModal({ availableTags: [] });
      await waitForFetches(1);
      await act(async () => {
        state.pendingLogFetches[0]!.reject(new Error("network"));
      });
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());

      fireEvent.change(screen.getByTestId("practice-log-note-1"), { target: { value: "USER-NOTE" } });
      const before = state.pendingLogFetches.length;
      rerenderWithTags([TAG_A, TAG_B]);
      await act(async () => {});

      expect(state.pendingLogFetches.length).toBe(before);
      await resolveOutstanding();
      expect(screen.getByTestId("practice-log-note-1")).toHaveValue("USER-NOTE");
    });

    it("[W1-3] 既存ログが0件の応答 → 編集 → availableTags 参照変更 → 再 fetch は走らず、編集が残る", async () => {
      const { onSave, rerenderWithTags } = renderModal({ availableTags: [] });
      await waitForFetches(1);
      await resolveFetch(0, { data: [], error: null });
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());

      fireEvent.change(screen.getByTestId("practice-log-note-1"), { target: { value: "USER-NOTE" } });
      const before = state.pendingLogFetches.length;
      rerenderWithTags([TAG_A]);
      rerenderWithTags([TAG_A, TAG_B]);
      await act(async () => {});

      expect(state.pendingLogFetches.length).toBe(before);
      await resolveOutstanding();
      expect(screen.getByTestId("practice-log-note-1")).toHaveValue("USER-NOTE");
      const payload = await saveAndGetPayload(onSave);
      expect(payload.logs.some((l) => l.note === "USER-NOTE")).toBe(true);
    });
  });

  describe("(W2) 取得中に availableTags の参照が変わっても、取得中の fetch を cancel し直さない", () => {
    it("[W2] 取得中に参照を何度変えても、fetch は1本のまま、最初の応答で settled になり DB 値が反映され入力できる", async () => {
      const { onSave, rerenderWithTags } = renderModal({ availableTags: [] });
      await waitForFetches(1);

      rerenderWithTags([TAG_A]);
      rerenderWithTags([TAG_A, TAG_B]);
      rerenderWithTags([TAG_B]);
      await act(async () => {});
      expect(state.pendingLogFetches.length).toBe(1);
      expect(overlay()).toBeInTheDocument();

      await resolveFetch(0);
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());
      expect(screen.getByTestId("practice-log-note-1")).toHaveValue("DB-NOTE");

      fireEvent.change(screen.getByTestId("practice-log-note-1"), { target: { value: "USER-NOTE" } });
      const payload = await saveAndGetPayload(onSave);
      expect(payload.logs.some((l) => l.note === "USER-NOTE")).toBe(true);
    });
  });

  describe("(X) 閉じて開き直したとき、前回の取得の遅延応答が今回の読み込みを終わらせない", () => {
    it("[X] 取得中に閉じ → 古い応答が返る → 開き直すと、新しい取得が終わるまで読み込み中のまま", async () => {
      const { rerenderOpen } = renderModal();
      await waitForFetches(1);

      rerenderOpen(false);
      await resolveFetch(0); // 閉じた後に返る古い応答 (無視されなければならない)

      rerenderOpen(true);
      await waitForFetches(2);
      expect(overlay()).toBeInTheDocument();
      expect(screen.getByTestId("practice-tab-modal-save")).toBeDisabled();

      await resolveFetch(1);
      await waitFor(() => expect(overlay()).not.toBeInTheDocument());
    });
  });

  describe("(W3) 取得結果の処理中に例外が起きても固まらない", () => {
    it("[W3] 応答の処理で例外 (不正な行) が起きても、オーバーレイが消える", async () => {
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      try {
        renderModal();
        await waitForFetches(1);
        // 行が null だと row.id の参照で TypeError になる
        await resolveFetch(0, { data: [null], error: null });

        await waitFor(() => expect(overlay()).not.toBeInTheDocument());
        expect(screen.getByTestId("practice-tab-modal-save")).not.toBeDisabled();
      } finally {
        process.off("unhandledRejection", unhandled);
      }
    });
  });

  describe("(d) 取得に失敗しても入力不可のまま固まらない", () => {
    it("[d-1] 取得がエラー応答でも、オーバーレイが消え、保存ボタンが有効になり、既定のメニューを編集して保存できる", async () => {
      const { onSave } = renderModal();
      await waitForFetches(1);
      await resolveFetch(0, { data: null, error: { message: "boom" } });

      await waitFor(() => expect(overlay()).not.toBeInTheDocument());
      expect(busyRegion()).toBeNull();
      expect(screen.getByTestId("practice-tab-modal-save")).not.toBeDisabled();

      fireEvent.change(screen.getByTestId("practice-log-note-1"), { target: { value: "USER-NOTE" } });
      const payload = await saveAndGetPayload(onSave);
      expect(payload.logs.some((l) => l.note === "USER-NOTE")).toBe(true);
    });

    it("[d-2] 取得が通信例外 (reject) でも、オーバーレイが消える", async () => {
      renderModal();
      await waitForFetches(1);
      await act(async () => {
        state.pendingLogFetches[0]!.reject(new Error("network"));
      });

      await waitFor(() => expect(overlay()).not.toBeInTheDocument());
      expect(screen.getByTestId("practice-tab-modal-save")).not.toBeDisabled();
    });

    it("[d-3] 既存ログが0件の応答でも、オーバーレイが消える", async () => {
      renderModal();
      await waitForFetches(1);
      await resolveFetch(0, { data: [], error: null });

      await waitFor(() => expect(overlay()).not.toBeInTheDocument());
      expect(screen.getByTestId("practice-tab-modal-save")).not.toBeDisabled();
    });
  });

  describe("新規作成モード", () => {
    it("[e] 新規作成 (編集対象なし) では読み込み表示が出ず、入力・保存できる", async () => {
      renderModal({ create: true });

      expect(overlay()).not.toBeInTheDocument();
      expect(busyRegion()).toBeNull();
      expect(screen.getByTestId("practice-tab-modal-save")).not.toBeDisabled();
      expect(state.pendingLogFetches.length).toBe(0);
    });
  });
});
