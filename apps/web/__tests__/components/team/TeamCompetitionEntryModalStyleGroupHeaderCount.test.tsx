/**
 * TeamCompetitionEntryModal — 種目見出しの件数単位「件」付与 (web, 要件C / D8)
 *
 * Sprint Contract: `sprint-contract.md` D8
 * 検証観点 (Verification Checklist): V-W-07
 *
 * 【インターフェース契約】
 * - i18n キー `styleGroupHeader` = `"{style} ({count}件)"` (両名前空間 `teams.competitionEntryModal.*`)
 * - `{style}` は `style.name_jp ?? unknownStyle`、`{count}` はその種目のエントリー件数。
 * - `entriesByStyle` (TeamCompetitionEntryModal.tsx:190) は取得した entries から reduce で
 *   構築されるため、0件のエントリーの種目グループは構造上存在しない (0件のときは
 *   `emptyNoEntry` の空状態メッセージのみが表示される)。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import deMessages from "@apps/shared/messages/de.json";
import koMessages from "@apps/shared/messages/ko.json";
import zhMessages from "@apps/shared/messages/zh.json";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const mocks = vi.hoisted(() => ({
  getEntriesByCompetition: vi.fn(),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({
    getEntriesByCompetition: mocks.getEntriesByCompetition,
  })),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    updateCompetition: vi.fn(),
  })),
}));

type ChainResponse = { data: unknown; error: unknown };

function buildSupabaseMock(responses: Record<string, ChainResponse>) {
  const defaultResponse: ChainResponse = { data: null, error: null };
  const from = vi.fn((table: string) => {
    const response = responses[table] ?? defaultResponse;
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.single = vi.fn(() => Promise.resolve(response));
    builder.maybeSingle = vi.fn(() => Promise.resolve(response));
    return builder;
  });
  return {
    from,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }) },
  };
}

let currentAuthMock: { supabase: ReturnType<typeof buildSupabaseMock> };

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

import TeamCompetitionEntryModal from "@/components/team/TeamCompetitionEntryModal";

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  id: "e-1",
  user_id: "u-1",
  style_id: 1,
  entry_time: null,
  note: null,
  created_at: "2026-06-15T10:00:00Z",
  style: { id: 1, name_jp: "50m自由形", distance: 50 },
  user: { id: "u-1", name: "山田太郎" },
  ...overrides,
});

function renderModal() {
  currentAuthMock = {
    supabase: buildSupabaseMock({
      competitions: {
        data: { team_id: "team-1", title: "春季大会", date: "2099-01-01", place: null, entry_status: "open" },
        error: null,
      },
      team_memberships: { data: { role: "user" }, error: null },
    }),
  };
  return render(
    <TeamCompetitionEntryModal
      isOpen={true}
      onClose={vi.fn()}
      competitionId="c-1"
      competitionTitle="春季大会"
      teamId="team-1"
      routeIsAdmin={false}
      onOpenSelfEntry={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TeamCompetitionEntryModal — 種目見出しの件数単位 (web)", () => {
  describe("[V-W-07] SC7: 「{style} ({count}件)」形式", () => {
    it("1件のとき「50m自由形 (1件)」の形式で表示される (旧「(1)」ではない)", async () => {
      mocks.getEntriesByCompetition.mockResolvedValue([makeEntry({ id: "e-1" })]);
      renderModal();

      await waitFor(() => expect(screen.getByText("50m自由形 (1件)")).toBeInTheDocument());
      expect(screen.queryByText("50m自由形 (1)")).not.toBeInTheDocument();
    });

    it("複数件のとき「... (3件)」のように件数が崩れず表示される", async () => {
      mocks.getEntriesByCompetition.mockResolvedValue([
        makeEntry({ id: "e-1", user: { id: "u-1", name: "選手1" } }),
        makeEntry({ id: "e-2", user_id: "u-2", user: { id: "u-2", name: "選手2" } }),
        makeEntry({ id: "e-3", user_id: "u-3", user: { id: "u-3", name: "選手3" } }),
      ]);
      renderModal();

      await waitFor(() => expect(screen.getByText("50m自由形 (3件)")).toBeInTheDocument());
    });

    // [境界値] entriesByStyle は reduce で「実在するエントリーの種目」のみをキーに持つため
    // (TeamCompetitionEntryModal.tsx:190-220)、0件の種目グループという状態は構造上作れない。
    // 0件のときに描画されるのは種目見出しではなく emptyNoEntry の空状態メッセージであることを
    // 検証し、「該当UIが無い」ことを実測で確認する。
    it("[境界値] 0件 (エントリーなし) のときは種目見出し自体が描画されず、空状態メッセージが表示される", async () => {
      mocks.getEntriesByCompetition.mockResolvedValue([]);
      renderModal();

      await waitFor(() => expect(screen.getByText("まだエントリーがありません")).toBeInTheDocument());
      expect(screen.queryByText(/\(0件\)/)).not.toBeInTheDocument();
    });

    it("[5ロケール] teams.competitionEntryModal.styleGroupHeader キーが存在し {style}/{count} を含む", () => {
      const localeMessages: Record<string, unknown> = {
        ja: jaMessages,
        en: enMessages,
        de: deMessages,
        ko: koMessages,
        zh: zhMessages,
      };
      for (const [locale, messages] of Object.entries(localeMessages)) {
        const value = (
          (messages as Record<string, Record<string, Record<string, string>>>).teams
            ?.competitionEntryModal as Record<string, string> | undefined
        )?.styleGroupHeader;
        expect(value, `${locale} に styleGroupHeader が存在しない`).toBeDefined();
        expect(value, `${locale} の styleGroupHeader に {style} が無い`).toContain("{style}");
        expect(value, `${locale} の styleGroupHeader に {count} が無い`).toContain("{count}");
      }
    });
  });
});
