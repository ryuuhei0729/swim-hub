/**
 * TeamCompetitionEntryModal — モーダル内導線の admin/非admin 分岐 (web, 要件B後半 / D6)
 *
 * Sprint Contract: `sprint-contract.md` D6, R6, R5(web は現状維持), Out of Scope
 * 検証観点 (Verification Checklist): V-W-06
 *
 * 【インターフェース契約】
 * - セレクタ: `data-testid="team-competition-entry-self-button"` (非admin時) /
 *   `data-testid="team-competition-entry-bulk-button"` (admin時)
 * - 非admin: `selfEntryButton` = 「エントリーを追加」(D10改訂で web/mobile 共通の文言に更新済み)
 * - admin: `adminBulkEntryButton` = 「エントリーを代理入力」
 * - admin が押すと `/teams/{teamId}/competitions/{competitionId}/entries` へ遷移する
 *   (`TeamCompetitionEntryModal.tsx:317-319` の `handleAdminBulkEntryClick`、実測で
 *   常に `/teams/...` 固定であることを確認済み。呼び出し元ルートを判別する仕組みは無い)。
 * - R5 (web): カードにプルダウンが無く、モーダル内 `<select>` (status 変更) が唯一の変更手段
 *   なので現状維持。本ファイルはその `<select>` には触れない
 *   (既存 TeamCompetitionEntryModalOtherAdminCompetition.test.tsx が担保)。
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  getEntriesByCompetition: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
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
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u-1" } } }),
    },
  };
}

let currentAuthMock: { supabase: ReturnType<typeof buildSupabaseMock> };

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

import TeamCompetitionEntryModal from "@/components/team/TeamCompetitionEntryModal";

const makeCompetitionRow = (overrides: Record<string, unknown> = {}) => ({
  team_id: "team-1",
  title: "春季大会",
  date: "2099-01-01",
  place: "県営プール",
  entry_status: "open",
  ...overrides,
});

function renderModal(role: "admin" | "user", entryStatus: "before" | "open" | "closed" = "open") {
  currentAuthMock = {
    supabase: buildSupabaseMock({
      competitions: { data: makeCompetitionRow({ entry_status: entryStatus }), error: null },
      team_memberships: { data: { role }, error: null },
    }),
  };
  return render(
    <TeamCompetitionEntryModal
      isOpen={true}
      onClose={vi.fn()}
      competitionId="c-1"
      competitionTitle="春季大会"
      teamId="team-1"
      onOpenSelfEntry={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getEntriesByCompetition.mockResolvedValue([]);
});

describe("TeamCompetitionEntryModal — モーダル内導線の admin/非admin 分岐 (web)", () => {
  describe("[V-W-06] SC6: 非admin は「エントリーを追加」/ admin は「エントリーを代理入力」", () => {
    it("非admin (entry_status='open') は data-testid=team-competition-entry-self-button が表示される", async () => {
      renderModal("user", "open");

      const selfButton = await screen.findByTestId("team-competition-entry-self-button");
      expect(selfButton).toHaveTextContent("エントリーを追加");
      expect(screen.queryByTestId("team-competition-entry-bulk-button")).not.toBeInTheDocument();
    });

    it("admin (entry_status='open') は self-button ではなく data-testid=team-competition-entry-bulk-button が表示される", async () => {
      renderModal("admin", "open");

      const bulkButton = await screen.findByTestId("team-competition-entry-bulk-button");
      expect(bulkButton).toHaveTextContent("エントリーを代理入力");
      expect(screen.queryByTestId("team-competition-entry-self-button")).not.toBeInTheDocument();
    });

    it("admin が bulk-button を押すと /teams/{teamId}/competitions/{competitionId}/entries へ遷移する", async () => {
      const user = userEvent.setup();
      renderModal("admin", "open");

      const bulkButton = await screen.findByTestId("team-competition-entry-bulk-button");
      await user.click(bulkButton);

      expect(mocks.push).toHaveBeenCalledWith("/teams/team-1/competitions/c-1/entries");
    });

    // [D6注意/既知債務] handleAdminBulkEntryClick は呼び出し元 (`/teams/` vs `/teams-admin/`)
    // を判別する手段を持たず、常に `/teams/{teamId}/...` へ push する (実測済み、上記テストで
    // 検証済み)。「teams-admin 起点なら teams-admin に戻る」という戻り先の理想動作は
    // `project_swimhub_admin_return_path_teams_admin` の既知債務として未解決のままで、
    // Sprint Contract 自身が「既知の債務あり」と明記し Out of Scope
    // (代理一括入力ページ自体の UI 変更) の外側にある。モーダルには起点を区別する prop も
    // 状態も存在しないため、この観点だけを単体で検証する意味のあるテストを構成できない。
    // バグを仕様として固定するリスクを避けるため、実装可能になるまで todo に留める。
    it.todo(
      "[D6注意/既知債務] teams-admin 起点で開いた場合に teams-admin へ戻る導線があるべきだが、" +
        "モーダルは起点を判別する手段を持たず未解決 (project_swimhub_admin_return_path_teams_admin)",
    );

    // 実装実測 (TeamCompetitionEntryModal.tsx:443-451, コメント明記):
    // 非admin の self-button は canEditOrDeleteEntry (entry_status==="open" かつ未来日) で
    // ガードされるが、admin の bulk-button は「カードから移設した旧ボタンと同じ挙動」を
    // 意図的に維持するため entry_status によるガードを一切付けていない
    // (R9 の「admin は日付を問わず到達できる」設計と対称)。したがって「admin/非admin
    // いずれも非表示になる」という旧スケルトンの想定は現行実装と矛盾するため、
    // 非admin (ガードされる) と admin (ガードされない) を分けて検証する。
    it("entry_status が open 以外のとき、非admin の self-button は表示されない", async () => {
      renderModal("user", "before");
      await screen.findByTestId("team-competition-entry-modal");
      expect(screen.queryByTestId("team-competition-entry-self-button")).not.toBeInTheDocument();
      expect(screen.queryByTestId("team-competition-entry-bulk-button")).not.toBeInTheDocument();
    });

    it("[非退行] entry_status が open 以外でも、admin の bulk-button は表示され続ける (状態ガード無し)", async () => {
      renderModal("admin", "closed");
      const bulkButton = await screen.findByTestId("team-competition-entry-bulk-button");
      expect(bulkButton).toBeInTheDocument();
      expect(screen.queryByTestId("team-competition-entry-self-button")).not.toBeInTheDocument();
    });
  });
});
