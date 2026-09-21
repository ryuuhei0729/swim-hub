/**
 * TeamCompetitions — 大会カードの「エントリー」ボタン統一 (web, 要件B前半 / D4, R4)
 *
 * Sprint Contract: `sprint-contract.md` D4, R4
 * 検証観点 (Verification Checklist): V-W-05
 *
 * QA Phase A: このファイルはスケルトンのみ。アサーションの実装は Phase B (実装完了後) で行う。
 *
 * 【インターフェース契約 / PM 裁定】
 * - R4: web も mobile と同じ構成に統一する。admin 専用「エントリー入力」ボタン
 *   (`teams.competitions.card.entryBulkInputButton`, TeamCompetitions.tsx:986-1000 付近)
 *   を**カードから撤去**し、モーダル内ボタン (TeamCompetitionEntryModalAdminBulkEntryLink.test.tsx
 *   側で検証) へ移す。
 * - admin が最初に見るカードボタンは「エントリー」(非admin と同じラベル・同じ
 *   TeamCompetitionEntryModal を開く) になる。
 *
 * 【既存テストとの関係 (QA Phase A 棚卸し結果)】
 * - `TeamCompetitionsEntryButtonPastDate.test.tsx:168-183` ([V-06]) は
 *   「admin でも過去日ならエントリーボタンは表示されない」の非退行確認の中で
 *   `getByRole("button", { name: "エントリー入力" })).toBeDefined()` を pin している。
 *   本 Deliverable によりこの admin 専用ボタンはカードから消えるため、この行は
 *   Phase B で「本物の退行」ではなく「仕様変更による期待値更新」として書き換えが必要
 *   (PM 判定済み事項として本ファイルでは重複実装しない)。
 */

import React from "react";
import { describe, it, vi, beforeEach } from "vitest";

// Phase B で render/screen (`renderWithI18n as render, screen` from "../../utils/render")
// と expect (vitest) を追加すること (it.todo のみの間は未使用 import になるため今は入れない)。

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

// TODO(Phase B): TeamCompetitionsEntryButtonPastDate.test.tsx と同型の
// buildCompetitionRow / buildSupabaseMock / currentAuthMock をここに用意する。

describe("TeamCompetitions — 大会カードのエントリーボタン統一 (admin/非admin 同一導線, web)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("[V-W-05] SC5: admin が最初に見るボタンが「エントリー」であり、同じモーダルが開く", () => {
    it.todo("admin ビューのカードで最初に表示されるボタンのラベルが「エントリー」である");
    it.todo(
      "admin がそのボタンを押すと、非admin と同じ TeamCompetitionEntryModal が isOpen: true で開く",
    );
    it.todo(
      "[回帰] admin 専用の「エントリー入力」ボタン (entryBulkInputButton) はカード上に存在しない",
    );
    it.todo("[非退行] 非admin のカードのエントリーボタンの見た目・遷移は変わらない");
  });
});
