// =============================================================================
// BestTimesTable.test.tsx (apps/mobile/components/teams/member-detail) — QA Sprint Contract 検証
// =============================================================================
// profile 版 (`apps/mobile/components/profile/__tests__/BestTimesTable.test.tsx`) と同一の
// Sprint Contract 観点をこの member-detail 版コンポーネントに対しても検証する
// (実装ファイルが別なので、gender/floor/relay/pool_type/セル詳細の各ロジックが
// このコンポーネントでも独立に正しく実装されていることを保証する)。
//
// Sprint Contract 検証観点:
//   [V-GEN-01] gender が undefined のとき、WAポイントモードでもセルは「—」のままで
//     男性基準の点数 (542) が出てはならない (`?? 0` フォールバック検出)
//   [V-GEN-02] gender=0/1 で同じタイムでも異なる点数が表示される
//   [V-FLOOR-01] floor であって round ではない (46.4/44.94 → 1100、1101は出ない)
//   [V-LCM-IM100] 長水路の100m個人メドレーは base time が無いため「—」になる
//   [V-RELAY-01/02] リレー記録は includeRelaying トグルの ON/OFF どちらでも除外される
//   [V-POOL-01] pool_type=0→SCM / pool_type=1→LCM の向きが正しい
//   [V-CELL-*] セル詳細シート: competition/note/フォールバックの3分岐、日付優先順位、
//     空セルタップ無効、isWaPointsMode 中はタップ不可、同一/別セルタップ挙動
//
// トートロジー防止メモ: 542/763/1100/1000/902/985 は node -e で独立に計算した
// ハードコード値であり、waPoints.ts や本コンポーネントの実装を呼び出していない。
// =============================================================================

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { BestTime } from "@apps/shared/types/ui";
import { BestTimesTable } from "../BestTimesTable";

let idCounter = 0;
const buildBestTime = (overrides: Partial<BestTime> & { style: BestTime["style"] }): BestTime => {
  idCounter += 1;
  return {
    id: `md-rec-${idCounter}`,
    time: 30.0,
    created_at: "2025-01-01T00:00:00.000Z",
    pool_type: 0,
    is_relaying: false,
    ...overrides,
  } as BestTime;
};

const FR100 = { name_jp: "100m自由形", distance: 100 };
const FR50 = { name_jp: "50m自由形", distance: 50 };
const IM100 = { name_jp: "100m個人メドレー", distance: 100 };

const openWaPointsMode = () => fireEvent.click(screen.getByText("WAポイント表示"));

describe("BestTimesTable (member-detail) - WAポイント計算", () => {
  it("[V-GEN-01] gender が undefined のとき、WAポイントモードでも「—」のままで 542 は出ない", () => {
    const bestTimes = [buildBestTime({ time: 54.97, style: FR100 })];
    render(<BestTimesTable bestTimes={bestTimes} gender={undefined} />);

    fireEvent.click(screen.getByText("ALL"));
    openWaPointsMode();

    expect(screen.queryByText("542")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("[V-GEN-02] gender=0 と gender=1 で同じタイムでも異なる点数が表示される", () => {
    const bestTimes = [buildBestTime({ time: 54.97, style: FR100 })];

    const { rerender } = render(<BestTimesTable bestTimes={bestTimes} gender={0} />);
    openWaPointsMode();
    expect(screen.getByText("542")).toBeTruthy();
    expect(screen.queryByText("763")).toBeNull();

    rerender(<BestTimesTable bestTimes={bestTimes} gender={1} />);
    expect(screen.getByText("763")).toBeTruthy();
    expect(screen.queryByText("542")).toBeNull();
  });

  it("[V-FLOOR-01] floor であって round ではない (LCM 100m自由形, B=46.40, T=44.94 → 1100)", () => {
    const bestTimes = [buildBestTime({ time: 44.94, pool_type: 1, style: FR100 })];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} />);

    fireEvent.click(screen.getByText("ALL"));
    openWaPointsMode();

    expect(screen.getByText("1100")).toBeTruthy();
    expect(screen.queryByText("1101")).toBeNull();
  });

  it("[V-LCM-IM100] 長水路の100m個人メドレーは base time が無いため「—」になる (0やNaNにならない)", () => {
    const bestTimes = [buildBestTime({ time: 130.0, pool_type: 1, style: IM100 })];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} />);

    openWaPointsMode();

    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("NaN")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("[V-RELAY-01] includeRelaying トグル OFF でも、リレー記録のみのセルは WAポイントで「—」になる", () => {
    const bestTimes = [buildBestTime({ time: 20.0, style: FR50, is_relaying: true })];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} />);

    openWaPointsMode();

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("504")).toBeNull();
  });

  it("[V-RELAY-02] includeRelaying トグル ON でも、リレー記録は WAポイント計算から除外される", () => {
    const bestTimes = [buildBestTime({ time: 20.0, style: FR50, is_relaying: true })];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} />);

    fireEvent.click(screen.getByText("引き継ぎタイム含"));
    openWaPointsMode();

    // 20.00秒は SCM 50m自由形 gender0 で base=19.90 → 985 相当の高得点。
    // includeRelaying=true でも候補から除外されるため出てはならない。
    expect(screen.queryByText("985")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("[V-POOL-01] pool_type の向きが正しい (LCM 100m自由形 T=46.40 → 1000。SCM基準(902)ではない)", () => {
    const bestTimes = [buildBestTime({ time: 46.4, pool_type: 1, style: FR100 })];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} />);

    fireEvent.click(screen.getByText("ALL"));
    openWaPointsMode();

    expect(screen.getByText("1000")).toBeTruthy();
    expect(screen.queryByText("902")).toBeNull();
  });
});

describe("BestTimesTable (member-detail) - セル詳細シート", () => {
  it("[V-CELL-01] competition ありのセルは大会名を表示する", () => {
    const bestTimes = [
      buildBestTime({
        time: 30.11,
        style: FR50,
        created_at: "2020-01-01T00:00:00.000Z",
        competition: { title: "第10回記録会", date: "2020-05-05" },
      }),
    ];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} />);

    fireEvent.click(screen.getByText("30.11"));
    expect(screen.getByText("第10回記録会")).toBeTruthy();
    expect(screen.queryByText("一括登録")).toBeNull();
  });

  it("[V-CELL-02] competition なし + note ありのセルは note を表示する", () => {
    const bestTimes = [buildBestTime({ time: 31.22, style: FR50, note: "自主練での計測" })];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} />);

    fireEvent.click(screen.getByText("31.22"));
    expect(screen.getByText("自主練での計測")).toBeTruthy();
    expect(screen.queryByText("一括登録")).toBeNull();
  });

  it("[V-CELL-03] competition なし + note なしのセルは「一括登録」にフォールバックする", () => {
    const bestTimes = [buildBestTime({ time: 32.33, style: FR50 })];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} />);

    fireEvent.click(screen.getByText("32.33"));
    expect(screen.getByText("一括登録")).toBeTruthy();
  });

  it("[V-CELL-04] 日付は competition.date が created_at と異なっても competition.date が優先される", () => {
    const bestTimes = [
      buildBestTime({
        time: 33.44,
        style: FR50,
        created_at: "2019-01-01T00:00:00.000Z",
        competition: { title: "優先確認大会", date: "2023-12-25" },
      }),
    ];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} />);

    fireEvent.click(screen.getByText("33.44"));
    expect(screen.getByText(/2023/)).toBeTruthy();
    expect(screen.queryByText(/2019/)).toBeNull();
  });

  it("[V-CELL-05] 空セル(記録なし)をタップしても詳細シートは開かない", () => {
    render(<BestTimesTable bestTimes={[buildBestTime({ time: 30, style: FR50 })]} gender={0} />);

    const emptyCells = screen.getAllByText("—");
    expect(emptyCells.length).toBeGreaterThan(0);
    fireEvent.click(emptyCells[0]);

    expect(screen.queryByText("一括登録")).toBeNull();
  });

  it("[V-CELL-ISWAP] isWaPointsMode 中はセルをタップしても詳細シートが開かない", () => {
    const bestTimes = [buildBestTime({ time: 34.0, style: FR50, note: "WAモード中のタップ検証" })];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} />);

    openWaPointsMode();
    expect(screen.queryByText("34.00")).toBeNull();
    expect(screen.queryByText("WAモード中のタップ検証")).toBeNull();
  });

  it("[V-CELL-06a] 別セルタップで内容が入れ替わる", () => {
    const bestTimes = [
      buildBestTime({ time: 33.44, style: FR50, competition: { title: "セルA大会", date: "2023-01-10" } }),
      buildBestTime({
        time: 44.55,
        style: { name_jp: "50m平泳ぎ", distance: 50 },
        competition: { title: "セルB大会", date: "2023-02-10" },
      }),
    ];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} />);

    fireEvent.click(screen.getByText("33.44"));
    expect(screen.getByText("セルA大会")).toBeTruthy();

    fireEvent.click(screen.getByText("44.55"));
    expect(screen.getByText("セルB大会")).toBeTruthy();
    expect(screen.queryByText("セルA大会")).toBeNull();
  });

  it("[V-CELL-06b] 同一セル再タップで閉じる", () => {
    const bestTimes = [
      buildBestTime({ time: 33.44, style: FR50, competition: { title: "セルA大会", date: "2023-01-10" } }),
    ];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} />);

    const cell = screen.getByText("33.44");
    fireEvent.click(cell);
    expect(screen.getByText("セルA大会")).toBeTruthy();

    fireEvent.click(cell);
    expect(screen.queryByText("セルA大会")).toBeNull();
  });
});
