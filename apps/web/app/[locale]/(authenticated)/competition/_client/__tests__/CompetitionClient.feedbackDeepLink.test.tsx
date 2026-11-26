/**
 * CompetitionClient — フィードバック通知からのディープリンク
 * 仕様: docs/specs/record-feedback.md「受信ポップアップ」
 *
 * ダッシュボードの「記録画面へ」は /competition?recordId=...(&competitionId=...) に遷移する。
 * 記録タブで該当のカードを押したときと同じ詳細モーダルが開き、URL のクエリは消える。
 */
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const nav = vi.hoisted(() => ({ query: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
}));

// 単体編集フォームは本テストの対象外 (React Query を使うため描画しない)
vi.mock("@/components/forms/RecordLogForm", () => ({
  __esModule: true,
  default: () => null,
}));

const recordApi = vi.hoisted(() => ({ getRecordById: vi.fn() }));
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getRecordById = recordApi.getRecordById;
  },
}));

import { renderClient, makeRecord } from "./competitionClientHarness";

beforeEach(() => {
  nav.query = "";
  window.history.replaceState(null, "", "/competition");
});

describe("CompetitionClient — フィードバック通知からのディープリンク", () => {
  it("大会に紐づく記録なら、その大会の詳細モーダルを開き、クエリを消す", async () => {
    nav.query = "recordId=record-1&competitionId=comp-1";
    window.history.replaceState(null, "", "/competition?recordId=record-1&competitionId=comp-1");
    renderClient([makeRecord()]);
    expect(await screen.findByTestId("competition-detail-modal-stub")).toBeInTheDocument();
    expect(screen.getByTestId("detail-competition-id")).toHaveTextContent("comp-1");
    expect(window.location.search).toBe("");
  });

  it("大会の無い記録なら単体詳細モーダルを開く", async () => {
    nav.query = "recordId=record-2";
    renderClient([makeRecord({ id: "record-2", competition_id: null, competition: null })]);
    expect(await screen.findByTestId("record-standalone-modal-stub")).toBeInTheDocument();
    expect(screen.getByTestId("standalone-record-id")).toHaveTextContent("record-2");
  });

  it("一覧に無い記録は1件だけ取得して開く", async () => {
    nav.query = "recordId=record-9";
    recordApi.getRecordById.mockResolvedValue(
      makeRecord({ id: "record-9", competition_id: "comp-9" }),
    );
    renderClient([makeRecord()]);
    await waitFor(() => expect(recordApi.getRecordById).toHaveBeenCalledWith("record-9"));
    expect(await screen.findByTestId("competition-detail-modal-stub")).toBeInTheDocument();
  });

  it("クエリが無ければ何も開かない", () => {
    renderClient([makeRecord()]);
    expect(screen.queryByTestId("competition-detail-modal-stub")).not.toBeInTheDocument();
    expect(screen.queryByTestId("record-standalone-modal-stub")).not.toBeInTheDocument();
  });
});
