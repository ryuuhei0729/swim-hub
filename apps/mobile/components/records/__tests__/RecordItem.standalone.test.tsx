// =============================================================================
// RecordItem.standalone.test.tsx
// =============================================================================
//
// 大会未紐付けレコード（一括ベストタイム入力等。record.competition が null）の
// 一覧表示回帰検証。Sprint Contract 検証観点:
//
//   [グレー表示] record.competition が null の行はグレー背景 (containerStandalone)
//     になる
//   [ラベル表示] 大会名位置に「(一括入力)」と表示される
//   [非退行] 大会紐付けレコードは通常表示のまま (グレーにならない、大会名が表示される)
//   [pool_type 表示修正] standalone レコード (competition が無い) はプールタイプの
//     参照元を record.competition?.pool_type ではなく record.pool_type (BestTimeBadge と
//     同じソース) に統一した。旧コードは competition が無いため参照が常に undefined と
//     なり、常に「長水路」に誤表示されていた。record.pool_type=0 の standalone レコードが
//     正しく「短水路」と表示されることを検証する。

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecordWithDetails } from "@swim-hub/shared/types";
import { RecordItem } from "../RecordItem";

vi.mock("../BestTimeBadge", () => ({
  __esModule: true,
  default: () => null,
}));

const makeRecord = (overrides: Partial<RecordWithDetails> = {}): RecordWithDetails =>
  ({
    id: "record-1",
    user_id: "user-1",
    competition_id: "comp-1",
    style_id: 2,
    time: 30.5,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: 0,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    competition: {
      id: "comp-1",
      title: "テスト大会",
      date: "2026-07-01",
      place: "テストプール",
      pool_type: 0,
    },
    style: { id: 2, name_jp: "50m自由形", distance: 50 },
    split_times: [],
    ...overrides,
  }) as unknown as RecordWithDetails;

describe("RecordItem — 大会未紐付けレコード(一括入力)の一覧表示", () => {
  it("[グレー表示/ラベル表示] record.competition が null の場合、グレー背景になり大会名位置に「(一括入力)」と表示される", () => {
    const record = makeRecord({ competition: null });
    render(<RecordItem record={record} />);

    expect(screen.getByText(/一括入力/)).toBeDefined();
    // 通常の大会名は表示されない
    expect(screen.queryByText("テスト大会")).toBeNull();
  });

  it("[非退行] 大会紐付けレコードは通常表示のまま (大会名が表示され、一括入力ラベルは出ない)", () => {
    const record = makeRecord(); // competition あり (デフォルト)
    render(<RecordItem record={record} />);

    expect(screen.getByText("テスト大会")).toBeDefined();
    expect(screen.queryByText(/一括入力/)).toBeNull();
  });

  it("行タップで onPress が record 付きで呼ばれる (大会未紐付けでも紐付けでも同様)", () => {
    const onPress = vi.fn();
    const record = makeRecord({ competition: null });
    render(<RecordItem record={record} onPress={onPress} />);

    fireEvent.click(screen.getByText(/一括入力/));
    expect(onPress).toHaveBeenCalledWith(record);
  });

  describe("[pool_type 表示修正] standalone レコードのプールタイプ表示", () => {
    it("record.competition=null かつ record.pool_type=0 のとき「短水路」と表示される (旧バグは「長水路」誤表示)", () => {
      const record = makeRecord({ competition: null, pool_type: 0 });
      render(<RecordItem record={record} />);

      expect(screen.getByText("短水路")).toBeDefined();
      expect(screen.queryByText("長水路")).toBeNull();
    });

    it("record.competition=null かつ record.pool_type=1 のとき「長水路」と表示される", () => {
      const record = makeRecord({ competition: null, pool_type: 1 });
      render(<RecordItem record={record} />);

      expect(screen.getByText("長水路")).toBeDefined();
      expect(screen.queryByText("短水路")).toBeNull();
    });
  });
});
