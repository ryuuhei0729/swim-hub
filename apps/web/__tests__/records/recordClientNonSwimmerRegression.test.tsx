/**
 * Issue #49 QA テスト (Phase A スケルトン): RecordClient の非泳者回帰テスト (R4)
 *
 * Sprint Contract 検証観点:
 *   PM裁定(Issue #49コメント, R4) が名指しした危険箇所を検証する。
 *   `RecordClient.tsx` は `members` (TeamMember[]) を
 *     1. `memberGenderByUserId` (:190) — リレーの性別区分 prefill
 *     2. `confirmMemberSelection` 内の `members.find` (:1613付近) — 新規追加メンバーの名前解決
 *     3. インラインの選手選択モーダル (:2127付近) `members.map` — 候補一覧のチェックボックス
 *   の複数箇所で共用している。`members` 自体を非泳者除外フィルタに通すと、
 *   候補一覧だけでなく上記1・2も巻き込んで壊れる。
 *
 *   [V-11-01] 「メンバーを選択」モーダルの候補一覧には非泳者が表示されず、泳者は表示される
 *   [V-11-02] 既存記録を持つ非泳者メンバーの参加者バッジ (memberName) が
 *             引き続き正しい名前で表示される (buildStyleEntriesFromExisting は
 *             members を経由せず existingRecords.users.name を直接使うため、
 *             members のフィルタ有無に関わらず表示は保たれるはずという回帰防止の基準点)
 *
 * モック方針: 既存 apps/web/__tests__/records/recordSaveGuard.test.tsx の
 * buildRecordSaveSupabaseMock ヘルパーと fixture 構造を踏襲する。
 * 契約: RecordClient の TeamMember (ローカル interface) は `is_swimmer: boolean` を持つ
 * (Phase A 時点では型に無いため fixture は `as unknown as` でキャストする)。
 *
 * [チップ化スプリント 追記] インラインの選手選択モーダルは共有 MemberSelectModal
 * (checkbox → 選択チップ `<button aria-pressed>`) に統合される (PM裁定W1)。
 * [V-11-01] の検証意図「非泳者が候補一覧に出ない」は変えず、チップ (button) 依存の
 * クエリに書き直す。
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Style } from "@apps/shared/types";
import {
  buildRecordSaveSupabaseMock,
  type RecordSaveSupabaseMock,
} from "../utils/supabaseRecordSaveMock";
import RecordClient from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/RecordClient";

vi.mock("@/components/video/TeamVideoUploader", () => ({
  default: () => null,
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

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

let fake: RecordSaveSupabaseMock;

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: fake.supabase, subscription: null }),
}));

const STYLE_FREE_50: Style = {
  id: 2,
  name_jp: "自由形50m",
  name: "Freestyle",
  style: "Fr",
  distance: 50,
};

const baseCompetition = {
  id: "comp-1",
  user_id: "user-1",
  team_id: "team-1",
  title: "テスト大会",
  date: "2026-01-01",
  end_date: null,
  place: null,
  pool_type: 0 as const,
  note: null,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
  team: { id: "team-1", name: "チーム" },
};

const members = [
  { id: "user-1", user_id: "user-1", role: "admin", is_swimmer: true, users: { id: "user-1", name: "選手A", gender: 0 } },
  { id: "user-2", user_id: "user-2", role: "user", is_swimmer: false, users: { id: "user-2", name: "非泳者B", gender: 0 } },
] as unknown as Parameters<typeof RecordClient>[0]["members"];

function renderRecordClient(existingRecords: Parameters<typeof RecordClient>[0]["existingRecords"]) {
  return render(
    <RecordClient
      teamId="team-1"
      competitionId="comp-1"
      competition={baseCompetition}
      teamName="テストチーム"
      members={members}
      existingRecords={existingRecords}
      styles={[STYLE_FREE_50]}
      entries={[]}
      bestTimesByUser={{}}
    />,
  );
}

describe("RecordClient — 非泳者回帰テスト (R4)", () => {
  beforeEach(() => {
    fake = buildRecordSaveSupabaseMock();
    mocks.push.mockClear();
  });

  it("[V-11-01] 「メンバーを選択」モーダルの候補一覧には泳者のみが表示される", () => {
    renderRecordClient([]);

    fireEvent.click(screen.getByRole("button", { name: "メンバーを選択" }));

    // [チップ化スプリント] 候補一覧は選択チップ (button, aria-pressed) として描画される。
    // 「非泳者B」がチップとして存在しないことを直接確認する (Issue #49 の回帰防止そのもの)
    const swimmerChip = screen.getByRole("button", { name: "選手A" });
    expect(swimmerChip).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "非泳者B" })).not.toBeInTheDocument();
  });

  it("[V-11-02] 既存記録を持つ非泳者メンバーの参加者バッジが正しい名前で表示される (members に依存しない経路の回帰防止)", () => {
    const existingRecords = [
      {
        id: "record-1",
        user_id: "user-2",
        style_id: 2,
        time: 32.0,
        video_path: null,
        note: null,
        is_relaying: false,
        reaction_time: null,
        pool_type: null,
        team_id: "team-1",
        split_times: [],
        users: { id: "user-2", name: "非泳者B", gender: 0 },
        styles: { id: 2, name_jp: "自由形50m", distance: 50 },
      },
    ];

    renderRecordClient(existingRecords);

    // 参加者バッジやメンバー選択欄など複数箇所に同名が出現しうるため、
    // 「1件も無い (=名前解決が壊れている)」ことだけを red 条件として厳密に区別する
    expect(screen.getAllByText("非泳者B").length).toBeGreaterThan(0);
  });
});
