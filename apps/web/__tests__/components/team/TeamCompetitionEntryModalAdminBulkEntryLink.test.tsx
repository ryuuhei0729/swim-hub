/**
 * TeamCompetitionEntryModal — モーダル内導線の admin/非admin 分岐 (web, 要件B後半 / D6)
 *
 * Sprint Contract: `sprint-contract.md` D6, R6, R5(web は現状維持), Out of Scope
 * 検証観点 (Verification Checklist): V-W-06
 *
 * QA Phase A: このファイルはスケルトンのみ。アサーションの実装は Phase B (実装完了後) で行う。
 *
 * 【インターフェース契約】
 * - セレクタ: `data-testid="team-competition-entry-self-button"` (非admin時) /
 *   `data-testid="team-competition-entry-bulk-button"` (admin時)
 * - 非admin: 既存キー `selfEntryButton` = 「種目をエントリー」(mobile は既存 / web は今回新規追加)
 * - admin: 新規キー `adminBulkEntryButton` = 「エントリーを代理入力」
 * - admin が押すと `/teams/{teamId}/competitions/{competitionId}/entries` へ遷移する。
 *   D6 注意: web は `/teams/[teamId]` (isAdmin=false) と `/teams-admin/[teamId]` (isAdmin=true)
 *   で別ルート。遷移後の戻り先が teams-admin 起点なら teams-admin に戻ること (既知の債務あり、
 *   `project_swimhub_admin_return_path_teams_admin` 参照)。
 * - R5 (web): カードにプルダウンが無く、モーダル内 `<select>` (status 変更) が唯一の変更手段
 *   なので**現状維持**。本ファイルはその `<select>` には触れない
 *   (既存 TeamCompetitionEntryModalOtherAdminCompetition.test.tsx が担保)。
 * - Out of Scope: 遷移先の `TeamEntryBulkFormScreen` 相当ページ (`entries` ページ) 自体の
 *   UI 変更はスコープ外。本ファイルは「遷移が起きること」のみを検証する。
 * - デッドコード (`EntryForm`/`useTeamEntry`/`TeamEntrySection`) は復活させないこと (R6)。
 *   セルフエントリー導線自体が現在存在しないため、この機能は全て新規。
 */

import { describe, it, vi, beforeEach } from "vitest";

// Phase B で render/screen (`renderWithI18n as render, screen` from "../../utils/render")、
// `userEvent` ("@testing-library/user-event")、expect (vitest) を追加すること
// (it.todo のみの間は未使用 import になるため今は入れない)。

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

// TODO(Phase B): team_memberships.role を admin/user で切り替える supabase モックを用意する。

describe("TeamCompetitionEntryModal — モーダル内導線の admin/非admin 分岐 (web)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("[V-W-06] SC6: 非admin は「種目をエントリー」/ admin は「エントリーを代理入力」", () => {
    it.todo("非admin (entry_status='open') は data-testid=team-competition-entry-self-button が表示される");
    it.todo(
      "admin (entry_status='open') は self-button ではなく data-testid=team-competition-entry-bulk-button が表示される",
    );
    it.todo(
      "admin が bulk-button を押すと /teams/{teamId}/competitions/{competitionId}/entries (isAdmin=false 起点) へ遷移する",
    );
    it.todo(
      "[D6注意] teams-admin 起点で開いた場合は /teams-admin/{teamId}/... へ遷移する (戻り先の既知債務との整合)",
    );
    it.todo("entry_status が open 以外のとき、admin/非admin いずれもボタン自体が表示されない");
  });
});
