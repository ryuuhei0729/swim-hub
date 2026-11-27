/**
 * TeamCompetitionRecordsModal — チーム内フィードバックの導線 (docs/specs/record-feedback.md)
 *
 * - チーム記録 (team_id あり) の行に FB の開閉ボタンを出す
 *   - FB があれば「FB n件」(自分が書いていれば「記入済み」を添える)
 *   - 無ければ、管理者ビューかつ他人の記録のときだけ「FBを書く」
 * - 個人の記録 (team_id なし) には出さない
 * - 開くと RecordFeedbackSection (書き込み権限 = 管理者ビュー) を出す
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/__tests__/helpers/testUtils";

const ME = "user-admin";

const mocks = vi.hoisted(() => ({
  supabase: {} as Record<string, unknown>,
  summaries: {} as Record<string, { count: number; hasMine: boolean; unreadCount: number }>,
  sectionProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase, user: { id: "user-admin" } })),
}));

vi.mock("@apps/shared/api/teams/relayRecords", () => ({
  TeamRelayRecordsAPI: { getByCompetition: vi.fn(() => Promise.resolve([])) },
}));

vi.mock("@apps/shared/hooks/queries/recordFeedbacks", () => ({
  useRecordFeedbackSummariesQuery: () => ({ data: mocks.summaries }),
}));

vi.mock("@/components/record-feedback/RecordFeedbackSection", () => ({
  RecordFeedbackSection: (props: Record<string, unknown>) => {
    mocks.sectionProps.push(props);
    return React.createElement("div", { "data-testid": `fb-section-${String(props.recordId)}` });
  },
}));

vi.mock("@/components/records/BestTimeBadge", () => ({ default: () => null }));

function makeSupabase(records: Array<Record<string, unknown>>) {
  const response = (data: unknown) => ({ data, error: null });
  const chain = (data: unknown) => {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.order = () => builder;
    builder.single = () => Promise.resolve(response(data));
    builder.then = (ok: (v: unknown) => unknown, ng?: (e: unknown) => unknown) =>
      Promise.resolve(response(data)).then(ok, ng);
    return builder;
  };
  return {
    from: (table: string) =>
      table === "competitions"
        ? chain({ id: "comp-1", title: "大会", date: "2026-09-01", place: null, pool_type: 0, note: null })
        : chain(records),
  };
}

function record(id: string, userId: string, teamId: string | null, name: string) {
  return {
    id,
    user_id: userId,
    team_id: teamId,
    style_id: 1,
    time: 60 + Number(id.slice(-1)),
    reaction_time: null,
    is_relaying: false,
    pool_type: 0,
    note: null,
    users: { name, profile_image_path: null },
    styles: { id: 1, name_jp: "100m自由形", name: "100Fr", style: "Fr", distance: 100 },
    split_times: [],
  };
}

import { TeamCompetitionRecordsModal } from "../TeamCompetitionRecordsModal";

const renderModal = (isAdmin: boolean) =>
  render(
    <TeamCompetitionRecordsModal
      visible
      onClose={vi.fn()}
      competitionId="comp-1"
      competitionTitle="大会"
      teamId="team-1"
      isAdmin={isAdmin}
    />,
    { wrapper: createQueryWrapper() },
  );

describe("TeamCompetitionRecordsModal — フィードバック導線", () => {
  beforeEach(() => {
    mocks.summaries = {};
    mocks.sectionProps = [];
    mocks.supabase = makeSupabase([
      record("rec-1", "swimmer-a", "team-1", "選手A"),
      record("rec-2", "swimmer-b", "team-1", "選手B"),
      record("rec-3", ME, "team-1", "管理者本人"),
      record("rec-4", "swimmer-c", null, "個人記録の人"),
    ]) as unknown as Record<string, unknown>;
  });

  it("管理者ビュー: 未記入の他人のチーム記録に「FBを書く」、記入済みは件数と「記入済み」", async () => {
    mocks.summaries = { "rec-2": { count: 2, hasMine: true, unreadCount: 0 } };
    renderModal(true);

    await waitFor(() => expect(screen.getByText("選手A")).toBeTruthy());
    // rec-1 (未記入・他人) → FBを書く が1つだけ (rec-3 は自分、rec-4 は個人記録なので出ない)
    expect(screen.getAllByText("FBを書く")).toHaveLength(1);
    expect(screen.getByText("FB 2件 · 記入済み")).toBeTruthy();
  });

  it("一般メンバー: FB が無い行には何も出さず、FB がある行は件数だけ", async () => {
    mocks.summaries = { "rec-1": { count: 1, hasMine: false, unreadCount: 0 } };
    renderModal(false);

    await waitFor(() => expect(screen.getByText("選手A")).toBeTruthy());
    expect(screen.queryByText("FBを書く")).toBeNull();
    expect(screen.getByText("FB 1件")).toBeTruthy();
  });

  it("開くと書き込み権限付きの FB セクションを出す", async () => {
    renderModal(true);
    await waitFor(() => expect(screen.getAllByText("FBを書く").length).toBeGreaterThan(0));
    // 速い順 (rec-1 → rec-2) に並ぶので先頭は rec-1
    fireEvent.click(screen.getAllByText("FBを書く")[0]!);
    expect(screen.getByTestId("fb-section-rec-1")).toBeTruthy();
    expect(mocks.sectionProps.at(-1)).toMatchObject({
      recordId: "rec-1",
      teamId: "team-1",
      recordOwnerId: "swimmer-a",
      canWrite: true,
    });
  });
});
