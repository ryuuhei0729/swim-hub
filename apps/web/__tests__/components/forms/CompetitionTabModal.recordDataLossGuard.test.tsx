/**
 * CompetitionTabModal — レースレコードのデータ消失ガード (web)
 *
 * 背景 (UI レビュー照合で見つかった実害):
 *   1. 保存時、既存レコードの DB ID を送信対象リストの「並び順」で注入していた。タイムが空で
 *      除外された行や × で消した行があると後ろの行の ID が1つずつずれ、別の記録の内容で
 *      上書きされたうえ末尾の記録が削除されていた。→ 各行の existingRecordId で対応付ける。
 *   2. 編集中に既存記録のタイムを消して保存すると、送信対象から外れて確認なしで削除されていた。
 *      → タイム以外の入力 (既存行を含む) があるのにタイムが空なら保存を止める。
 *   3. 途中スプリットを全部消しても DB に残っていた。→ 読み込み時にスプリットがあった記録 ID を
 *      originalSplitRecordIds として保存側へ渡す (保存側の書き戻しは useCompetitionTabSave のテスト)。
 *
 * 観測点: onSave に渡るペイロード (records の id と件数、originalRecordIds、
 * originalSplitRecordIds) と、保存が止まったときの表示。
 * モック構成は CompetitionTabModal.initFetchRaceEdit.test.tsx を土台に、取得を即時解決にしている。
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import type { EditingData } from "@/stores/types";
import type { StyleOption } from "@/components/forms/record-log/types";

type Result = { data: unknown; error: { message: string } | null };

const state = vi.hoisted(() => ({
  supabase: null as unknown,
  user: { id: "user-1" } as { id: string } | null,
  rows: {} as Record<string, unknown>,
}));

/** テーブルごとに state.rows の値を即時に返す (single() も同じ値) */
function createSupabaseMock() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "single", "in", "not", "limit"]) chain[m] = () => chain;
      chain.then = (onF: (v: Result) => unknown, onR?: (e: unknown) => unknown) =>
        Promise.resolve({ data: state.rows[table] ?? [], error: null }).then(onF, onR);
      return chain;
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
const REC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const REC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
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
  note: "",
};

/** 記録A: 200m 2:00.00、スプリット無し */
const RECORD_A = {
  id: REC_A,
  style_id: 4,
  time: 120,
  is_relaying: false,
  note: "NOTE-A",
  video_path: null,
  reaction_time: null,
};

/** 記録B: 400m 4:10.00、途中スプリット 200m 2:02.00 */
const RECORD_B = {
  id: REC_B,
  style_id: 5,
  time: 250,
  is_relaying: false,
  note: "NOTE-B",
  video_path: null,
  reaction_time: null,
};

function renderModal() {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const editingData = {
    id: COMP_ID,
    type: "competition",
    date: PAST_DATE,
    title: "DB-TITLE",
    place: "DB-PLACE",
    pool_type: 1,
  } as EditingData;
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <CompetitionTabModal
        isOpen
        onClose={vi.fn()}
        onSave={onSave}
        selectedDate={new Date(PAST_DATE)}
        editingData={editingData}
        editingCompetitionId={COMP_ID}
        styles={STYLES}
        isLoading={false}
        initialTab="record"
      />
    </NextIntlClientProvider>,
  );
  return { onSave };
}

async function waitForHydrated() {
  await waitFor(() =>
    expect(screen.queryByTestId("competition-tab-modal-hydrating")).not.toBeInTheDocument(),
  );
  await screen.findByDisplayValue("NOTE-A");
}

type SavePayload = {
  records: Array<{ id?: string; note: string; time: number }>;
  originalRecordIds: string[];
  originalSplitRecordIds: string[];
};

function save() {
  fireEvent.click(screen.getByTestId("competition-tab-modal-save"));
}

beforeEach(() => {
  state.supabase = createSupabaseMock();
  state.user = { id: "user-1" };
  state.rows = {
    competitions: DB_COMP,
    entries: [],
    records: [RECORD_A, RECORD_B],
    split_times: [{ record_id: REC_B, distance: 200, split_time: 122 }],
  };
});

describe("既存レコード ID の対応付け", () => {
  it("[W-RDL-1] 記録1を × で消して保存すると、記録2は自分の ID のまま送られ、記録1だけが削除対象になる", async () => {
    const { onSave } = renderModal();
    await waitForHydrated();

    fireEvent.click(screen.getByTestId("record-remove-1"));
    // 既存記録なので削除確認が出る
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    await screen.findByDisplayValue("NOTE-B");

    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0] as SavePayload;

    expect(payload.records).toHaveLength(1);
    expect(payload.records[0]).toMatchObject({ id: REC_B, note: "NOTE-B", time: 250 });
    expect(payload.originalRecordIds).toEqual([REC_A, REC_B]);
  });

  it("[W-RDL-2] 対照: 何も変えずに保存すると、各記録が自分の ID で送られる", async () => {
    const { onSave } = renderModal();
    await waitForHydrated();

    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0] as SavePayload;

    expect(payload.records.map((r) => [r.id, r.note])).toEqual([
      [REC_A, "NOTE-A"],
      [REC_B, "NOTE-B"],
    ]);
  });
});

describe("既存記録のタイムを消して保存", () => {
  it("[W-RDL-3] 保存を止めてタイム必須のエラーを出し、onSave を呼ばない", async () => {
    const { onSave } = renderModal();
    await waitForHydrated();

    fireEvent.change(screen.getByTestId("record-time-1"), { target: { value: "" } });
    save();

    expect(
      await screen.findByText("タイムを入力してください（形式: 分:秒.小数 または 秒.小数）"),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("[W-RDL-4] エラーの記録が表示中でなくても、その記録を開く", async () => {
    const { onSave } = renderModal();
    await waitForHydrated();

    fireEvent.change(screen.getByTestId("record-time-1"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("record-tab-2"));
    await screen.findByDisplayValue("NOTE-B");
    save();

    await screen.findByText("タイムを入力してください（形式: 分:秒.小数 または 秒.小数）");
    expect(screen.getByDisplayValue("NOTE-A")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("NOTE-B")).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("タイム必須エラーの表示", () => {
  it("[W-RDL-7] タイムを入れ直して保存すると、前回のエラー表示は消えて保存される", async () => {
    const { onSave } = renderModal();
    await waitForHydrated();

    fireEvent.change(screen.getByTestId("record-time-1"), { target: { value: "" } });
    save();
    await screen.findByText("タイムを入力してください（形式: 分:秒.小数 または 秒.小数）");

    fireEvent.change(screen.getByTestId("record-time-1"), { target: { value: "2:01.00" } });
    save();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText("タイムを入力してください（形式: 分:秒.小数 または 秒.小数）"),
    ).not.toBeInTheDocument();
  });
});

describe("タイム必須エラーの表示 (別の理由で止まったとき)", () => {
  it("[W-RDL-8] タイムを直したあと別の理由 (スプリットの形式エラー) で止まったら、古いタイム必須の表示は出さない", async () => {
    const { onSave } = renderModal();
    await waitForHydrated();

    fireEvent.change(screen.getByTestId("record-time-1"), { target: { value: "" } });
    save();
    await screen.findByText("タイムを入力してください（形式: 分:秒.小数 または 秒.小数）");

    fireEvent.change(screen.getByTestId("record-time-1"), { target: { value: "2:01.00" } });
    fireEvent.click(screen.getByTestId("record-tab-2"));
    fireEvent.change(await screen.findByTestId("record-split-time-2-1"), { target: { value: "abc" } });
    save();

    await waitFor(() =>
      expect(
        screen.queryByText("タイムを入力してください（形式: 分:秒.小数 または 秒.小数）"),
      ).not.toBeInTheDocument(),
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("最終地点のスプリット行 (タイムから自動で作る行)", () => {
  it("[W-RDL-9] タイムを消すと、古いタイムを表示していた最終地点の行も消える", async () => {
    renderModal();
    await waitForHydrated();
    const timeInput = screen.getByTestId("record-time-1") as HTMLInputElement;
    const shown = timeInput.value;
    // 前提: 読み込み時に最終地点 (200m) の行がタイムと同じ値で補完されている
    expect(screen.getAllByDisplayValue(shown)).toHaveLength(2);

    fireEvent.change(timeInput, { target: { value: "" } });

    expect(screen.queryAllByDisplayValue(shown)).toHaveLength(0);
  });

  it("[W-RDL-10] 入力途中の解釈できない値では最終地点の行を消さない (打鍵ごとに消えて出ない)", async () => {
    renderModal();
    await waitForHydrated();
    const timeInput = screen.getByTestId("record-time-1") as HTMLInputElement;
    const shown = timeInput.value;

    fireEvent.change(timeInput, { target: { value: "2:" } });

    expect(screen.getAllByDisplayValue(shown)).toHaveLength(1);
  });
});

describe("スプリットの書き戻し対象", () => {
  it("[W-RDL-5] 読み込み時に途中スプリットがあった記録の ID だけを originalSplitRecordIds で渡す", async () => {
    const { onSave } = renderModal();
    await waitForHydrated();

    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0] as SavePayload;
    expect(payload.originalSplitRecordIds).toEqual([REC_B]);
  });

  it("[W-RDL-6] ゴール地点 (種目距離と同じ距離) のスプリットしか無い記録は含めない", async () => {
    state.rows.split_times = [{ record_id: REC_A, distance: 200, split_time: 120 }];
    const { onSave } = renderModal();
    await waitForHydrated();

    save();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]![0] as SavePayload;
    expect(payload.originalSplitRecordIds).toEqual([]);
  });
});
