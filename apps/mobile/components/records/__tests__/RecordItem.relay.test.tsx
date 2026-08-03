// =============================================================================
// RecordItem.relay.test.tsx
// =============================================================================
//
// 大会タブ一覧カードのリレー(引き継ぎ)記録表示の回帰検証。
//
// 旧実装ではタイムの横に何も付かず、同一種目の個人記録とリレー記録が一覧上で
// まったく同じ見た目になっていた (web の CompetitionRecordCard は赤い "R" を
// 出しており、パリティが破れていた)。

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecordWithDetails } from "@swim-hub/shared/types";
import { RecordItem } from "../RecordItem";

vi.mock("../BestTimeBadge", () => ({
  __esModule: true,
  default: () => null,
}));

const bodyText = () => document.body.textContent ?? "";

const makeRecord = (overrides: Partial<RecordWithDetails> = {}): RecordWithDetails =>
  ({
    id: "record-1",
    user_id: "user-1",
    competition_id: "comp-1",
    style_id: 3,
    time: 65.43,
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
    style: { id: 3, name_jp: "100m自由形", distance: 100 },
    split_times: [],
    ...overrides,
  }) as unknown as RecordWithDetails;

describe("RecordItem — リレー(引き継ぎ)記録のマーカー表示", () => {
  it("is_relaying=true の記録はタイムの後ろに R が付く", () => {
    render(<RecordItem record={makeRecord({ is_relaying: true })} />);

    expect(bodyText()).toContain("1:05.43 R");
  });

  it("is_relaying=false の記録には R が付かない", () => {
    render(<RecordItem record={makeRecord({ is_relaying: false })} />);

    expect(bodyText()).toContain("1:05.43");
    expect(bodyText()).not.toContain("R");
  });

  it("大会未紐付け(一括入力)のリレー記録でも R が付く", () => {
    render(<RecordItem record={makeRecord({ competition: null, is_relaying: true })} />);

    expect(bodyText()).toContain("1:05.43 R");
  });
});
