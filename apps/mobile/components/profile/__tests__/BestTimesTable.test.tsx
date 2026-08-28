// =============================================================================
// BestTimesTable.test.tsx (apps/mobile/components/profile) — QA Sprint Contract 検証
// =============================================================================
// Sprint Contract 検証観点:
//   [V-GEN-01] gender が undefined のとき、WAポイントモードでもセルは「—」のままで
//     男性基準の点数 (542) が出てはならない (`?? 0` フォールバック検出)
//   [V-GEN-02] gender=0/1 で同じタイムでも異なる点数が表示される
//   [V-FLOOR-01] floor であって round ではない (46.4/44.94 → 1100、1101は出ない)
//   [V-LCM-IM100] 長水路の100m個人メドレーは base time が無いため「—」になる
//     (0点や NaN にならないこと)
//   [V-RELAY-01/02] リレー記録は includeRelaying トグルの ON/OFF どちらでも
//     WAポイント計算から除外される (両方を assert する)
//   [V-POOL-01] pool_type=0→SCM / pool_type=1→LCM の向きが正しい
//   [V-CELL-*] セル詳細シート: competition/note/フォールバックの3分岐、日付優先順位、
//     空セルタップ無効、isWaPointsMode 中はタップ不可、同一セル再タップで閉じる、
//     別セルタップで内容が入れ替わる
//   [V-NOTE-RELAY] リレー引き継ぎ候補が採用されたとき、親記録の note ではなく
//     引き継ぎ側 (relayingTime) の note が表示される (CodeRabbit 指摘の回帰テスト)
//
// トートロジー防止メモ: 542/763/504/761/1100/1000/902/291 は node -e で
// floor(1000*(B/T)^3) を独立に計算したハードコード値であり、waPoints.ts や
// 本コンポーネントの実装を呼び出して生成していない。
//
// ## isWaPointsMode の state リフトアップについて (mobile UI フィードバック #5)
// WAポイント表示トグルは呼び出し元 (MyPageScreen) に移設され、BestTimesTable は
// `isWaPointsMode` を必須 props として受け取るだけの表示コンポーネントになった。
// 本ファイルは BestTimesTable 単体の計算ロジック (floor/round・gender 0/1・
// リレー除外・pool_type の向き) をユニットレベルで検証する目的のため、
// 呼び出し元 (MyPageScreen) を模した最小限の `ControlledBestTimesTable` で
// state を保持し、「トグルを押す→表示が切り替わる」という利用者観点の操作列は
// そのまま維持する (呼び出し元配線そのものの回帰は
// `screens/__tests__/MyPageScreen.waPointsGenderWiring.test.tsx` が別途担当)。
// =============================================================================

import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import type { BestTime } from "@apps/shared/types/ui";
import { BestTimesTable } from "../BestTimesTable";

type ControlledProps = Omit<React.ComponentProps<typeof BestTimesTable>, "isWaPointsMode"> & {
  initialWaPointsMode?: boolean;
};

/**
 * MyPageScreen の state リフトアップ (isWaPointsMode を親が保持し props で渡す) を
 * 模した最小限のテストハーネス。「WAポイント表示」ボタンは MyPageScreen 側の
 * トグルボタンと同じラベルで、押すたびに isWaPointsMode を反転して BestTimesTable に渡す。
 */
const ControlledBestTimesTable: React.FC<ControlledProps> = ({
  initialWaPointsMode = false,
  ...rest
}) => {
  const [isWaPointsMode, setIsWaPointsMode] = useState(initialWaPointsMode);
  return (
    <>
      <button type="button" onClick={() => setIsWaPointsMode((prev) => !prev)}>
        WAポイント表示
      </button>
      <BestTimesTable {...rest} isWaPointsMode={isWaPointsMode} />
    </>
  );
};

let idCounter = 0;
const buildBestTime = (overrides: Partial<BestTime> & { style: BestTime["style"] }): BestTime => {
  idCounter += 1;
  return {
    id: `rec-${idCounter}`,
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

describe("BestTimesTable (profile) - WAポイント計算", () => {
  it("[V-GEN-01] gender が undefined のとき、WAポイントモードでも「—」のままで 542 は出ない", () => {
    const bestTimes = [buildBestTime({ time: 54.97, style: FR100 })];
    render(<ControlledBestTimesTable bestTimes={bestTimes} gender={undefined} />);

    fireEvent.click(screen.getByText("ALL"));
    fireEvent.click(screen.getByText("WAポイント表示"));

    expect(screen.queryByText("542")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("[V-GEN-02] gender=0 と gender=1 で同じタイムでも異なる点数が表示される", () => {
    const bestTimes = [buildBestTime({ time: 54.97, style: FR100 })];

    const { rerender } = render(<ControlledBestTimesTable bestTimes={bestTimes} gender={0} />);
    fireEvent.click(screen.getByText("WAポイント表示"));
    expect(screen.getByText("542")).toBeTruthy();
    expect(screen.queryByText("763")).toBeNull();

    // isWaPointsMode は前段の click で既に ON になっている (rerender で state は保持される。
    // ControlledBestTimesTable は同一コンポーネント/同一位置で re-render されるため
    // useState は React によって保持される)
    rerender(<ControlledBestTimesTable bestTimes={bestTimes} gender={1} />);
    expect(screen.getByText("763")).toBeTruthy();
    expect(screen.queryByText("542")).toBeNull();
  });

  it("[V-FLOOR-01] floor であって round ではない (LCM 100m自由形, B=46.40, T=44.94 → 1100)", () => {
    const bestTimes = [buildBestTime({ time: 44.94, pool_type: 1, style: FR100 })];
    render(<ControlledBestTimesTable bestTimes={bestTimes} gender={0} />);

    fireEvent.click(screen.getByText("ALL"));
    fireEvent.click(screen.getByText("WAポイント表示"));

    expect(screen.getByText("1100")).toBeTruthy();
    expect(screen.queryByText("1101")).toBeNull();
  });

  it("[V-LCM-IM100] 長水路の100m個人メドレーは base time が無いため「—」になる (0やNaNにならない)", () => {
    const bestTimes = [buildBestTime({ time: 130.0, pool_type: 1, style: IM100 })];
    render(<ControlledBestTimesTable bestTimes={bestTimes} gender={0} />);

    fireEvent.click(screen.getByText("WAポイント表示"));

    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("NaN")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("[V-RELAY-01] includeRelaying トグル OFF でも、リレー記録のみのセルは WAポイントで「—」になる", () => {
    const bestTimes = [buildBestTime({ time: 20.0, style: FR50, is_relaying: true })];
    render(<ControlledBestTimesTable bestTimes={bestTimes} gender={0} />);

    fireEvent.click(screen.getByText("WAポイント表示"));

    // 通常モードでも同様に非表示 (リレーのみ = candidates 空)
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("504")).toBeNull();
  });

  it("[V-RELAY-02] includeRelaying トグル ON でも、リレー記録は WAポイント計算から除外される (「引き継ぎ含む」チェックをONにしても点数は出ない)", () => {
    const bestTimes = [buildBestTime({ time: 20.0, style: FR50, is_relaying: true })];
    render(<ControlledBestTimesTable bestTimes={bestTimes} gender={0} />);

    // 「引き継ぎタイムを含む」チェックボックスをON
    fireEvent.click(screen.getByText("引き継ぎタイム含"));
    // WAポイントモードへ切り替え
    fireEvent.click(screen.getByText("WAポイント表示"));

    // includeRelaying=true でも WA ポイント候補はリレーを除外するため、まだ「—」のはず
    // (20.00秒は SCM 50m自由形 gender0 で base=19.90 → floor(1000*(19.90/20.00)^3)=985 相当の
    //  高得点になるため、混入すれば容易に検出できる)
    expect(screen.queryByText("985")).toBeNull();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("[V-POOL-01] pool_type の向きが正しい (LCM 100m自由形 T=46.40 → 1000。SCM基準(902)ではない)", () => {
    const bestTimes = [buildBestTime({ time: 46.4, pool_type: 1, style: FR100 })];
    render(<ControlledBestTimesTable bestTimes={bestTimes} gender={0} />);

    fireEvent.click(screen.getByText("ALL"));
    fireEvent.click(screen.getByText("WAポイント表示"));

    expect(screen.getByText("1000")).toBeTruthy();
    expect(screen.queryByText("902")).toBeNull();
  });
});

describe("BestTimesTable (profile) - セル詳細シート", () => {
  it("[V-CELL-01] competition ありのセルは大会名を表示する", () => {
    const bestTimes = [
      buildBestTime({
        time: 30.11,
        style: FR50,
        created_at: "2020-01-01T00:00:00.000Z",
        competition: { title: "第10回記録会", date: "2020-05-05" },
      }),
    ];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} isWaPointsMode={false} />);

    fireEvent.click(screen.getByText("30.11"));
    expect(screen.getByText("第10回記録会")).toBeTruthy();
    expect(screen.queryByText("一括登録")).toBeNull();
  });

  it("[V-CELL-02] competition なし + note ありのセルは note を表示する", () => {
    const bestTimes = [
      buildBestTime({ time: 31.22, style: FR50, note: "自主練での計測" }),
    ];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} isWaPointsMode={false} />);

    fireEvent.click(screen.getByText("31.22"));
    expect(screen.getByText("自主練での計測")).toBeTruthy();
    expect(screen.queryByText("一括登録")).toBeNull();
  });

  it("[V-CELL-03] competition なし + note なしのセルは「一括登録」にフォールバックする", () => {
    const bestTimes = [buildBestTime({ time: 32.33, style: FR50 })];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} isWaPointsMode={false} />);

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
    render(<BestTimesTable bestTimes={bestTimes} gender={0} isWaPointsMode={false} />);

    fireEvent.click(screen.getByText("33.44"));
    // formatDate(date, "numeric", "ja") は "yyyy/MM/dd" 系。created_at(2019)ではなく
    // competition.date(2023-12-25)の年が表示されることを確認する。
    expect(screen.getByText(/2023/)).toBeTruthy();
    expect(screen.queryByText(/2019/)).toBeNull();
  });

  it("[V-CELL-05] 空セル(記録なし)をタップしても詳細シートは開かない", () => {
    render(
      <BestTimesTable
        bestTimes={[buildBestTime({ time: 30, style: FR50 })]}
        gender={0}
        isWaPointsMode={false}
      />,
    );

    const emptyCells = screen.getAllByText("—");
    expect(emptyCells.length).toBeGreaterThan(0);
    fireEvent.click(emptyCells[0]);

    expect(screen.queryByText("一括登録")).toBeNull();
  });

  it("[V-CELL-ISWAP] isWaPointsMode 中はWAポイントセルを実際にタップしても詳細シートが開かない", () => {
    const bestTimes = [buildBestTime({ time: 30.0, style: FR50, note: "WAモード中のタップ検証" })];
    render(<ControlledBestTimesTable bestTimes={bestTimes} gender={0} />);

    fireEvent.click(screen.getByText("WAポイント表示"));

    // SCM 50m自由形 gender=0 (base=19.90) で t=30.00 → floor(1000*(19.90/30.00)^3)=291
    // (node -e で独立計算。waPoints.ts の実装は呼んでいない)。
    // このセルが実際に描画されていることを確認したうえで、そのセルを実際にタップする。
    const waCell = screen.getByText("291");
    fireEvent.click(waCell);

    expect(screen.queryByText("WAモード中のタップ検証")).toBeNull();
    expect(screen.queryByText("一括登録")).toBeNull();
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
    render(<BestTimesTable bestTimes={bestTimes} gender={0} isWaPointsMode={false} />);

    fireEvent.click(screen.getByText("33.44"));
    expect(screen.getByText("セルA大会")).toBeTruthy();

    fireEvent.click(screen.getByText("44.55"));
    expect(screen.getByText("セルB大会")).toBeTruthy();
    expect(screen.queryByText("セルA大会")).toBeNull();
  });

  it(
    "[V-CELL-06b] 同一セル再タップで閉じる " +
      "(PM裁定: CenterModal の閉じアニメーション分(160ms)の遅延を許容する。契約は" +
      "「同一セル再タップで閉じる」であって「0msで中身が消える」ではないため、" +
      "同期アサーションではなく waitFor で待つ。ただし『そもそも閉じない』退行は" +
      "waitFor のタイムアウト(既定5000ms > 160ms)で確実に赤くなる)",
    async () => {
      const bestTimes = [
        buildBestTime({ time: 33.44, style: FR50, competition: { title: "セルA大会", date: "2023-01-10" } }),
      ];
      render(<BestTimesTable bestTimes={bestTimes} gender={0} isWaPointsMode={false} />);

      const cell = screen.getByText("33.44");
      fireEvent.click(cell);
      expect(screen.getByText("セルA大会")).toBeTruthy();

      fireEvent.click(cell);
      // 閉じるアニメーション (CenterModal の ANIMATION_DURATION=160ms) の間は
      // 直近の中身が残っていてもよい。アニメーション完了後に消えていることを確認する。
      await waitFor(() => {
        expect(screen.queryByText("セルA大会")).toBeNull();
      });
    },
  );
});

describe("BestTimesTable (profile) - リレー引き継ぎ候補の note", () => {
  it("[V-NOTE-RELAY] 引き継ぎ記録が採用されたセルは、親記録ではなく引き継ぎ側の note を表示する", () => {
    const bestTimes = [
      buildBestTime({
        time: 40.0,
        style: FR50,
        note: "親記録のノート(表示されたら不合格)",
        relayingTime: {
          id: "relay-note-1",
          time: 20.0,
          created_at: "2024-06-01T00:00:00.000Z",
          note: "引き継ぎ側のノート",
        },
      }),
    ];
    render(<BestTimesTable bestTimes={bestTimes} gender={0} isWaPointsMode={false} />);

    // 「引き継ぎタイムを含む」をONにすると、引き継ぎ側 (20.00秒) の方が親 (40.00秒) より
    // 速いため、このセルは引き継ぎ側の候補として描画される。
    fireEvent.click(screen.getByText("引き継ぎタイム含"));

    // タイム表示は "20.00" + 引き継ぎ接尾辞 "R" が別要素で入れ子になるため、
    // getByText の完全一致では掴めない。button (Pressable) を実際にタップして検証する。
    const timeCellButton = screen
      .getAllByRole("button")
      .find((el) => el.textContent?.startsWith("20.00"));
    expect(timeCellButton).toBeTruthy();
    fireEvent.click(timeCellButton as HTMLElement);

    expect(screen.getByText("引き継ぎ側のノート")).toBeTruthy();
    expect(screen.queryByText("親記録のノート(表示されたら不合格)")).toBeNull();
  });
});
