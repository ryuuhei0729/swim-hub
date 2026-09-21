/**
 * TeamCompetitions — `routeIsAdmin` 配線の検証 (追加スプリント: 代理入力の戻り先が起点と食い違う)
 *
 * Reviewer 指摘 (Medium): `TeamCompetitionEntryModal*.test.tsx` は全て
 * `TeamCompetitionEntryModal` を直接 render し `routeIsAdmin` を明示的に渡しているため、
 * `TeamCompetitions.tsx` の `routeIsAdmin={isAdmin}` という**配線自体**は検証されていない。
 * `routeIsAdmin` は必須 boolean prop なので「渡し忘れ」は tsc が検出するが、
 * `routeIsAdmin={!isAdmin}` のような**符号反転**や別変数への取り違えは tsc にも既存テストにも
 * 検出されない。
 *
 * このテストは `TeamCompetitionEntryModal` をモック化し、`TeamCompetitions` が実際に
 * どの値を `routeIsAdmin` prop に渡しているかを直接観測する
 * (既存 `TeamCompetitionsCardEntryButtonAdminUnify.test.tsx` と同じモック方式)。
 *
 * 両方向 (isAdmin=false→routeIsAdmin=false, isAdmin=true→routeIsAdmin=true) を
 * 1テスト内で assert する。片方向だけでは符号反転 (`!isAdmin`) を検出できないため。
 */

import React from "react";
import { renderWithI18n as render, screen, cleanup } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { addDays, format } from "date-fns";

const FUTURE_DATE = format(addDays(new Date(), 5), "yyyy-MM-dd");

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

describe("TeamCompetitions — routeIsAdmin 配線の検証 (符号反転・取り違え検出)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it(
    "isAdmin={false} (利用者ルート相当) では routeIsAdmin=false、" +
      "isAdmin={true} (管理者ルート相当) では routeIsAdmin=true が" +
      "TeamCompetitionEntryModal に渡る（両方向を1テストでassertし、符号反転 [!isAdmin] を検出する）",
    async () => {
      const user = userEvent.setup();

      // --- 利用者ルート相当: isAdmin=false ---
      currentAuthMock = {
        user: { id: "member-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ id: "c-member-route", title: "利用者ルート検証大会" }),
        ]),
      };
      const { unmount } = render(<TeamCompetitions teamId="team-1" isAdmin={false} />);

      await screen.findByText("利用者ルート検証大会");
      await user.click(screen.getByRole("button", { name: "エントリー" }));

      expect(mocks.entryModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ isOpen: true, routeIsAdmin: false }),
      );
      // 符号反転の直接検出: true では絶対に呼ばれていないこと
      expect(mocks.entryModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ isOpen: true, routeIsAdmin: true }),
      );

      unmount();
      vi.clearAllMocks();

      // --- 管理者ルート相当: isAdmin=true ---
      currentAuthMock = {
        user: { id: "admin-1" },
        supabase: buildSupabaseMock([
          buildCompetitionRow({ id: "c-admin-route", title: "管理者ルート検証大会" }),
        ]),
      };
      render(<TeamCompetitions teamId="team-1" isAdmin={true} />);

      await screen.findByText("管理者ルート検証大会");
      await user.click(screen.getByRole("button", { name: "エントリー" }));

      expect(mocks.entryModalSpy).toHaveBeenCalledWith(
        expect.objectContaining({ isOpen: true, routeIsAdmin: true }),
      );
      // 符号反転の直接検出: false では絶対に呼ばれていないこと
      expect(mocks.entryModalSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ isOpen: true, routeIsAdmin: false }),
      );
    },
  );
});
