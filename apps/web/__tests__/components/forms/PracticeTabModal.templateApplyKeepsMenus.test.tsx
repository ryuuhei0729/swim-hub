/**
 * PracticeTabModal (web) — 「テンプレートから作成」と × のデータ消失ガード
 *
 * 背景 (UI レビュー照合で見つかった実害):
 *   - 「テンプレートから作成」は各メニューカードの中にあるのに、全メニューをテンプレート1件で
 *     置き換えていた。入力済みのタイムや他のメニューが確認なしで消え、編集中なら保存時に既存ログが
 *     DB から削除されていた。
 *   - メニューサブタブの × が確認なしで即削除していた。
 *
 * 期待: テンプレートは表示中のメニュー1件の設定欄だけを上書きし、タイム・既存ログ ID・他のメニュー
 * は残す (mobile PracticeTabFormScreen と同じ)。
 *
 * 観測点: onSave に渡る logs (tempMenuId = メニュー ID。既存ログは DB の id) と originalLogIds。
 * モック構成は PracticeTabModal.initFetchRaceEdit.test.tsx を土台に、practice_logs の取得を即時解決に
 * し、テンプレート選択モーダルを「押すと onSelect(TEMPLATE) する」ボタンに差し替えている。
 */

import { renderWithI18n as render, screen, fireEvent, waitFor } from "../../utils/render";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  supabase: null as unknown,
  logRows: [] as unknown[],
}));

/** practice_logs は state.logRows、それ以外は空配列を即時に返す (テーブルごとに別の chain) */
function createSupabaseMock() {
  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "not", "limit", "in", "gte", "lte", "is"]) {
      chain[m] = () => chain;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve({ data: table === "practice_logs" ? state.logRows : [], error: null }).then(
        onF,
        onR,
      );
    return chain;
  };
  return {
    from: (table: string) => makeChain(table),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  };
}

const TEMPLATE = {
  id: "tpl-6601",
  user_id: "user-1",
  name: "テンプレ6601",
  style: "Br",
  swim_category: "Kick" as const,
  distance: 25,
  rep_count: 8,
  set_count: 2,
  circle: 60,
  note: "TPL-NOTE-6601",
  tag_ids: [],
  is_favorite: false,
  use_count: 0,
  last_used_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

vi.mock("@/contexts", () => ({
  useAuth: () => ({ subscription: null, supabase: state.supabase }),
}));
vi.mock("@swim-hub/shared/hooks", () => ({
  useCreatePracticeLogTemplateMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/components/practice-log-templates/PracticeLogTemplateSelectModal", () => ({
  PracticeLogTemplateSelectModal: ({
    isOpen,
    onSelect,
    onClose,
  }: {
    isOpen: boolean;
    onSelect: (t: typeof TEMPLATE) => void;
    onClose: () => void;
  }) =>
    isOpen ? (
      <button
        type="button"
        onClick={() => {
          onSelect(TEMPLATE);
          onClose();
        }}
      >
        テンプレートを選ぶ
      </button>
    ) : null,
}));

import PracticeTabModal from "@/components/forms/PracticeTabModal";

const PRACTICE_ID = "11111111-1111-4111-8111-111111111111";
const LOG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const LOG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

function logRow(id: string, note: string, distance: number, times: Array<{ time: number; rep: number }> = []) {
  return {
    id,
    style: "Fr",
    swim_category: "Swim",
    distance,
    rep_count: 2,
    set_count: 1,
    circle: 90,
    note,
    video_path: null,
    video_thumbnail_path: null,
    practice_log_tags: [],
    practice_times: times.map((t) => ({
      id: `${id}-t${t.rep}`,
      set_number: 1,
      rep_number: t.rep,
      time: t.time,
    })),
  };
}

function renderModal() {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <PracticeTabModal
      isOpen
      onClose={vi.fn()}
      onSave={onSave}
      selectedDate={new Date("2026-10-04")}
      editingData={
        {
          id: PRACTICE_ID,
          type: "practice",
          date: "2026-10-04",
          title: "title",
          place: "place",
          note: "",
        } as never
      }
      editingPracticeId={PRACTICE_ID}
      setAvailableTags={vi.fn()}
      isLoading={false}
      initialTab="practiceLog"
      availableTags={[]}
    />,
  );
  return { onSave };
}

type Payload = {
  logs: Array<{
    tempMenuId?: string;
    style: string;
    swimCategory: string;
    distance: number;
    reps: number;
    sets: number;
    circleTime: number | null;
    note: string;
    times: Array<{ time: number }>;
  }>;
  originalLogIds: string[];
};

async function hydrate() {
  await waitFor(() =>
    expect(screen.queryByTestId("practice-tab-modal-hydrating")).not.toBeInTheDocument(),
  );
  await screen.findByTestId("practicelog-tab-2");
}

async function save(onSave: ReturnType<typeof vi.fn>): Promise<Payload> {
  fireEvent.click(screen.getByTestId("practice-tab-modal-save"));
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  return onSave.mock.calls[0]![0] as Payload;
}

beforeEach(() => {
  state.supabase = createSupabaseMock();
  state.logRows = [
    logRow(LOG_A, "ALPHA-NOTE", 100, [
      { time: 75.1, rep: 1 },
      { time: 76.2, rep: 2 },
    ]),
    logRow(LOG_B, "BRAVO-NOTE", 200),
  ];
});

describe("「テンプレートから作成」は表示中のメニューだけに適用する (web)", () => {
  it("[W-TPL-1] メニュー2に適用して保存: 両方の既存ログが残り、メニュー2の設定だけがテンプレートになる", async () => {
    const { onSave } = renderModal();
    await hydrate();

    fireEvent.click(screen.getByTestId("practicelog-tab-2"));
    fireEvent.click(screen.getByText("テンプレートから作成"));
    fireEvent.click(await screen.findByText("テンプレートを選ぶ"));

    // メニュー1 のタブは残っている (以前はテンプレート1件に置き換わっていた)
    expect(screen.getByTestId("practicelog-tab-1")).toBeInTheDocument();

    const payload = await save(onSave);
    expect(payload.originalLogIds).toEqual([LOG_A, LOG_B]);
    expect(payload.logs.map((l) => l.tempMenuId)).toEqual([LOG_A, LOG_B]);
    expect(payload.logs[0]).toMatchObject({ style: "Fr", distance: 100, note: "ALPHA-NOTE" });
    expect(payload.logs[0]!.times.map((t) => t.time)).toEqual([75.1, 76.2]);
    expect(payload.logs[1]).toMatchObject({
      style: "Br",
      swimCategory: "Kick",
      distance: 25,
      reps: 8,
      sets: 2,
      circleTime: 60,
      note: "TPL-NOTE-6601",
    });
  });

  it("[W-TPL-2] タイムのあるメニュー1に適用しても、タイムは消えない", async () => {
    const { onSave } = renderModal();
    await hydrate();

    fireEvent.click(screen.getByText("テンプレートから作成"));
    fireEvent.click(await screen.findByText("テンプレートを選ぶ"));

    const payload = await save(onSave);
    expect(payload.logs.map((l) => l.tempMenuId)).toEqual([LOG_A, LOG_B]);
    expect(payload.logs[0]).toMatchObject({ style: "Br", distance: 25 });
    expect(payload.logs[0]!.times.map((t) => t.time)).toEqual([75.1, 76.2]);
  });
});

describe("メニューサブタブの × (web)", () => {
  it("[W-TPL-3] 既存ログのメニューの × は確認を出し、キャンセルすれば消えない", async () => {
    const { onSave } = renderModal();
    await hydrate();

    fireEvent.click(screen.getByTestId("practicelog-remove-2"));
    expect(screen.getByText("メニュー 2を削除しますか？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    const payload = await save(onSave);
    expect(payload.logs.map((l) => l.tempMenuId)).toEqual([LOG_A, LOG_B]);
  });
});
