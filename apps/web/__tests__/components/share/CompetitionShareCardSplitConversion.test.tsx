/**
 * CompetitionShareCard の DB SplitTime → UI SplitTime 変換テスト
 *
 * Sprint Contract: GitHub Issue #13 Stage1 (SplitTime 同一リポ内衝突の解消)
 *
 * 背景 (PM 裁定):
 *   `apps/shared/types/record.ts` の `SplitTime` (DB レコード型,
 *   `{ id, record_id, distance, split_time, created_at }`) と
 *   `apps/web/utils/lapTimeCalculator.ts` の `SplitTime` (UI 計算型,
 *   `{ distance, splitTime }`) が同一リポ内で名前衝突している。
 *   `apps/web/components/share/CompetitionShareCard.tsx:24` には
 *   「(@/types のSplitTimeはsplit_timeを使用)」という手動回避コメントが実在する。
 *
 *   Stage1 では lapTimeCalculator 側の `SplitTime` を別名にリネームする。
 *   型のリネームはコンパイル時にのみ存在し実行時の挙動を変えないため、
 *   「型名が変わったこと」自体を実行時テストで検証することはできない
 *   (型テストだけを書くとトートロジーになる)。
 *
 *   このテストは型名ではなく、コンポーネントの実際の変換ロジック
 *   (CompetitionShareCard.tsx:25-33 の `validSplitTimes` 生成部分) を
 *   DB 形状の実データで駆動し、`distance`/`split_time` → `distance`/`splitTime`
 *   の変換とラップタイムテーブル描画が正しく行われることを検証する。
 *   リネームの前後で挙動が変わらないことを保証する回帰ガードであり、
 *   Stage1 実装 (リネーム) の前後を通じて green であることが期待値。
 *
 * Sprint Contract 検証観点:
 *   [V-1-B] DB 形状 (id/record_id/created_at を含む) の splitTimes を渡しても
 *           distance/split_time だけが正しく distance/splitTime に変換され、
 *           ラップタイムテーブルが正しい値で描画される
 *   [V-1-B-異常系] distance<=0 または split_time<=0 の DB レコードは
 *           変換元から除外される (既存フィルタの回帰確認)
 *
 * トートロジー防止メモ:
 *   期待値はコンポーネント実装ではなく、`apps/web/__tests__/utils/lapTimeCalculator.test.ts`
 *   の「100m自由形のテーブルを生成する」ケースで既に独立検証済みの計算式
 *   (lapTimes[interval] = 現在の split - 直前の interval の split) を手計算して算出した。
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompetitionShareCard } from "@/components/share/CompetitionShareCard";
import type { CompetitionShareData } from "@/components/share/types";
import type { SplitTime as DbSplitTime } from "@apps/shared/types/record";

function makeDbSplitTime(overrides: Partial<DbSplitTime>): DbSplitTime {
  return {
    id: "split-id",
    record_id: "record-id",
    distance: 0,
    split_time: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeShareData(overrides: Partial<CompetitionShareData>): CompetitionShareData {
  return {
    competitionName: "テスト大会",
    date: "2026年1月1日",
    place: "テストプール",
    poolType: "short",
    eventName: "100m 自由形",
    raceDistance: 100,
    time: 0,
    userName: "テスト選手",
    ...overrides,
  };
}

describe("CompetitionShareCard — DB SplitTime → UI SplitTime 変換 (Stage1 回帰ガード)", () => {
  it("[V-1-B] DB形状の4件のsplitTimesから100m自由形のラップタイムテーブルが正しく描画される", () => {
    const data = makeShareData({
      time: 56.0,
      splitTimes: [
        makeDbSplitTime({ id: "s1", distance: 25, split_time: 12.0 }),
        makeDbSplitTime({ id: "s2", distance: 50, split_time: 25.5 }),
        makeDbSplitTime({ id: "s3", distance: 75, split_time: 40.0 }),
        makeDbSplitTime({ id: "s4", distance: 100, split_time: 56.0 }),
      ],
    });

    render(<CompetitionShareCard data={data} />);

    // distance 列: DB の distance がそのまま distance 列に使われている
    expect(screen.getByText("25m")).toBeTruthy();
    expect(screen.getByText("50m")).toBeTruthy();
    expect(screen.getByText("75m")).toBeTruthy();
    expect(screen.getByText("100m")).toBeTruthy();

    // splitTime 列: DB の split_time が UI の splitTime に変換されて表示されている
    // (apps/web/components/share/utils.ts の formatTime は独立実装で桁数統一Stageの対象外)
    // 75m行(40.00)は他セルと値が重複しない一意な値
    expect(screen.getByText("40.00")).toBeTruthy();
    // 25m行の splitTime(12.00) は同じ行の lap25 列とも一致する(区間内の最初の split は
    // lap-time が split-time自身と一致するという lapTimeCalculator のドメイン上不可避な性質)
    expect(screen.getAllByText("12.00")).toHaveLength(2);
    // 50m行の splitTime(25.50) は同じ行の lap50 列とも一致する(50m=interval50の最初の区間のため)
    expect(screen.getAllByText("25.50")).toHaveLength(2);
    // 100m行の splitTime(56.00) はカード上部の合計タイム表示とも一致する(実運用でも最終splitときのレース全体タイムは一致する)
    expect(screen.getAllByText("56.00")).toHaveLength(2);

    // lap (25m区間)列: calculateRaceLapTimesTable の既知の計算式で一意に定まる値
    expect(screen.getByText("13.50")).toBeTruthy(); // 50m地点の25m区間ラップ = 25.50 - 12.00
    expect(screen.getByText("14.50")).toBeTruthy(); // 75m地点の25m区間ラップ = 40.00 - 25.50
    expect(screen.getByText("16.00")).toBeTruthy(); // 100m地点の25m区間ラップ = 56.00 - 40.00

    // lap (50m区間)列: 25m/75m行は50の倍数でないため "–" (null)
    expect(screen.getByText("30.50")).toBeTruthy(); // 100m地点の50m区間ラップ = 56.00 - 25.50
    expect(screen.getAllByText("–")).toHaveLength(2); // 25m行・75m行の lap50 セル
  });

  it("[V-1-B-異常系] distance<=0 または split_time<=0 のDBレコードは変換元から除外される(既存フィルタの回帰確認)", () => {
    const data = makeShareData({
      eventName: "50m 自由形",
      raceDistance: 50,
      time: 26.0,
      splitTimes: [
        makeDbSplitTime({ id: "s0", distance: 0, split_time: 0 }), // distance<=0 → 除外
        makeDbSplitTime({ id: "s1", distance: 50, split_time: 0 }), // split_time<=0 → 除外
      ],
    });

    render(<CompetitionShareCard data={data} />);

    // 有効な split-time が1件も無いため、ラップタイムテーブル自体が描画されない
    expect(screen.queryByText("距離")).toBeNull();
    expect(screen.queryByText("スプリット")).toBeNull();
  });

  it("[V-1-B-異常系] splitTimesがundefinedでもクラッシュせずテーブル無しで描画される", () => {
    const data = makeShareData({ time: 30.0, splitTimes: undefined });

    render(<CompetitionShareCard data={data} />);

    expect(screen.queryByText("距離")).toBeNull();
    // 合計タイムは通常通り描画される
    expect(screen.getByText("30.00")).toBeTruthy();
  });
});
