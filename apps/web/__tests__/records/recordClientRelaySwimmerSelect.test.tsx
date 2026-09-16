/**
 * Issue #49 QA テスト (Phase B 追加 → PM裁定により V-11-03 を Phase B 2周目で修正):
 * RecordClient のリレー泳者選択 <select> の非泳者除外
 *
 * PM裁定 (2026-09-16, 2周目): RecordClient.tsx のリレー泳者選択 <select> (:1628付近) にも
 * excludeNonSwimmers が適用されている (Web Dev がスコープを広げた箇所)。
 * 「記録入力候補として一貫性があり妥当」と裁定済み。
 *
 * ## V-11-03 修正の経緯
 * 当初の V-11-03 は「泳ぐ太郎を含む**全ての** select は非泳者花子を含んではならない」
 * という期待値だったが、これは V-11-04 (Critical: 既存の割り当ては表示を維持する) と
 * 同一フィクスチャ上で論理的に両立不可能だった。leg3 (既に非泳者 user-2 が
 * 割り当て済み) は withCurrentSelection() の union パターンにより意図的に
 * 泳ぐ太郎 (候補) と 非泳者花子 (現在の割り当て) の両方を含む必要があるため。
 *
 * 正しい仕様 (PM裁定): 「**非泳者は、自分が現在割り当てられていない select の
 * 候補には出ない**」。単に期待値を緩めて「全部潰しただけ」にしないよう、
 * 「割り当て済みレグには出る」「未割り当てレグには出ない」を対で厳密に検証する。
 *
 * 検証観点:
 *   [V-11-03] 非泳者は、自分が現在割り当てられているレグの <select> にのみ候補として現れ、
 *             割り当てられていない他のレグの <select> には現れない
 *   [V-11-04] Critical (修正済み・green): 既に非泳者としてリレーの1レグに割り当て済みの
 *             メンバーがいる場合、その <select> の表示値が維持される
 *             (withCurrentSelection() の union パターンで解消)
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Style } from "@apps/shared/types";
import {
  buildRecordSaveSupabaseMock,
  type RecordSaveSupabaseMock,
} from "../utils/supabaseRecordSaveMock";
import RecordClient from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/RecordClient";

vi.mock("@/components/video/TeamVideoUploader", () => ({ default: () => null }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
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

const STYLE_FREE_50: Style = { id: 2, name_jp: "自由形50m", name: "Freestyle", style: "Fr", distance: 50 };

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
  { id: "user-1", user_id: "user-1", role: "user", is_swimmer: true, users: { id: "user-1", name: "泳ぐ太郎", gender: 0 } },
  { id: "user-2", user_id: "user-2", role: "user", is_swimmer: false, users: { id: "user-2", name: "非泳者花子", gender: 1 } },
] as unknown as Parameters<typeof RecordClient>[0]["members"];

// 4x50mフリーリレー (relay_4x50_free): leg0=非リレー扱い + leg1-3=リレーフラグ、
// legStyleIds全て2 (50m自由形)。leg3 に非泳者 (user-2) を割り当て済みとする。
const relayLeg = (id: string, legIndex: number, isRelaying: boolean, userId: string) => ({
  id,
  user_id: userId,
  style_id: 2,
  time: 30.0,
  video_path: null,
  note: null,
  is_relaying: isRelaying,
  reaction_time: null,
  pool_type: null,
  team_id: "team-1",
  split_times: [],
  users: { id: userId, name: userId === "user-2" ? "非泳者花子" : "泳ぐ太郎", gender: 0 },
  styles: { id: 2, name_jp: "自由形50m", distance: 50 },
});

const existingRecords = [
  relayLeg("leg-0", 0, false, "user-1"),
  relayLeg("leg-1", 1, true, "user-1"),
  relayLeg("leg-2", 2, true, "user-1"),
  relayLeg("leg-3", 3, true, "user-2"),
];

function renderRecordClient() {
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

describe("RecordClient — リレー泳者選択の非泳者除外 (Phase B 追加)", () => {
  beforeEach(() => {
    fake = buildRecordSaveSupabaseMock();
    mocks.push.mockClear();
  });

  it("[V-11-03] 非泳者は、自分が現在割り当てられているレグの select にのみ出る (割り当て済み/未割り当てを対で検証)", () => {
    renderRecordClient();

    const selects = screen.getAllByRole("combobox") as unknown as HTMLSelectElement[];
    // 4レグ分のリレー泳者選択 select のみを対象にする (スタイル選択 select を除外する目印として
    // 泳ぐ太郎=user-1 を候補に持つことを使う。user-1 は全レグで候補提示される)
    const legSelects = selects.filter((el) =>
      Array.from(el.options).some((o) => o.value === "user-1"),
    );
    expect(legSelects).toHaveLength(4);

    // fixture: leg0-2 は user-1 (泳者) が割り当て済み、leg3 だけ user-2 (非泳者) が割り当て済み
    const assignedToNonSwimmer = legSelects.filter((el) => el.value === "user-2");
    const assignedToSwimmer = legSelects.filter((el) => el.value === "user-1");
    expect(assignedToNonSwimmer).toHaveLength(1);
    expect(assignedToSwimmer).toHaveLength(3);

    // 正: 非泳者が現在割り当てられているレグの select には、非泳者花子が候補に出る
    for (const select of assignedToNonSwimmer) {
      const optionTexts = Array.from(select.options).map((o) => o.textContent);
      expect(optionTexts).toContain("非泳者花子");
    }

    // 負: 非泳者が割り当てられていない他のレグの select には、非泳者花子は出ない
    for (const select of assignedToSwimmer) {
      const optionTexts = Array.from(select.options).map((o) => o.textContent);
      expect(optionTexts).not.toContain("非泳者花子");
    }
  });

  it("[V-11-04 Critical] 既に非泳者が割り当て済みのリレーレグの <select> は、その選手が選択されたまま表示される (受け入れ基準「既存記録の表示は維持する」)", () => {
    renderRecordClient();

    const selects = screen.getAllByRole("combobox") as unknown as HTMLSelectElement[];
    const legSelects = selects.filter((el) =>
      Array.from(el.options).some((o) => o.textContent === "泳ぐ太郎" || o.value === "user-1"),
    );

    // leg3 (非泳者 user-2 が割り当て済み) に対応する select が
    // 引き続き "user-2" を選択した状態で表示されていること。
    // 【実測 (2026-09-16, 1周目)】excludeNonSwimmers を <option> 一覧に適用すると、
    // 既に非泳者が割り当て済みのレグは value も選択候補から消え、
    // ブラウザは先頭の空プレースホルダー (value="") を表示してしまう Critical だった。
    // 【修正確認 (2026-09-16, 2周目)】withCurrentSelection() の union パターン
    // (候補 ∪ 現在の割り当て値) により解消済み。このテストは green である。
    const assignedToNonSwimmer = legSelects.find((el) => el.value === "user-2");
    expect(
      assignedToNonSwimmer,
      "非泳者が割り当て済みのリレーレグの <select> value が 'user-2' のままであること",
    ).toBeDefined();
  });
});
