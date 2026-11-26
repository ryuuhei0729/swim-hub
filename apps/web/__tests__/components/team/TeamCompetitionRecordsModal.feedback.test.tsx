/**
 * TeamCompetitionRecordsModal (web) — チーム内フィードバックの列
 * 仕様: docs/specs/record-feedback.md「管理者の書き込み導線」
 *
 *   - 各記録に閲覧できる FB の件数「FB n件」を出す
 *   - 管理者として開いたときだけ、まだ書いていない他人の記録に「FBを書く」を出す
 *   - 自分の記録・書き込み済みの記録には「FBを書く」を出さない (書き込み済みは「記入済み」)
 *   - リレーのレグ (relay_records) にもレグ単位で出す
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within, fireEvent } from "@testing-library/react";
import { renderWithI18n } from "@/__tests__/helpers/teamQueryTestUtils";
import type { RecordFeedbackSummary } from "@apps/shared/types/recordFeedback";

const STYLE = { id: 30, name_jp: "50m自由形", name: "Fr", style: "Fr", distance: 50 };

const mocks = vi.hoisted(() => ({
  supabase: {} as Record<string, unknown>,
  summaries: {} as Record<string, RecordFeedbackSummary>,
  getByCompetition: vi.fn(),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase, user: { id: "coach-1" } })),
}));

vi.mock("@/components/ui/BestTimeBadge", () => ({ default: () => null }));

vi.mock("@apps/shared/api/teams/relayRecords", () => ({
  TeamRelayRecordsAPI: { getByCompetition: mocks.getByCompetition },
}));

vi.mock("@/components/record-feedback/useRecordFeedbackSummaries", () => ({
  useRecordFeedbackSummaries: () => mocks.summaries,
}));

import TeamCompetitionRecordsModal from "@/components/team/TeamCompetitionRecordsModal";

function makeBuilder(response: { data: unknown; error: null }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    single: () => Promise.resolve(response),
    then: (f: (v: typeof response) => unknown, r?: (e: unknown) => unknown) =>
      Promise.resolve(response).then(f, r),
  };
  return builder;
}

function setData(records: Array<Record<string, unknown>>) {
  const comp = makeBuilder({
    data: { id: "comp-1", title: "大会", date: "2026-11-01", place: null, pool_type: 0, note: null },
    error: null,
  });
  const recs = makeBuilder({ data: records, error: null });
  mocks.supabase = {
    from: (table: string) => (table === "competitions" ? comp : recs),
  };
}

function row(id: string, userId: string, name: string) {
  return {
    id,
    user_id: userId,
    style_id: STYLE.id,
    time: 30,
    reaction_time: null,
    is_relaying: false,
    note: null,
    pool_type: 0,
    users: { name, profile_image_path: null },
    styles: STYLE,
    split_times: [],
  };
}

function renderModal(isAdmin: boolean) {
  return renderWithI18n(
    <TeamCompetitionRecordsModal
      isOpen
      onClose={vi.fn()}
      competitionId="comp-1"
      competitionTitle="大会"
      isAdmin={isAdmin}
    />,
  );
}

async function findRow(name: string) {
  const cell = await screen.findByText(name, { selector: "td" });
  return cell.closest("tr") as HTMLElement;
}

beforeEach(() => {
  mocks.getByCompetition.mockResolvedValue([]);
  mocks.summaries = {};
});

describe("TeamCompetitionRecordsModal — フィードバック列", () => {
  it("管理者は、まだ書いていない他人の記録にだけ「FBを書く」を出す", async () => {
    setData([
      row("rec-a", "member-a", "選手A"),
      row("rec-b", "member-b", "選手B"),
      row("rec-own", "coach-1", "コーチ本人"),
    ]);
    mocks.summaries = {
      "rec-b": { count: 2, hasMine: true, unreadCount: 0 },
    };
    renderModal(true);

    const rowA = await findRow("選手A");
    expect(within(rowA).getByTestId("record-feedback-write-button")).toBeInTheDocument();

    const rowB = await findRow("選手B");
    expect(within(rowB).queryByTestId("record-feedback-write-button")).not.toBeInTheDocument();
    expect(within(rowB).getByTestId("record-feedback-count-badge")).toHaveTextContent("FB 2件");
    expect(within(rowB).getByTestId("record-feedback-written")).toHaveTextContent("記入済み");

    const rowOwn = await findRow("コーチ本人");
    expect(within(rowOwn).queryByTestId("record-feedback-write-button")).not.toBeInTheDocument();
  });

  it("管理者でなければ「FBを書く」を出さず、件数だけ出す", async () => {
    setData([row("rec-a", "member-a", "選手A"), row("rec-b", "member-b", "選手B")]);
    mocks.summaries = { "rec-a": { count: 1, hasMine: false, unreadCount: 1 } };
    renderModal(false);

    const rowA = await findRow("選手A");
    expect(within(rowA).getByTestId("record-feedback-count-badge")).toHaveTextContent("FB 1件");
    expect(screen.queryByTestId("record-feedback-write-button")).not.toBeInTheDocument();
  });

  it("「FBを書く」を押すと作成フォームが開く", async () => {
    setData([row("rec-a", "member-a", "選手A")]);
    renderModal(true);
    const rowA = await findRow("選手A");
    fireEvent.click(within(rowA).getByTestId("record-feedback-write-button"));
    expect(screen.getByTestId("record-feedback-form-modal")).toBeInTheDocument();
    expect(screen.getByText("選手Aさんへ")).toBeInTheDocument();
  });

  it("リレーのレグにもレグ単位で「FBを書く」を出す", async () => {
    setData([row("rec-leg0", "member-a", "選手A")]);
    mocks.getByCompetition.mockResolvedValue([
      {
        id: "relay-1",
        teamId: "team-1",
        competitionId: "comp-1",
        relayKind: "free",
        legDistance: 50,
        legCount: 4,
        poolType: 0,
        genderCategory: "mixed",
        totalTime: 120,
        createdAt: null,
        legs: [
          {
            id: "leg-0",
            legIndex: 0,
            userId: "member-a",
            styleId: STYLE.id,
            legTime: 30,
            reactionTime: null,
            recordId: "rec-leg0",
            userName: "選手A",
            profileImagePath: null,
            styleNameJp: "自由形",
            styleDistance: 50,
          },
        ],
      },
    ]);
    renderModal(true);
    fireEvent.click(await screen.findByTestId("team-competition-relay-row-relay-1"));
    const legs = screen.getByTestId("team-competition-relay-legs-relay-1");
    expect(within(legs).getByTestId("record-feedback-write-button")).toBeInTheDocument();
  });
});
