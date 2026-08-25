/**
 * TeamCompetitions — 自分の記録を保存する際の records.pool_type 自己修復 (D-6 / V-11)
 *
 * TeamCompetitions.tsx の handleSelfRecordSubmit (:686-697) は、既存記録を UPDATE する際
 * pool_type を競技会 (selfRecordCompetition.pool_type) に揃える。これは
 * useCompetitionTabSave.ts の D-6 とは別の保存経路 (チーム大会の「自分の記録を追加」) であり、
 * 個別に検証が必要 (Sprint Contract V-11: スコープ厳守 = 自分の記録を保存する経路の中だけ)。
 *
 * ハーネスは既存の TeamCompetitionsSelfRecordPrefill.test.tsx (V-SR-03) と同型。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSupabaseCompetitionsMock } from "../../utils/supabaseCompetitionsMock";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
  createRecord: vi.fn(),
  createSplitTimes: vi.fn(),
  updateRecord: vi.fn(),
  replaceSplitTimes: vi.fn(),
  getStyles: vi.fn(),
}));

vi.mock("@apps/shared/api/teams/records", () => ({
  TeamRecordsAPI: vi.fn().mockImplementation(() => ({
    update: mocks.update,
    remove: mocks.remove,
    create: mocks.create,
  })),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    createRecord: mocks.createRecord,
    createSplitTimes: mocks.createSplitTimes,
    updateRecord: mocks.updateRecord,
    replaceSplitTimes: mocks.replaceSplitTimes,
  })),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: vi.fn().mockImplementation(() => ({
    getStyles: mocks.getStyles,
  })),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({
    getEntriesByCompetition: vi.fn(),
    getEntriesByUser: vi.fn(),
  })),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/forms/CompetitionBasicForm", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionEntryModal", () => ({ default: () => null }));
vi.mock("../../../components/team/TeamCompetitionRecordsModal", () => ({ default: () => null }));
vi.mock("@/components/video/VideoUploader", () => ({ default: () => null }));
vi.mock("@/hooks/useBestTimes", () => ({
  useBestTimes: () => ({ bestTimes: [], loading: false, error: null, loadBestTimes: vi.fn() }),
}));

const STYLE_FR50 = { id: 2, name_jp: "50m自由形", distance: 50 };

let currentAuthMock: {
  user: { id: string };
  supabase: ReturnType<typeof buildSupabaseCompetitionsMock>["supabase"];
  subscription: null;
};

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

import TeamCompetitions from "@/components/team/TeamCompetitions";

const openSelfRecordForm = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  await screen.findByText(title);
  await user.click(screen.getByRole("button", { name: /自分の記録を追加|自己記録を追加/ }));
  await screen.findByTestId("record-form-modal");
};

const getSubmitButton = () =>
  screen.queryByTestId("update-record-button") ?? screen.getByTestId("save-record-button");

function makeRow(overrides: { title: string; poolType: 0 | 1 }) {
  return {
    id: "competition-1",
    user_id: "member-1",
    team_id: "team-1",
    title: overrides.title,
    date: "2026-08-01",
    place: "県営プール",
    pool_type: overrides.poolType,
    entry_status: "before",
    note: null,
    created_at: "2026-07-20T00:00:00Z",
    created_by: "member-1",
    users: { name: "選手A" },
    created_by_user: null,
    entries: [
      { id: "entry-1", user_id: "member-1", style_id: 2, entry_time: 29.8, users: { name: "選手A" } },
    ],
    records: [
      {
        id: "record-existing-1",
        time: 30.5,
        user_id: "member-1",
        style_id: 2,
        is_relaying: false,
        note: "",
        reaction_time: null,
        video_path: null,
        users: { name: "選手A" },
      },
    ],
  };
}

describe("TeamCompetitions — 自分の記録の保存 (既存記録 UPDATE) と records.pool_type 自己修復 (D-6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRecord.mockResolvedValue({ id: "record-new" });
    mocks.updateRecord.mockResolvedValue({ id: "record-existing-1" });
    mocks.createSplitTimes.mockResolvedValue(undefined);
    mocks.getStyles.mockResolvedValue([STYLE_FR50]);
  });

  it("[D-6/V-11] 長水路(1)の大会で既存記録を保存すると、records.pool_type が 1 に揃う", async () => {
    const row = makeRow({ title: "長水路大会", poolType: 1 });
    currentAuthMock = {
      user: { id: "member-1" },
      supabase: buildSupabaseCompetitionsMock([row]).supabase,
      subscription: null,
    };
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
    await openSelfRecordForm(user, "長水路大会");

    await screen.findByTestId("record-time-1");
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(mocks.updateRecord).toHaveBeenCalledWith(
        "record-existing-1",
        expect.objectContaining({ pool_type: 1 }),
      );
    });
  });

  it("[D-6/V-11] 短水路(0)の大会で既存記録を保存すると、records.pool_type が 0 に揃う (誤って長水路化しない)", async () => {
    const row = makeRow({ title: "短水路大会", poolType: 0 });
    currentAuthMock = {
      user: { id: "member-1" },
      supabase: buildSupabaseCompetitionsMock([row]).supabase,
      subscription: null,
    };
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
    await openSelfRecordForm(user, "短水路大会");

    await screen.findByTestId("record-time-1");
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(mocks.updateRecord).toHaveBeenCalledWith(
        "record-existing-1",
        expect.objectContaining({ pool_type: 0 }),
      );
    });
  });
});
