/**
 * TeamCompetitionEntryModal — 種目見出しの件数単位「件」付与 (mobile, 要件C / D8)
 *
 * Sprint Contract: `sprint-contract.md` D8
 * 検証観点 (Verification Checklist): V-M-07
 *
 * 【インターフェース契約】
 * - i18n キー `styleGroupHeader` = `"{style} ({count}件)"`
 *   (名前空間 `teams.mobile.teamCompetitionEntryModal.*`) を経由して描画する。
 * - `{style}` は `group.style?.name_jp ?? unknownStyle`、`{count}` はその種目のエントリー件数。
 */

import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import deMessages from "@apps/shared/messages/de.json";
import koMessages from "@apps/shared/messages/ko.json";
import zhMessages from "@apps/shared/messages/zh.json";

const mocks = vi.hoisted(() => ({
  getEntriesByCompetition: vi.fn(),
  supabase: {},
  user: { id: "u-1" } as { id: string } | null,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase, user: mocks.user })),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    getEntriesByCompetition = mocks.getEntriesByCompetition;
  },
}));

import { TeamCompetitionEntryModal } from "../TeamCompetitionEntryModal";

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  id: "e-1",
  team_id: "team-1",
  competition_id: "c-1",
  user_id: "u-1",
  style_id: 1,
  entry_time: null,
  note: null,
  created_at: "2026-06-15T10:00:00Z",
  updated_at: "2026-06-15T10:00:00Z",
  style: { id: 1, name_jp: "50m自由形", distance: 50 },
  user: { id: "u-1", name: "山田太郎" },
  competition: {},
  ...overrides,
});

const baseProps = {
  visible: true,
  onClose: vi.fn(),
  competitionId: "c-1",
  competitionTitle: "春季大会",
  entryStatus: "open" as const,
  isAdmin: false,
  onSelfEntry: vi.fn(),
  onEditEntry: vi.fn(),
  onAdminBulkEntry: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: "u-1" };
});

describe("TeamCompetitionEntryModal — 種目見出しの件数単位 (mobile)", () => {
  describe("[V-M-07] SC7: 「{style} ({count}件)」形式", () => {
    it("1件のとき「50m自由形 (1件)」の形式で表示される (旧「(1)」ではない)", async () => {
      mocks.getEntriesByCompetition.mockResolvedValue([makeEntry({ id: "e-1" })]);
      render(<TeamCompetitionEntryModal {...baseProps} />);

      await waitFor(() => expect(screen.getByText("50m自由形 (1件)")).toBeDefined());
      expect(screen.queryByText("50m自由形 (1)")).toBeNull();
    });

    it("複数件のとき「... (3件)」のように件数が崩れず表示される", async () => {
      mocks.getEntriesByCompetition.mockResolvedValue([
        makeEntry({ id: "e-1", user: { id: "u-1", name: "選手1" } }),
        makeEntry({ id: "e-2", user_id: "u-2", user: { id: "u-2", name: "選手2" } }),
        makeEntry({ id: "e-3", user_id: "u-3", user: { id: "u-3", name: "選手3" } }),
      ]);
      render(<TeamCompetitionEntryModal {...baseProps} />);

      await waitFor(() => expect(screen.getByText("50m自由形 (3件)")).toBeDefined());
    });

    it("0件 (エントリーなし) のときは種目見出し自体が描画されず、空状態メッセージが表示される", async () => {
      mocks.getEntriesByCompetition.mockResolvedValue([]);
      render(<TeamCompetitionEntryModal {...baseProps} />);

      await waitFor(() =>
        expect(screen.getByText("まだエントリーがありません")).toBeDefined(),
      );
      expect(screen.queryByText(/\(0件\)/)).toBeNull();
    });

    it("[5ロケール] teams.mobile.teamCompetitionEntryModal.styleGroupHeader キーが存在し {style}/{count} を含む", () => {
      const localeMessages: Record<string, unknown> = {
        ja: jaMessages,
        en: enMessages,
        de: deMessages,
        ko: koMessages,
        zh: zhMessages,
      };
      for (const [locale, messages] of Object.entries(localeMessages)) {
        const value = (
          (messages as Record<string, Record<string, Record<string, string>>>).teams?.mobile
            ?.teamCompetitionEntryModal as Record<string, string> | undefined
        )?.styleGroupHeader;
        expect(value, `${locale} に styleGroupHeader が存在しない`).toBeDefined();
        expect(value, `${locale} の styleGroupHeader に {style} が無い`).toContain("{style}");
        expect(value, `${locale} の styleGroupHeader に {count} が無い`).toContain("{count}");
      }
    });
  });
});
