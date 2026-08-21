/**
 * TeamCompetitions — 自己記録導線: 種目カード削除 (Sprint Contract Issue2) + index 対応ズレ回帰防止
 *
 * バグ報告 (ユーザー実測):
 *   Issue 2: 「自分の記録を追加」の編集画面に、種目カードを削除するゴミ箱アイコンが無い。
 *
 * 真因 (PM 実測):
 *   - useRecordLogForm は addFormData/removeFormData を返しているが、
 *     RecordLogForm.tsx の分割代入に含まれておらず UI から呼ぶ手段が無い
 *     (components/forms/record-log/RecordLogForm.tsx:79-99)。
 *   - RecordLogEntry の TrashIcon はスプリットタイム削除専用であり、種目カード自体を
 *     削除するボタンではない (components/forms/record-log/components/RecordLogEntry.tsx)。
 *
 * 新規リスク (Planner 指摘、テストで固定する):
 *   - RecordLogForm.tsx は `entryDataList[index]` と `formDataList` を配列インデックスで
 *     対応させている。カード削除を実装すると index が詰まり、残ったカードのバッジ/種目名が
 *     別種目のデータと誤対応する恐れがある。
 *
 * Contract 上のテストID規約 (Developer 実装向け):
 *   削除ボタンの data-testid は既存の `record-split-remove-button-${sectionIndex}-${n}`
 *   (スプリットタイム削除) と同じ命名系に揃え、`record-entry-remove-button-${sectionIndex}`
 *   とする (sectionIndex = index + 1, 1始まり)。
 *
 * 実装前の現時点では red になることを期待する。
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSupabaseCompetitionsMock } from "../../utils/supabaseCompetitionsMock";

const mocks = vi.hoisted(() => ({
  createRecord: vi.fn(),
  createSplitTimes: vi.fn(),
  updateRecord: vi.fn(),
  replaceSplitTimes: vi.fn(),
  getStyles: vi.fn(),
  entryApiCtor: vi.fn(),
}));

vi.mock("@apps/shared/api/teams/records", () => ({
  TeamRecordsAPI: vi.fn().mockImplementation(() => ({
    update: vi.fn(),
    remove: vi.fn(),
    create: vi.fn(),
  })),
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    createRecord: mocks.createRecord,
    createSplitTimes: mocks.createSplitTimes,
    updateRecord: mocks.updateRecord,
    replaceSplitTimes: mocks.replaceSplitTimes,
  })),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: vi.fn().mockImplementation(() => ({
    getStyles: mocks.getStyles,
  })),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: mocks.entryApiCtor.mockImplementation(() => ({
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

// Fr (id 1-7) 50m と Ba (id 12-15) 100m — フォーマット後の文字列が互いの部分文字列に
// ならない値を選び、fixture 名の部分一致でテストがトートロジー化しないようにする
// (過去事例: "Group1" が "1" を含み誤って green になった)。
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
  // 本人が2種目エントリー済み (Fr50 / Ba100)。これらが RecordLogForm に
  // entryDataList として渡され、種目カードが2件生成される。
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

describe("TeamCompetitions — 自分の記録を追加: 種目カード削除 (Issue2)", () => {
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

  it("[V-SR-05] 種目カードごとに削除ボタンが表示され、クリックするとそのカードだけが消える", async () => {
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
    await openSelfRecordForm(user);

    await screen.findByTestId("record-entry-section-1");
    expect(screen.getByTestId("record-entry-section-2")).toBeInTheDocument();

    const removeButton1 = screen.queryByTestId("record-entry-remove-button-1");
    expect(removeButton1).toBeInTheDocument();

    await user.click(removeButton1 as HTMLElement);

    expect(screen.queryByTestId("record-entry-section-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("record-entry-section-1")).toBeInTheDocument();
  });

  it(
    "[V-SR-07] 種目1 (50Fr) を削除しても、残ったカードは種目2 (100Ba) のバッジ/タイムのまま" +
      "誤対応しない (index 詰めによるズレの回帰防止)",
    async () => {
      const user = userEvent.setup();
      render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
      await openSelfRecordForm(user);

      await screen.findByTestId("record-entry-section-1");

      // 削除前: カード1=Fr50(entryTime 29.80), カード2=Ba100(entryTime 1:15.00)
      expect(screen.getByText(/29\.80/)).toBeInTheDocument();
      expect(screen.getByText(/1:15\.00/)).toBeInTheDocument();

      const removeButton1 = screen.getByTestId("record-entry-remove-button-1");
      await user.click(removeButton1);

      // 削除後: 残る唯一のカードは元々の Ba100 (entryTime 1:15.00) のままであるべき。
      // index 詰めのバグがあると、カード2の情報がカード1のスロットにズレて表示される
      // だけで済むこともあるが、その場合でも Fr50 の 29.80 は消えているべきで、
      // Ba100 の情報 (100m の種目距離ボタンが選択状態) が保持されていることを確認する。
      expect(screen.queryByText(/29\.80/)).not.toBeInTheDocument();
      expect(screen.getByText(/1:15\.00/)).toBeInTheDocument();

      const remainingDistance100Button = screen.getByTestId("record-style-distance-1-100");
      expect(remainingDistance100Button).toHaveAttribute("aria-pressed", "true");
    },
  );

  it("[V-SR-06] 種目カードを削除しても entries テーブルの API は一切呼ばれない (ローカル操作のみ)", async () => {
    const user = userEvent.setup();
    render(<TeamCompetitions teamId="team-1" isAdmin={false} />);
    await openSelfRecordForm(user);

    await screen.findByTestId("record-entry-section-1");
    const removeButton1 = screen.getByTestId("record-entry-remove-button-1");
    await user.click(removeButton1);

    // 残ったカードにタイムを入力して保存しても、entries API には触れない
    const timeInput = screen.getByTestId("record-time-1");
    await user.type(timeInput, "1.15.00");
    await user.click(screen.getByTestId("save-record-button"));

    await waitFor(() => {
      expect(mocks.createRecord).toHaveBeenCalled();
    });
    expect(mocks.entryApiCtor).not.toHaveBeenCalled();
  });
});
