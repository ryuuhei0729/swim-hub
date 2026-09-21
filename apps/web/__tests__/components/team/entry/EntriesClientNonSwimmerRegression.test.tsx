/**
 * Issue #49 QA テスト (Phase A スケルトン): EntriesClient の非泳者回帰テスト (R4)
 *
 * Sprint Contract 検証観点:
 *   PM裁定(Issue #49コメント, R4) が名指しした危険箇所そのものを検証する。
 *   `EntriesClient.tsx` は `activeMembers` (MemberSelectOption[]) を
 *     1. `isMemberActive` (:166-167) — 「退会済み (mobile.retiredMemberBadge)」バッジの判定
 *     2. `createEmptyRow` (:169-170) — 新規行の名前解決
 *     3. `<MemberSelectModal members={activeMembers}>` (:739) — 選手選択候補
 *   の3箇所すべてで共用している。もし Developer が「候補提示の直前」ではなく
 *   `activeMembers` 自体を非泳者除外フィルタに通してしまうと、既存エントリーを
 *   持つ非泳者メンバーの isMemberActive が false 判定になり、
 *   実際にはチームに在籍している非泳者に「退会済み」の誤バッジが付く
 *   (在籍情報と混同する実害あり)。
 *
 *   [V-10-01] 既存エントリーを持つ非泳者メンバーのカードに「退会済み」バッジが
 *             表示されない (isMemberActive が生の activeMembers を参照し続けている
 *             ことの回帰防止)
 *   [V-10-02] 「選手を選択」モーダルの候補一覧には非泳者が表示されず、泳者は表示される
 *             (候補提示の直前だけがフィルタされていることの確認)
 *
 * モック方針: 既存 EntriesClient.test.tsx と同一 (EntryAPI 丸ごとモック、
 * next-intl は useTranslations を key の恒等関数に差し替える)。
 * 契約: activeMembers の要素 (MemberSelectOption) は `is_swimmer: boolean` を持つ
 * (Phase A 時点では型に無いため、テストの fixture は `as unknown as MemberSelectOption`
 * でキャストする)。
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BestTime, Style } from "@apps/shared/types";
import EntriesClient, {
  type ExistingEntryDisplay,
} from "../../../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_client/EntriesClient";
import type { MemberSelectOption } from "@/components/team/MemberSelectModal";

const mocks = vi.hoisted(() => ({
  createBulkEntries: vi.fn().mockResolvedValue([]),
  updateEntry: vi.fn().mockResolvedValue({}),
  deleteBulkEntries: vi.fn().mockResolvedValue(undefined),
  push: vi.fn(),
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: vi.fn().mockImplementation(() => ({
    createBulkEntries: mocks.createBulkEntries,
    updateEntry: mocks.updateEntry,
    deleteBulkEntries: mocks.deleteBulkEntries,
  })),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "admin-1" }, supabase: {} }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    useTranslations: () => ((key: string) => key) as unknown as ReturnType<
      typeof original.useTranslations
    >,
    useLocale: () => "ja",
  };
});

const STYLE_FREE_100: Style = {
  id: 3,
  name_jp: "自由形100m",
  name: "Freestyle",
  style: "Fr",
  distance: 100,
};

const baseCompetition = {
  id: "comp-1",
  title: "テスト大会",
  date: "2999-01-01",
  place: null,
  pool_type: 0 as const,
  entry_status: "open" as const,
  teamName: "テストチーム",
};

const activeMembers = [
  { user_id: "user-1", role: "user", name: "選手A", is_swimmer: true },
  { user_id: "user-2", role: "user", name: "非泳者B", is_swimmer: false },
] as unknown as MemberSelectOption[];

function renderEntriesClient(existingEntries: ExistingEntryDisplay[]) {
  return render(
    <EntriesClient
      teamId="team-1"
      competitionId="comp-1"
      competition={baseCompetition}
      activeMembers={activeMembers}
      existingEntries={existingEntries}
      styles={[STYLE_FREE_100]}
      bestTimesByUser={{} as Record<string, BestTime[]>}
      returnOrigin="admin"
    />,
  );
}

describe("EntriesClient — 非泳者回帰テスト (R4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[V-10-01] 既存エントリーを持つ非泳者メンバーに「退会済み」バッジが誤って付かない", () => {
    const existingEntries: ExistingEntryDisplay[] = [
      {
        id: "entry-Y",
        user_id: "user-2",
        style_id: 3,
        entry_time: 60.5,
        note: null,
        targetUserName: "非泳者B",
      },
    ];

    renderEntriesClient(existingEntries);

    // 選手カードのヘッダーに名前が出ていること (正のコントロール)
    expect(screen.getByText("非泳者B")).toBeInTheDocument();
    // 「退会済み」バッジ (t("mobile.retiredMemberBadge") はモックにより恒等文字列を返す)
    expect(screen.queryByText("mobile.retiredMemberBadge")).not.toBeInTheDocument();
  });

  it("[V-10-02] 「選手を選択」モーダルの候補一覧には泳者のみが表示される", () => {
    renderEntriesClient([]);

    fireEvent.click(screen.getByRole("button", { name: "record.selectMemberButton" }));

    // BaseModal はダイアログとしてレンダリングされる想定。候補一覧のチェックボックス群から
    // 名前を探す (モーダル内テキストとして厳密に確認する)。
    const checkboxes = screen.getAllByRole("checkbox");
    // 少なくとも1件は表示されている (正のコントロール)
    expect(checkboxes.length).toBeGreaterThan(0);

    expect(screen.getByText("選手A")).toBeInTheDocument();
    expect(screen.queryByText("非泳者B")).not.toBeInTheDocument();
  });

  it("[V-10-02 補助] 非泳者が既にエントリー済みの場合でも、候補一覧 (追加用) には出ない", () => {
    // 既存エントリーが有る=カードは表示される (V-10-01) が、
    // 「選手を選択」モーダルの候補一覧 (新規追加用) にはやはり出ない、という
    // 二重の確認 (activeMembers を直接フィルタしていないことの検算)
    const existingEntries: ExistingEntryDisplay[] = [
      {
        id: "entry-Y",
        user_id: "user-2",
        style_id: 3,
        entry_time: 60.5,
        note: null,
        targetUserName: "非泳者B",
      },
    ];

    renderEntriesClient(existingEntries);

    fireEvent.click(screen.getByRole("button", { name: "record.selectMemberButton" }));

    // モーダル内のチェックボックス候補として「選手A」は出るが「非泳者B」は出ない。
    // 既存カードの見出し (非泳者B) と混同しないよう、チェックボックス付きラベル要素に限定する。
    const checkboxes = screen.getAllByRole("checkbox");
    const labelTexts = checkboxes.map((cb) => cb.closest("label")?.textContent ?? "");
    expect(labelTexts.some((text) => text.includes("選手A"))).toBe(true);
    expect(labelTexts.some((text) => text.includes("非泳者B"))).toBe(false);
  });
});
