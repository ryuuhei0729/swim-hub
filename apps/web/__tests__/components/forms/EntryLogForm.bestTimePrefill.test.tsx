/**
 * EntryLogForm — エントリータブ「ベストタイムを流用」ボタン (Sprint Contract v2)
 *
 * スコープ: Deliverable D2 (web-developer)。Sprint Contract §5 SC3 (ダッシュボードの
 * 「チームのお知らせ → エントリー未提出」リンク経由) に対応する。
 *
 * 裁定4 (Sprint Contract §2) の回帰確認がこのファイルの中核のひとつ:
 * `EntryLogForm.tsx` のローカル `getBestTimeForStyle` (4段階フォールバックの再実装) を
 * shared `getBestTimeForEntry` (`@/utils/bestTimeForEntry` 経由) に差し替えても、
 * バッジの表示文言・表示条件が変わらないこと (SC9) を確認する。
 *
 * 【QA 最優先事項1】web-developer の自己申告: `formatTimeDisplay` (=formatTimeShort、
 * 小数第1位) と `formatTimeBest` (小数第2位) が不統一。プリフィル直後は2桁表示だが、
 * ユーザーが何もせず blur すると `entryTimeDisplayValue` が undefined に落ち、表示が
 * 1桁にフォールバックする。CLAUDE.md はタイム表示を小数第2位と定めているため、
 * (a) 表示が本当に落ちるか (b) 保存される entryTime (DB へ渡る値) 自体が劣化するか、
 * の両方を実機並みに検証する。
 */

import React from "react";
import { renderWithI18n as render, screen, fireEvent, waitFor } from "../../utils/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import EntryLogForm from "@/components/forms/EntryLogForm";

interface BestTimeFixture {
  id: string;
  time: number;
  created_at: string;
  pool_type: number;
  is_relaying: boolean;
  style: { name_jp: string; distance: number };
  relayingTime?: { time: number };
}

const STYLES = [
  { id: "1", nameJp: "50m自由形", distance: 50 },
  { id: "2", nameJp: "50m平泳ぎ", distance: 50 },
];

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
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));

vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: currentBestTimes, loadBestTimes: vi.fn() }),
}));

function renderForm(
  opts: {
    bestTimes?: BestTimeFixture[];
    poolType?: number;
    onSubmit?: ReturnType<typeof vi.fn>;
  } = {},
) {
  currentBestTimes = opts.bestTimes ?? [];
  const onSubmit = opts.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <EntryLogForm
      isOpen={true}
      onClose={vi.fn()}
      onSubmit={onSubmit}
      onSkip={vi.fn()}
      competitionId="comp-1"
      poolType={opts.poolType ?? 0}
      styles={STYLES}
    />,
  );
  return { ...utils, onSubmit };
}

describe("EntryLogForm — ベストタイムを流用ボタン [W2]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentBestTimes = [];
  });

  it("[SC3] entryBestTime が存在する行で entry-best-time-prefill-1 を押すと、entry-time-1 の値が formatTimeBest(entryBestTime.time) と一致する", async () => {
    renderForm({ bestTimes: [makeBestTime({ time: 28.5 })] });

    const button = await screen.findByTestId("entry-best-time-prefill-1");
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    expect(screen.getByTestId("entry-time-1")).toHaveValue("28.50");
  });

  it("[SC5][境界: styleId 空] 種目未選択の行 (select を空値に変更) では entry-best-time-prefill-1 が disabled", async () => {
    renderForm({ bestTimes: [makeBestTime({ time: 28.5 })] });

    fireEvent.change(screen.getByTestId("entry-style-1"), { target: { value: "" } });

    const button = await screen.findByTestId("entry-best-time-prefill-1");
    expect(button).toBeDisabled();
  });

  it("[SC5][境界: ベストタイム0件] bestTimes=[] のとき entry-best-time-prefill-1 は disabled", async () => {
    renderForm({ bestTimes: [] });

    const button = await screen.findByTestId("entry-best-time-prefill-1");
    expect(button).toBeDisabled();
  });

  // 【裁定8 (Sprint Contract v3)】records.time は numeric(10,2) NOT NULL だが
  // CHECK(time > 0) が無いため time=0 の記録が DB 制約上排除されない。
  it("[裁定8][境界: ベストタイム time=0] bestTimes に time=0 の記録がある場合もボタンが disabled", async () => {
    renderForm({ bestTimes: [makeBestTime({ time: 0 })] });

    const button = await screen.findByTestId("entry-best-time-prefill-1");
    expect(button).toBeDisabled();
  });

  it("[SC6 中核][境界: 他水路のみ] 同水路の記録が無く他水路の非リレーのみ存在する fixture で、バッジの表示値と押下後の入力値が完全一致する", async () => {
    renderForm({ bestTimes: [makeBestTime({ time: 31.2, pool_type: 1 })], poolType: 0 });

    await screen.findByText("ベストタイム(長水路): 31.20");

    const button = screen.getByTestId("entry-best-time-prefill-1");
    fireEvent.click(button);
    expect(screen.getByTestId("entry-time-1")).toHaveValue("31.20");
  });

  it("[SC7] entry-best-time-prefill-1 押下直後は entry-prefill-warning-1 が表示され、entry-time-1 を書き換えると消える", async () => {
    renderForm({ bestTimes: [makeBestTime({ time: 28.5 })] });

    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-prefill-warning-1")).toHaveTextContent("ベストタイム自動入力");

    fireEvent.change(screen.getByTestId("entry-time-1"), { target: { value: "40.00" } });
    expect(screen.queryByTestId("entry-prefill-warning-1")).not.toBeInTheDocument();
  });

  it("[SC6 非可逆値での確認] time=68.04 (1ULPで非可逆な境界値) で、押下直後の表示値とバッジ値が厳密一致 (toBe。toBeCloseTo禁止) する", async () => {
    renderForm({ bestTimes: [makeBestTime({ time: 68.04 })] });

    await screen.findByText("ベストタイム: 1:08.04");

    fireEvent.click(screen.getByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-time-1")).toHaveValue("1:08.04");
  });

  // ---------------------------------------------------------------------------
  // 【PM 追加指示】mobile/web 非対称性の対照実験: web の handleApplyBestTime は entryTime を
  // 直接渡すため、blur を挟まなければ保存時に onSubmit へ渡る entryTime はバッジの生値と
  // 厳密一致するはず。toBeCloseTo は使わない (1 ULP の差は toBeCloseTo だと素通りするため)。
  // ---------------------------------------------------------------------------
  it("[裁定1/SC6 対照実験] 押下→(blurせず)保存しても、onSubmit に渡る entryTime はバッジの生値 68.04 と厳密一致する", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderForm({ bestTimes: [makeBestTime({ time: 68.04 })], onSubmit });

    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-time-1")).toHaveValue("1:08.04");

    fireEvent.click(screen.getByTestId("entry-submit-button"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submittedEntryTime = onSubmit.mock.calls[0]![0][0].entryTime as number;
    expect(submittedEntryTime).toBe(68.04);
  });

  it("[SC12/裁定2改訂(v2)・ラッチ実証] 押下→警告あり→1文字入力→警告消滅→プリフィル値と同じ文字列を打ち直す→警告は復活しない", async () => {
    renderForm({ bestTimes: [makeBestTime({ time: 28.5 })] });

    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-prefill-warning-1")).toBeInTheDocument();

    const input = screen.getByTestId("entry-time-1");
    fireEvent.change(input, { target: { value: "28.5X" } });
    expect(screen.queryByTestId("entry-prefill-warning-1")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "28.50" } });
    expect(screen.queryByTestId("entry-prefill-warning-1")).not.toBeInTheDocument();
  });

  it("[SC8/裁定2] 種目 (select) を変更すると entry-prefill-warning-1 が消える", async () => {
    renderForm({
      bestTimes: [
        makeBestTime({ id: "bt-fr", time: 28.5, style: { name_jp: "50m自由形", distance: 50 } }),
      ],
    });

    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-prefill-warning-1")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("entry-style-1"), { target: { value: "2" } });
    expect(screen.queryByTestId("entry-prefill-warning-1")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // [SC9 回帰・裁定4] shared getBestTimeForEntry への差し替え後も、バッジの表示文言・
  // 表示条件が旧ローカル実装 (getBestTimeForStyle) と同一であること。
  // 「同水路・リレーのみ (非リレー無し)」の組み合わせは、実データの形状 (useBestTimes の
  // 集約結果) では is_relaying=false のレコードにしか relayingTime が付与されないため、
  // isRelaying=false を固定で渡す EntryLogForm では旧実装・新実装のどちらでも到達不能
  // (旧実装の find 条件も同一の bt.relayingTime を見るため、この非到達性自体は差し替えで
  // 生まれた退行ではない)。よって実際に到達しうる3パターンで検証する。
  // 【実測根拠 (Reviewer 2周目指摘への回答)】apps/web/hooks/useBestTimes.ts を読んで確認済み:
  //   - L94-102 `bestTimesByStyleAndPool.set(key, { ..., is_relaying: false, ... })`:
  //     非リレーのベストタイムは is_relaying: false で Map に積まれる (relayingTime フィールドは無い)。
  //   - L123-130 `bestTimesByStyleAndPool.forEach((bestTime, key) => { const relayingTime =
  //     relayingBestTimesByStyleAndPool.get(key); result.push({ ...bestTime, relayingTime }); })`:
  //     relayingTime は「非リレーの行 (is_relaying: false)」にのみ後付けで結合される。
  //   - L132-173 `relayingBestTimesByStyleAndPool.forEach((relayingTime, key) => {
  //     if (!bestTimesByStyleAndPool.has(key)) { ...push({ ..., is_relaying: true, ... }) } })`:
  //     非リレーが存在しない場合のみ is_relaying: true の単独行を push するが、この push オブジェクトの
  //     フィールド一覧 (id/time/created_at/pool_type/is_relaying/note/style/competition) に
  //     relayingTime キーは含まれない (自分自身には付与されない)。
  //   → is_relaying: true のレコードが result 配列内で relayingTime を持つことは無い。
  //   `getBestTimeForEntry` (isRelaying=false) の tier2/tier4 が見る `samePool.relayingTime` /
  //   `otherPool.relayingTime` は、samePool/otherPool が is_relaying: true の行を指した時点で
  //   必ず undefined になるため、実データ形状の下では構造的に到達不能と確認できた。
  // ---------------------------------------------------------------------------
  it("[SC9 回帰・裁定4] 同水路・非リレーのベストタイムがあるとき、ラベルは「ベストタイム」", async () => {
    renderForm({ bestTimes: [makeBestTime({ time: 25.11, pool_type: 0, is_relaying: false })] });
    await screen.findByText("ベストタイム: 25.11");
  });

  it("[SC9 回帰・裁定4] 他水路・非リレーのみのとき、ラベルは水路に応じた「ベストタイム(長水路/短水路)」", async () => {
    renderForm({ bestTimes: [makeBestTime({ time: 40.2, pool_type: 1, is_relaying: false })], poolType: 0 });
    await screen.findByText("ベストタイム(長水路): 40.20");
  });

  // 【Info・QA注記】"同水路・リレーのみ" (tier2) と "他水路・リレーのみ" (tier4) のテストが
  // 無い理由は上記コメントブロック (実測根拠) の通り、実データ形状の下では構造的に到達不能なため。
  // この非到達性は旧ローカル実装 (getBestTimeForStyle) の find 条件も同一の `bt.relayingTime` を
  // 見ていたため、差し替え (裁定4) で新たに生まれた退行ではない (パリティは保たれている)。

  it("[境界: 複数エントリー行] 2行目の entry-best-time-prefill-2 を押しても1行目 (entry-time-1) の値は変化しない", async () => {
    renderForm({
      bestTimes: [
        makeBestTime({ id: "bt-fr", time: 28.5, style: { name_jp: "50m自由形", distance: 50 } }),
        makeBestTime({ id: "bt-br", time: 40.1, style: { name_jp: "50m平泳ぎ", distance: 50 } }),
      ],
    });

    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
    expect(screen.getByTestId("entry-time-1")).toHaveValue("28.50");

    fireEvent.click(screen.getByTestId("entry-add-button"));
    fireEvent.change(screen.getByTestId("entry-style-2"), { target: { value: "2" } });
    fireEvent.click(await screen.findByTestId("entry-best-time-prefill-2"));
    expect(screen.getByTestId("entry-time-2")).toHaveValue("40.10");

    expect(screen.getByTestId("entry-time-1")).toHaveValue("28.50");
  });

  // ---------------------------------------------------------------------------
  // 【QA 最優先事項1 → PM 裁定1 (Phase C) で期待値を修正】
  // Phase B 時点では blur 後に表示が "1:08.0" (1桁) へ劣化する挙動を確認していたが、
  // web-developer が formatTimeDisplay (=formatTimeShort) ラッパーを削除し、
  // フォールバック描画で直接 formatTimeBest を呼ぶ形に修正した。
  // CLAUDE.md の「タイム表示は分:秒.コンマ秒 = 小数第2位」に合わせ、
  // 「blur 後も小数第2位を維持すること」を仕様として検証する (修正後の正しい挙動)。
  // ---------------------------------------------------------------------------
  describe("[QA最優先-1→PM裁定1] プリフィル後 blur しても小数第2位表示を維持する", () => {
    it("(a) プリフィル直後は 2桁表示 (1:08.04)。何も編集せず blur しても 2桁表示 (1:08.04) を維持する", async () => {
      renderForm({ bestTimes: [makeBestTime({ time: 68.04 })] });

      fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
      const input = screen.getByTestId("entry-time-1");
      expect(input).toHaveValue("1:08.04");

      fireEvent.blur(input);

      // formatTimeDisplay (=formatTimeShort, 1桁) フォールバックの削除により、
      // entryTimeDisplayValue が undefined に落ちても formatTimeBest (2桁) で
      // 再描画される。CLAUDE.md の「タイム表示は小数第2位」を満たす。
      expect(input).toHaveValue("1:08.04");
    });

    // 【PM 裁定6 (Sprint Contract v3)】blur 後の onChange/onBlur は「表示文字列 →
    // parseTimeFlexible」の再パースを無条件に行う。これはプリフィル由来かどうかに関わらず
    // 全ての手入力にも等しく効くアプリ共通の挙動であり、プリフィル値だけを特別扱いして
    // 68.04 ちょうどに保とうとすると「流用した 1:08.04」と「手で打った 1:08.04」が
    // 別の数値になってしまい、今より不整合が増える。したがって直さない、というのが PM 裁定。
    // ここでは「blur 後の JS state が 68.04 と 1 ULP ずれうる」こと自体は仕様として許容し、
    // その代わり「DB へ渡る永続化値は一致する」こと (SC6 (b)) を検証する。
    // `records.time` は `numeric(10,2) NOT NULL`
    // (supabase/migrations/20251201014342_initial_schema.sql:764) であり、DB 書き込み時に
    // 小数第2位へ丸められるため、JS 側の 1 ULP 誤差の有無に関わらず永続化値は 68.04 になる。
    // `Math.round(x*100)/100` は「float の誤差だから緩める」ためではなく、
    // numeric(10,2) の丸めセマンティクスをテスト内で再現するためのものである
    // (push側の `onSubmit` に渡る entryTime 自体は JS 生値のままなので、DB 到達後の値を
    // ここでシミュレートして確認する)。blur を経由しない経路 (SC6 (a) 側) の
    // `toBe(68.04)` は厳密一致のまま維持する (このテストのすぐ上、(a) や他の押下直後テストを参照)。
    it("(b) blur 後に保存すると、onSubmit に渡る entryTime は JS state としては 1 ULP ずれうるが、numeric(10,2) 換算後の永続化値は 68.04 と一致する", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderForm({ bestTimes: [makeBestTime({ time: 68.04 })], onSubmit });

      fireEvent.click(await screen.findByTestId("entry-best-time-prefill-1"));
      fireEvent.blur(screen.getByTestId("entry-time-1"));

      fireEvent.click(screen.getByTestId("entry-submit-button"));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      const submittedEntryTime = onSubmit.mock.calls[0]![0][0].entryTime as number;
      // numeric(10,2) の丸め (小数第2位) を Math.round で再現し、DB 到達後の値が
      // 68.04 と一致することを確認する。
      expect(Math.round(submittedEntryTime * 100) / 100).toBe(68.04);
    });
  });
});
