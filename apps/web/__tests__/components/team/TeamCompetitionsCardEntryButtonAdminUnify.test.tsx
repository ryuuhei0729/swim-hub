/**
 * TeamCompetitions — 大会カードの「エントリー」ボタン統一 (web, 要件B前半 / D4, R4)
 *
 * Sprint Contract: `sprint-contract.md` D4, R4
 * 検証観点 (Verification Checklist): V-W-05
 *
 * 【インターフェース契約 / PM 裁定】
 * - R4: web も mobile と同じ構成に統一する。admin 専用「エントリー入力」ボタン
 *   (`entryBulkInputButton`) はカードから撤去済み (実測: `TeamCompetitions.tsx` に
 *   `entryBulkInputButton`/「エントリー入力」への参照は存在しない)。
 * - admin が最初に見るカードボタンは「エントリー」(非admin と同じラベル・同じ
 *   TeamCompetitionEntryModal を開く) になる。
 * - R9 (実測, `TeamCompetitions.tsx:1090-1104`):
 *   `(isAdmin || !isCompetitionDateInPast(competition.date))` — 統合後も admin は
 *   過去日でも「エントリー」ボタンを見られる (旧・撤去済みボタンが isAdmin のみで
 *   ガードされ日付制限が無かったことと対称にする措置。過去大会への代理入力到達能力を
 *   維持するための意図的な設計であり、Reviewer 指摘の Critical はこの R9 で解消済み)。
 *
 * 【既存テストとの関係 (QA Phase A 棚卸し結果)】
 * `TeamCompetitionsEntryButtonPastDate.test.tsx:168-183` ([V-06]) は
 * 「admin でも過去日ならエントリーボタンは表示されない」の非退行確認の中で
 * `getByRole("button", { name: "エントリー入力" })).toBeDefined()` を pin している。
 * これは本 Deliverable で撤去された admin 専用ボタンを指しているため書き換えが必要だが、
 * Reviewer から「D4 で admin の過去大会への到達経路が失われた可能性がある」との
 * Critical 指摘があり、PM が実測で裁定するまで該当ファイルの書き換えは保留中。
 * 本ファイルはその保留とは独立して、R4 の新仕様 (admin/非admin 同一ボタン) を検証する。
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { addDays, format, subDays } from "date-fns";

const NOW = new Date();
const PAST_DATE = format(subDays(NOW, 5), "yyyy-MM-dd");
const FUTURE_DATE = format(addDays(NOW, 5), "yyyy-MM-dd");

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const mocks = vi.hoisted(() => ({
  entryModalSpy: vi.fn(),
}));

vi.mock("../../../components/team/TeamCompetitionEntryModal", () => ({
  default: (props: Record<string, unknown>) => {
    mocks.entryModalSpy(props);
    return props.isOpen ? <div data-testid="entry-modal-stub" /> : null;
  },
}));
vi.mock("../../../components/team/TeamCompetitionRecordsModal", () => ({ default: () => null }));
vi.mock("@/components/forms/CompetitionBasicForm", () => ({ default: () => null }));

function buildCompetitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "competition-1",
    user_id: "member-1",
    team_id: "team-1",
    title: "対象大会",
    date: FUTURE_DATE,
    place: "県営プール",
    pool_type: 0,
    entry_status: "open",
    note: null,
    created_at: "2026-07-20T00:00:00Z",
    created_by: "member-1",
    users: { name: "選手A" },
    created_by_user: null,
    records: [],
    entries: [],
    ...overrides,
  };
}

function buildSupabaseMock(rows: ReturnType<typeof buildCompetitionRow>[]) {
  const fromMock = vi.fn(() => ({
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) {
        return { eq: () => Promise.resolve({ count: rows.length, error: null }) };
      }
      return {
        eq: () => ({
          order: () => ({
            range: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      };
    },
  }));
  return { from: fromMock };
}

let currentAuthMock: { user: { id: string }; supabase: ReturnType<typeof buildSupabaseMock> };

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

import TeamCompetitions from "@/components/team/TeamCompetitions";

describe("TeamCompetitions — 大会カードのエントリーボタン統一 (admin/非admin 同一導線, web)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAuthMock = {
      user: { id: "member-1" },
      supabase: buildSupabaseMock([]),
    };
  });

  describe("[V-W-05] SC5: admin が最初に見るボタンが「エントリー」であり、同じモーダルが開く", () => {
    it("admin ビューのカードで最初に表示されるボタンのラベルが「エントリー」である", async () => {
      currentAuthMock = {
        user: { id: "admin-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ date: FUTURE_DATE, title: "admin統一検証大会" }),
        ]),
      };
      render(<TeamCompetitions teamId="team-1" isAdmin={true} />);

      await screen.findByText("admin統一検証大会");
      expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
    });

    it("admin がそのボタンを押すと、非admin と同じ TeamCompetitionEntryModal が isOpen: true で開く", async () => {
      currentAuthMock = {
        user: { id: "admin-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ id: "c-admin-open", date: FUTURE_DATE, title: "admin遷移検証大会" }),
        ]),
      };
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={true} />);

      await screen.findByText("admin遷移検証大会");
      expect(screen.queryByTestId("entry-modal-stub")).toBeNull();

      await user.click(screen.getByRole("button", { name: "エントリー" }));

      expect(screen.getByTestId("entry-modal-stub")).toBeDefined();
      expect(mocks.entryModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          isOpen: true,
          competitionId: "c-admin-open",
        }),
      );
    });

    it("[回帰] admin 専用の「エントリー入力」ボタン (entryBulkInputButton) はカード上に存在しない", async () => {
      currentAuthMock = {
        user: { id: "admin-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ date: FUTURE_DATE, title: "admin回帰検証大会" }),
        ]),
      };
      render(<TeamCompetitions teamId="team-1" isAdmin={true} />);

      await screen.findByText("admin回帰検証大会");
      expect(screen.queryByRole("button", { name: "エントリー入力" })).toBeNull();
    });

    it("[非退行] 非admin のカードのエントリーボタンの見た目・遷移は変わらない", async () => {
      currentAuthMock = {
        user: { id: "member-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ id: "c-nonadmin", date: FUTURE_DATE, title: "非admin検証大会" }),
        ]),
      };
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

      await screen.findByText("非admin検証大会");
      await user.click(screen.getByRole("button", { name: "エントリー" }));

      expect(mocks.entryModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ isOpen: true, competitionId: "c-nonadmin" }),
      );
    });

    // R9 (実測): admin は過去日でも「エントリー」ボタンが見える (代理入力への到達能力維持)。
    // 非admin は過去日で従来どおり非表示 (TeamCompetitionsEntryButtonPastDate.test.tsx [V-01] と同じ)。
    it("[R9/非退行] admin は過去日でも「エントリー」ボタンが表示される (過去大会への到達能力維持)", async () => {
      currentAuthMock = {
        user: { id: "admin-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ date: PAST_DATE, title: "admin過去大会検証" }),
        ]),
      };
      render(<TeamCompetitions teamId="team-1" isAdmin={true} />);

      await screen.findByText("admin過去大会検証");
      expect(screen.getByRole("button", { name: "エントリー" })).toBeDefined();
    });
  });
});
