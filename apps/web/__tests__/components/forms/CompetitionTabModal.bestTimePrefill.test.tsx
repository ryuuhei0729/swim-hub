/**
 * CompetitionTabModal — エントリータブ「ベストタイムを流用」ボタン (Sprint Contract v2)
 *
 * スコープ: Deliverable D1 (web-developer)。Sprint Contract §5 Success Criteria の
 * SC1 (チーム画面「エントリーを追加」経由)・SC2 (ダッシュボード日別詳細経由) は
 * どちらも同一の CompetitionTabModal コンポーネントに到達するため、コンポーネント単体では
 * 区別できない (到達経路そのものの実機検証は QA Phase B の Playwright で行う。
 * 本ファイルは「ボタンを押したときの振る舞い」のみを見る)。
 *
 * UI 契約 (Sprint Contract §4):
 * - ボタン: <button type="button">、data-testid: entry-best-time-prefill-<N>
 * - 未編集警告の data-testid: entry-prefill-warning-<N>
 * - ベストタイム未取得時もボタンは DOM に存在し disabled
 *
 * モック方針: `@/hooks/useBestTimes` をモックし、bestTimes 配列をテストごとに差し替える。
 * `renderWithI18n` で実際の ja.json 訳文を使い、完全一致で assert する。
 * editingCompetitionId は null (新規作成) にして D-1 の DB 再取得を経由させない。
 */

import React from "react";
import { renderWithI18n as render, screen, fireEvent, waitFor } from "../../utils/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StyleOption } from "@/components/forms/record-log/types";
import CompetitionTabModal from "@/components/forms/CompetitionTabModal";

// ---------------------------------------------------------------------------
// フィクスチャ
// ---------------------------------------------------------------------------
interface BestTimeFixture {
  id: string;
  time: number;
  created_at: string;
  pool_type: number;
  is_relaying: boolean;
  style: { name_jp: string; distance: number };
  relayingTime?: { time: number };
}

const STYLE_FREE_50: StyleOption = { id: 1, nameJp: "50m自由形", distance: 50 };
const STYLE_BREAST_50: StyleOption = { id: 8, nameJp: "50m平泳ぎ", distance: 50 };
const DEFAULT_STYLES = [STYLE_FREE_50, STYLE_BREAST_50];

const FUTURE_DATE = "2099-01-01"; // エントリータブが表示される未来日固定値

function makeBestTime(overrides: Partial<BestTimeFixture>): BestTimeFixture {
  return {
    id: "bt-1",
    time: 28.5,
    created_at: "2024-01-01T00:00:00Z",
    pool_type: 0,
    is_relaying: false,
    style: { name_jp: "50m自由形", distance: 50 },
    ...overrides,
  };
}

let currentBestTimes: BestTimeFixture[] = [];

vi.mock("@/contexts", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    subscription: null,
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })) })),
      })),
    },
  }),
}));

vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: currentBestTimes, loadBestTimes: vi.fn() }),
}));

vi.mock("@apps/shared/api", () => ({
  CompetitionAPI: class {
    getUniqueCompetitionPlaces = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock("@/components/forms/record-log/components/RecordLogEntry", () => ({
  default: () => <div data-testid="record-log-entry-stub" />,
}));

function renderModal(opts: { bestTimes?: BestTimeFixture[]; styles?: StyleOption[] } = {}) {
  currentBestTimes = opts.bestTimes ?? [];
  const onSave = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <CompetitionTabModal
      isOpen={true}
      onClose={vi.fn()}
      onSave={onSave}
      selectedDate={new Date(FUTURE_DATE)}
      editingData={null}
      editingCompetitionId={null}
      styles={opts.styles ?? DEFAULT_STYLES}
      isLoading={false}
      initialTab="entry"
    />,
  );
  return { ...utils, onSave };
}

describe("CompetitionTabModal — ベストタイムを流用ボタン [W1]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentBestTimes = [];
  });

  it("[SC1/SC2] entryBestTime が存在する行で entry-best-time-prefill-1 を押すと、entry-time-1 の値が formatTimeBest(entryBestTime.time) と一致する", async () => {
    renderModal({ bestTimes: [makeBestTime({ time: 28.5, pool_type: 0 })] });

    const button = await screen.findByTestId("entry-best-time-prefill-1");
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    expect(screen.getByTestId("entry-time-1")).toHaveValue("28.50");
  });

  it("[SC5][境界: styleId 空] 種目未選択の行では entry-best-time-prefill-1 が DOM に存在し disabled である", async () => {
    renderModal({ bestTimes: [makeBestTime({ time: 28.5 })], styles: [] });

    const button = await screen.findByTestId("entry-best-time-prefill-1");
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it("[SC5][境界: ベストタイム0件] bestTimes=[] のとき、バッジは表示されず、entry-best-time-prefill-1 は disabled である", async () => {
    renderModal({ bestTimes: [] });

    // バッジ文言は必ず "ベストタイム:" または "ベストタイム(" で始まる。
    // ボタン自体のラベル "ベストタイムを流用" と誤って一致しないよう先頭アンカーで絞る。
    expect(screen.queryByText(/^ベストタイム[:(]/)).not.toBeInTheDocument();
    const button = await screen.findByTestId("entry-best-time-prefill-1");
    expect(button).toBeDisabled();
  });

  // 【裁定8 (Sprint Contract v3)】records.time は numeric(10,2) NOT NULL だが
  // CHECK(time > 0) が無いため time=0 の記録が DB 制約上排除されない
  // (relay_records.total_time には CHECK があるが records.time には無い)。
  // entryBestTime が存在していても time<=0 ならボタンを disabled にする防御を検証する。
  it("[裁定8][境界: ベストタイム time=0] bestTimes に time=0 の記録がある場合もボタンが disabled", async () => {
    renderModal({ bestTimes: [makeBestTime({ time: 0 })] });

    const button = await screen.findByTestId("entry-best-time-prefill-1");
    expect(button).toBeDisabled();
  });

  it("[SC6 中核][境界: 他水路のみ] 同水路の記録が無く他水路の非リレーのみ存在する fixture で、バッジの表示値とボタン押下後の入力値が完全一致する", async () => {
    // basicData.poolType はデフォルト 0 (短水路)。記録は 1 (長水路) のみ。
    renderModal({ bestTimes: [makeBestTime({ time: 31.2, pool_type: 1 })] });

    // ラベルは「ベストタイム(長水路)」。部分文字列 toContain によるトートロジーを避け、完全一致で見る。
    await screen.findByText("ベストタイム(長水路): 31.20");

    const button = screen.getByTestId("entry-best-time-prefill-1");
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    expect(screen.getByTestId("entry-time-1")).toHaveValue("31.20");
  });

  it("[SC7] entry-best-time-prefill-1 押下直後は entry-prefill-warning-1 が表示される。その後 entry-time-1 を書き換えると消える", async () => {
    renderModal({ bestTimes: [makeBestTime({ time: 28.5 })] });

    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-prefill-warning-1")).toHaveTextContent("ベストタイム自動入力");

    fireEvent.change(screen.getByTestId("entry-time-1"), { target: { value: "40.00" } });
    expect(screen.queryByTestId("entry-prefill-warning-1")).not.toBeInTheDocument();
  });

  it("[SC6 非可逆値での確認] time=68.04 (formatTimeBest⇄parseTimeFlexible が1 ULP で非可逆になる境界値) で、押下直後の表示値とバッジ値が厳密一致 (toBeを使用、toBeCloseTo禁止) する", async () => {
    renderModal({ bestTimes: [makeBestTime({ time: 68.04, pool_type: 0 })] });

    await screen.findByText("ベストタイム: 1:08.04");

    fireEvent.click(screen.getByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-time-1")).toHaveValue("1:08.04");
  });

  it("[SC12/裁定2改訂(v2)・ラッチ実証] 押下→警告あり→1文字入力→警告消滅→プリフィル値と同じ文字列を打ち直す→警告は復活しない", async () => {
    renderModal({ bestTimes: [makeBestTime({ time: 28.5 })] });

    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-prefill-warning-1")).toBeInTheDocument();

    const input = screen.getByTestId("entry-time-1");
    fireEvent.change(input, { target: { value: "28.5X" } });
    expect(screen.queryByTestId("entry-prefill-warning-1")).not.toBeInTheDocument();

    // プリフィル直後の表示値と全く同じ文字列を打ち直す
    fireEvent.change(input, { target: { value: "28.50" } });
    expect(screen.queryByTestId("entry-prefill-warning-1")).not.toBeInTheDocument();
  });

  it("[SC8/裁定2] 種目を別の種目に変更すると entry-prefill-warning-1 が消える", async () => {
    renderModal({
      bestTimes: [
        makeBestTime({ time: 28.5, style: { name_jp: "50m自由形", distance: 50 } }),
      ],
    });

    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-prefill-warning-1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("entry-style-1-stroke-Br"));
    expect(screen.queryByTestId("entry-prefill-warning-1")).not.toBeInTheDocument();
  });

  it("[§6 境界 v2 新設: 水路切替] 押下後、水路を切り替えると entry-prefill-warning-1 が消える", async () => {
    renderModal({ bestTimes: [makeBestTime({ time: 28.5, pool_type: 0 })] });

    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-prefill-warning-1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("competition-tab-pool-type-1"));
    expect(screen.queryByTestId("entry-prefill-warning-1")).not.toBeInTheDocument();
  });

  it("[境界: リレー行] entry.isRelaying=true の行で流用ボタンを押すと、isRelaying=true 優先順位に従った値が入る", async () => {
    renderModal({
      bestTimes: [
        makeBestTime({
          time: 30,
          pool_type: 0,
          is_relaying: false,
          relayingTime: { time: 29 },
        }),
      ],
    });

    // リレートグルを ON にする
    fireEvent.click(await screen.findByTestId("entry-style-1-relay"));
    await waitFor(() => {
      expect(screen.getByTestId("entry-style-1-relay")).toHaveAttribute("aria-checked", "true");
    });

    // バッジは引き継ぎ優先で "ベストタイム(引継): 29.00" になっているはず
    await screen.findByText("ベストタイム(引継): 29.00");

    fireEvent.click(screen.getByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-time-1")).toHaveValue("29.00");
  });

  // ---------------------------------------------------------------------------
  // 【PM 裁定6 (Sprint Contract v3) / SC6 (a) (b)】CompetitionTabModal の
  // handleApplyBestTime は entryTime を直接渡すため、blur を挟まない限り entry.entryTime は
  // バッジの生値そのまま (再パースを経由しない)。ここでは「押下直後・blur 前の state」と
  // 「DB へ渡る永続化値」の両方が厳密一致することを、この1テストで確認する
  // (blur を挟まないので JS state と永続化値が両方とも 68.04 のまま一致するケース)。
  // blur を挟んだ場合の挙動 (JS state は 1 ULP ずれうるが永続化値は一致する) は
  // 別テストブロック「blur 経路」で検証する。toBeCloseTo は使わない
  // (1 ULP の差は toBeCloseTo だと素通りしてしまうため)。
  // ---------------------------------------------------------------------------
  it("[裁定1/SC6 (a)(b)] 押下→(blurせず)保存しても、onSave に渡る entryTime はバッジの生値 68.04 と厳密一致する", async () => {
    const { onSave } = renderModal({ bestTimes: [makeBestTime({ time: 68.04 })] });

    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-time-1")).toHaveValue("1:08.04");

    fireEvent.click(screen.getByTestId("competition-tab-modal-save"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const savedEntries = onSave.mock.calls[0]![0].entries as Array<{ entryTime: number }>;
    expect(savedEntries[0]!.entryTime).toBe(68.04);
  });

  // ---------------------------------------------------------------------------
  // 【PM 裁定6 (Sprint Contract v3) / Reviewer 指摘のカバレッジ穴】
  // W1 (CompetitionTabModal、チーム画面・ダッシュボード両経路が集約する最頻出画面) には
  // これまで blur を経由するテストが無かった。「プリフィル押下 → タイム欄を編集せず blur →
  // 保存」の経路を追加する。blur 時の onBlur は `parseTimeFlexible(表示文字列)` で
  // entryTime を再計算するため、JS state レベルでは 68.04 と 1 ULP ずれることがあるが
  // (PM 裁定6: 直さない。手入力にも等しく起きるアプリ共通の挙動のため)、
  // `records.time` は `numeric(10,2) NOT NULL`
  // (supabase/migrations/20251201014342_initial_schema.sql:764) なので、
  // DB へ渡る永続化値は丸められて 68.04 と一致する。ここでは onSave に渡る値を
  // numeric(10,2) の丸めセマンティクスで検証する (Math.round は「誤差を緩める」ためではなく
  // DB の丸めをテスト内で再現するためのもの)。
  // ---------------------------------------------------------------------------
  it("[裁定1/SC6 (b)・blur経路] 押下→タイム欄を編集せず blur→保存しても、onSave に渡る entryTime は numeric(10,2) 換算で 68.04 と一致する", async () => {
    const { onSave } = renderModal({ bestTimes: [makeBestTime({ time: 68.04 })] });

    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
    const input = screen.getByTestId("entry-time-1");
    expect(input).toHaveValue("1:08.04");

    fireEvent.blur(input);

    fireEvent.click(screen.getByTestId("competition-tab-modal-save"));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const savedEntries = onSave.mock.calls[0]![0].entries as Array<{ entryTime: number }>;
    // numeric(10,2) の丸め (小数第2位) を Math.round で再現し、DB 到達後の値が
    // 68.04 と一致することを確認する。
    expect(Math.round(savedEntries[0]!.entryTime * 100) / 100).toBe(68.04);
  });

  it("[境界: 複数エントリー行] 2行目に切り替えて entry-best-time-prefill-2 を押しても、1行目 (entry-time-1) の値は変化しない", async () => {
    // 2行目は追加時に defaultEntryStyleIdRef (styles[0] = 50m自由形) が自動セットされるため、
    // 1行目と種目が異なるベストタイム fixture を用意して、行ごとに別の値が入ることを確認する。
    renderModal({
      bestTimes: [
        makeBestTime({ id: "bt-fr", time: 28.5, style: { name_jp: "50m自由形", distance: 50 } }),
        makeBestTime({ id: "bt-br", time: 40.1, style: { name_jp: "50m平泳ぎ", distance: 50 } }),
      ],
    });

    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-time-1")).toHaveValue("28.50");

    fireEvent.click(screen.getByTestId("entry-add-button"));
    fireEvent.click(screen.getByTestId("entry-tab-2"));
    // 2行目 (デフォルト 50m自由形) を平泳ぎに変更してから流用する
    fireEvent.click(screen.getByTestId("entry-style-2-stroke-Br"));
    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-2"));
    expect(screen.getByTestId("entry-time-2")).toHaveValue("40.10");

    fireEvent.click(screen.getByTestId("entry-tab-1"));
    expect(screen.getByTestId("entry-time-1")).toHaveValue("28.50");
  });
});
