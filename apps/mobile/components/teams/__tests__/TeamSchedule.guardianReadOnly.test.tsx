// =============================================================================
// TeamSchedule.guardianReadOnly.test.tsx
// =============================================================================
//
// 保護者版 (閲覧専用) の予定タブでは、書き込みに進むボタンを出さない。
//
//   [GR-1] 練習カード: 「記録追加」ボタンを出さない (カードを押してタイムを見るのは残す)
//   [GR-2] 大会カード (今日・過去): 「記録追加」ボタンを出さない
//   [GR-3] 大会カード (未来): 「エントリー」ボタンは一覧を見るだけなので残す
//   [GR-4] エントリー一覧: 受付中でも「エントリーを追加」を出さない
//   どのケースも、保護者でなければ今まで通りボタンが出ることを対で確かめる。
//
// 書き込み自体は DB 側 (guardian_read_only_guard トリガ) で拒否されるので、
// ここでは「押せるボタンが出ないこと」だけを見る。
// =============================================================================

import React from "react";
import { addDays, format, subDays } from "date-fns";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQuery as render } from "@/__tests__/helpers/testUtils";
import type { Competition, Practice } from "@swim-hub/shared/types";

const mocks = vi.hoisted(() => ({
  isGuardian: false,
  getEntriesByCompetition: vi.fn(async () => []),
}));

vi.mock("@/hooks/useIsGuardian", () => ({
  useIsGuardian: () => mocks.isGuardian,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: {}, user: { id: "u-1" } })),
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: vi.fn(() => ({ navigate: vi.fn() })),
}));

vi.mock("@apps/shared/hooks/queries/records", () => ({
  useUpdateCompetitionMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    getEntriesByCompetition = mocks.getEntriesByCompetition;
    deleteEntry = vi.fn();
  },
}));

import { PracticeItem } from "../TeamPracticeList";
import { CompetitionItem } from "../TeamCompetitionList";
import { TeamCompetitionEntryModal } from "../TeamCompetitionEntryModal";

const noop = () => {};

const practice = {
  id: "p-1",
  user_id: "admin-1",
  date: "2026-11-20",
  title: "通常練習",
  place: "区民プール",
  note: null,
  team_id: "team-1",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
} as unknown as Practice;

function makeCompetition(date: string): Competition {
  return {
    id: "c-1",
    title: "区民水泳大会",
    date,
    place: "総合体育館",
    pool_type: 0,
    note: null,
    team_id: "team-1",
    entry_status: "open",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  } as unknown as Competition;
}

function renderPracticeItem() {
  return render(
    <PracticeItem
      practice={practice}
      isAdmin={false}
      onEdit={noop}
      onDelete={noop}
      onAddLog={noop}
      onOpenTimes={noop}
      isDeleting={false}
      deleteDisabled={false}
    />,
  );
}

function renderCompetitionItem(date: string) {
  return render(
    <CompetitionItem
      competition={makeCompetition(date)}
      teamId="team-1"
      isAdmin={false}
      onEdit={noop}
      onDelete={noop}
      onEntry={noop}
      onRecord={noop}
      onOpenRecords={noop}
      isDeleting={false}
      deleteDisabled={false}
    />,
  );
}

const today = format(new Date(), "yyyy-MM-dd");
const past = format(subDays(new Date(), 7), "yyyy-MM-dd");
const future = format(addDays(new Date(), 14), "yyyy-MM-dd");

beforeEach(() => {
  mocks.isGuardian = false;
});

describe("保護者版の予定タブ — 書き込みに進むボタンを出さない", () => {
  describe("[GR-1] 練習カード", () => {
    it("保護者には「記録追加」を出さない", () => {
      mocks.isGuardian = true;
      renderPracticeItem();
      expect(screen.getByText("通常練習")).toBeDefined();
      expect(screen.queryByText("記録追加")).toBeNull();
    });

    it("保護者でなければ「記録追加」を出す", () => {
      renderPracticeItem();
      expect(screen.getByText("記録追加")).toBeDefined();
    });
  });

  describe("[GR-2] 大会カード (今日・過去)", () => {
    it.each([
      ["今日", today],
      ["過去", past],
    ])("%s の大会: 保護者には「記録追加」を出さない", (_label, date) => {
      mocks.isGuardian = true;
      renderCompetitionItem(date);
      expect(screen.getByText("区民水泳大会")).toBeDefined();
      expect(screen.queryByText("記録追加")).toBeNull();
    });

    it("保護者でなければ「記録追加」を出す", () => {
      renderCompetitionItem(past);
      expect(screen.getByText("記録追加")).toBeDefined();
    });
  });

  describe("[GR-3] 大会カード (未来)", () => {
    it("保護者にも「エントリー」(一覧を見るだけ) は出す", () => {
      mocks.isGuardian = true;
      renderCompetitionItem(future);
      expect(screen.getByText("エントリー")).toBeDefined();
    });
  });

  describe("[GR-4] エントリー一覧", () => {
    const modalProps = {
      visible: true,
      onClose: noop,
      competitionId: "c-1",
      competitionTitle: "区民水泳大会",
      entryStatus: "open" as const,
      isAdmin: false,
      onSelfEntry: noop,
      onEditEntry: noop,
      onAdminBulkEntry: noop,
    };

    it("受付中でも、保護者には「エントリーを追加」を出さない", async () => {
      mocks.isGuardian = true;
      render(<TeamCompetitionEntryModal {...modalProps} />);
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());
      expect(screen.queryByText("エントリーを追加")).toBeNull();
    });

    it("保護者でなければ、受付中は「エントリーを追加」を出す", async () => {
      render(<TeamCompetitionEntryModal {...modalProps} />);
      await waitFor(() => expect(mocks.getEntriesByCompetition).toHaveBeenCalled());
      expect(screen.getByText("エントリーを追加")).toBeDefined();
    });
  });
});
