/**
 * TeamCompetitionRecordsModal (web) — 種目名のロケール対応
 * DB の styles.name_jp をそのまま出すと、ドイツ語・英語などでも「50m自由形」と日本語になる
 * (Agent testers の lena で検出)。useStyleLabel でロケールに合わせて組み立てる。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
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

beforeEach(() => {
  mocks.getByCompetition.mockResolvedValue([]);
  mocks.summaries = {};
});

describe("TeamCompetitionRecordsModal — 種目名のロケール対応", () => {
  it("日本語以外のロケールでは、種目見出しと件数を DB の name_jp ではなく翻訳して出す", async () => {
    setData([row("rec-a", "member-a", "Swimmer A")]);
    renderWithI18n(
      <TeamCompetitionRecordsModal
        isOpen
        onClose={vi.fn()}
        competitionId="comp-1"
        competitionTitle="Meet"
      />,
      { locale: "en" },
    );

    expect(await screen.findByRole("heading", { name: "50m Freestyle" })).toBeInTheDocument();
    expect(screen.queryByText("50m自由形")).not.toBeInTheDocument();
    expect(screen.getByText("(1 items)")).toBeInTheDocument();
  });

  it("日本語では従来どおり「50m自由形」「(1件)」と出す", async () => {
    setData([row("rec-a", "member-a", "選手A")]);
    renderWithI18n(
      <TeamCompetitionRecordsModal
        isOpen
        onClose={vi.fn()}
        competitionId="comp-1"
        competitionTitle="大会"
      />,
    );

    expect(await screen.findByRole("heading", { name: "50m自由形" })).toBeInTheDocument();
    expect(screen.getByText("(1件)")).toBeInTheDocument();
  });
});
