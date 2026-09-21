/**
 * TeamCompetitionEntryModal — 種目見出しの件数単位「件」付与 (web, 要件C / D8)
 *
 * Sprint Contract: `sprint-contract.md` D8
 * 検証観点 (Verification Checklist): V-W-07
 *
 * QA Phase A: このファイルはスケルトンのみ。アサーションの実装は Phase B (実装完了後) で行う。
 *
 * 【インターフェース契約】
 * - 現状 (TeamCompetitionEntryModal.tsx:378) はハードコードで
 *   `{style?.name_jp} ({entries.length})` になっている。
 * - i18n キー `styleGroupHeader` = `"{style} ({count}件)"` (両名前空間 `teams.competitionEntryModal.*`
 *   に PM が5ロケール全て追加済み) を経由するよう置換する。
 * - `{style}` は `style.name_jp ?? unknownStyle`、`{count}` はその種目のエントリー件数。
 * - 0件・複数件でも崩れない (0件は emptyNoEntry 側の表示と両立するかは実装依存だが、
 *   種目ヘッダー自体が0件のグループを描画するケースがあるなら "(0件)" も検証する)。
 */

import { describe, it, vi, beforeEach } from "vitest";

// Phase B で render/screen (`renderWithI18n as render, screen` from "../../utils/render")、
// expect (vitest)、および jaMessages/enMessages/deMessages/koMessages/zhMessages
// (`@apps/shared/messages/{ja,en,de,ko,zh}.json`) を追加すること
// (it.todo のみの間は未使用 import になるため今は入れない)。

const mocks = vi.hoisted(() => ({
  getEntriesByCompetition: vi.fn(),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({
    getEntriesByCompetition: mocks.getEntriesByCompetition,
  })),
}));

// TODO(Phase B): team_memberships / competitions の supabase モックを用意する。

describe("TeamCompetitionEntryModal — 種目見出しの件数単位 (web)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("[V-W-07] SC7: 「{style} ({count}件)」形式", () => {
    it.todo("1件のとき「50m自由形 (1件)」の形式で表示される (旧「(1)」ではない)");
    it.todo("複数件のとき「... (3件)」のように件数が崩れず表示される");
    it.todo("[境界値] 0件のグループが存在する場合でも「(0件)」表示が崩れない (該当UIがあれば)");

    // Phase A メモ: 空 body の it.each は「何も検証せず green になる」偽陽性の危険が
    // あるため (feedback_swimhub_nothing_ran_looks_green)、Phase B で実装するまでは
    // it.todo に留める。実装時は [jaMessages, enMessages, deMessages, koMessages, zhMessages]
    // (import 済み、上記5定数) を1件ずつ resolveKey で解決して検証する。
    it.todo("[5ロケール] teams.competitionEntryModal.styleGroupHeader キーが存在し {style}/{count} を含む");
  });
});
