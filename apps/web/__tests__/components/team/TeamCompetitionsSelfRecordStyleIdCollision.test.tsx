/**
 * TeamCompetitions — 自己記録導線: styleId ベースの entry 突合の衝突リスク検証 (PM 指摘 R1)
 *
 * RecordLogForm.tsx は entryDataList[index] ではなく
 * `entryDataList.find(e => String(e.styleId) === formData.styleId)` で
 * エントリー情報 (エントリータイムバッジ) を対応付けている。
 *
 * この実装は「カード削除で index が詰れても正しいエントリーに対応する」という
 * V-SR-07 の要件は満たすが、Dev の設計コメントは
 * 「entries.style_id にユニーク制約があるため安全」としている。
 * しかし実際の schema (supabase/migrations/20251201014342_initial_schema.sql) の
 * entries テーブルには style_id への UNIQUE 制約が存在しない。
 *
 * さらに RecordLogEntry の種目距離/泳法ボタンは、ユーザーが1つのカードの種目を
 * 別カードと同じ種目に変更することを一切ブロックしない。
 * このテストは、ユーザーが種目ピッカーで2枚目のカードの種目を1枚目と同じ種目
 * (50m自由形) に変更した場合の実際の挙動を実測する (PM 指摘 R1 の検証)。
 *
 * 結果: 両カードが同じ entry (エントリータイム 29.80) のバッジを表示する
 * (「誤って別の種目のバッジを表示する」ような値の破損ではなく、
 * 「同じ種目を選んだカードが2枚とも同じバッジを表示する」という重複表示)。
 * データ破損ではないが、Dev のコメントの前提 (DB unique constraint) は誤りであり、
 * 将来 addFormData 経路が UI に配線された場合に同じ問題が再燃しうるため Warning とする。
 */

import React from "react";
import { renderWithI18n as render, screen } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSupabaseCompetitionsMock } from "../../utils/supabaseCompetitionsMock";

vi.mock("@apps/shared/api/teams/records", () => ({
  TeamRecordsAPI: vi.fn().mockImplementation(() => ({
    update: vi.fn(),
    remove: vi.fn(),
    create: vi.fn(),
  })),
}));

const mocks = vi.hoisted(() => ({
  createRecord: vi.fn(),
  createSplitTimes: vi.fn(),
  updateRecord: vi.fn(),
  getStyles: vi.fn(),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    createRecord: mocks.createRecord,
    createSplitTimes: mocks.createSplitTimes,
    updateRecord: mocks.updateRecord,
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
const STYLE_BA100 = { id: 13, name_jp: "100m背泳ぎ", distance: 100 };

let currentAuthMock: {
  user: { id: string };
  supabase: ReturnType<typeof buildSupabaseCompetitionsMock>["supabase"];
  subscription: null;
};

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => currentAuthMock,
}));

import TeamCompetitions from "@/components/team/TeamCompetitions";

const TWO_ENTRY_ROW = {
  id: "competition-1",
  user_id: "member-1",
  team_id: "team-1",
  title: "県大会",
  date: "2026-08-01",
  place: "県営プール",
  entry_status: "before",
  note: null,
  created_at: "2026-07-20T00:00:00Z",
  created_by: "member-1",
  users: { name: "選手A" },
  created_by_user: null,
  records: [],
  entries: [
    { id: "entry-1", user_id: "member-1", style_id: 2, entry_time: 29.8, users: { name: "選手A" } },
    { id: "entry-2", user_id: "member-1", style_id: 13, entry_time: 75.0, users: { name: "選手A" } },
  ],
};

const openSelfRecordForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByText("県大会");
  await user.click(screen.getByRole("button", { name: /自分の記録を追加|自己記録を追加/ }));
  await screen.findByTestId("record-form-modal");
};

describe("TeamCompetitions — styleId 突合の衝突リスク (R1, 実測)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRecord.mockResolvedValue({ id: "record-new" });
    mocks.updateRecord.mockResolvedValue({ id: "record-existing" });
    mocks.createSplitTimes.mockResolvedValue(undefined);
    mocks.getStyles.mockResolvedValue([STYLE_FR50, STYLE_BA100]);
    currentAuthMock = {
      user: { id: "member-1" },
      supabase: buildSupabaseCompetitionsMock([TWO_ENTRY_ROW]).supabase,
      subscription: null,
    };
  });

  it(
    "[R1] カード2の種目をカード1と同じ50m自由形に変更すると、両カードに" +
      "同じエントリータイムバッジ(29.80)が重複表示される(データ破損ではないが重複表示)",
    async () => {
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      await screen.findByTestId("record-entry-section-1");
      await screen.findByTestId("record-entry-section-2");

      // 変更前: カード1のみ29.80のバッジ、カード2は75.00(1:15.00)のバッジ
      const section1Before = screen.getByTestId("record-entry-section-1");
      const section2Before = screen.getByTestId("record-entry-section-2");
      expect(section1Before.textContent).toContain("29.80");
      expect(section2Before.textContent).toContain("1:15.00");

      // カード2の距離ボタンを50mに変更 → codeKey継承ロジックにより
      // styleId が自動的にカード1と同じ50m自由形(id=2)になる
      await user.click(screen.getByTestId("record-style-distance-2-50"));

      const section2After = screen.getByTestId("record-entry-section-2");
      // 実測: カード2にもカード1と同じ29.80のバッジが出現する(重複)。
      // 元の75.00(1:15.00)のバッジは種目変更により消える。
      expect(section2After.textContent).toContain("29.80");
      expect(section2After.textContent).not.toContain("1:15.00");
    },
  );
});
