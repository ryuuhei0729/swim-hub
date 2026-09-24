/**
 * RecordClient — MemberSelectModal に渡す selectedUserIds の参照安定化 (修正C 回帰ガード)
 *
 * Sprint Contract 検証観点 [WV-19, Reviewer Critical 2 由来]:
 *   共有 `MemberSelectModal` は `useEffect([isOpen, selectedUserIds], ...)` で
 *   `selectedUserIds` prop を tempSelected に同期する。この依存配列は参照比較
 *   (Object.is) のため、`selectedUserIds` が **内容が同じでも新しい配列インスタンス**
 *   として渡ると毎回発火し、モーダルを開いたままユーザーが行った未確定のチップ選択
 *   (tempSelected) を、開いた瞬間の値に巻き戻してしまう。
 *
 *   修正前の RecordClient は
 *     `styleEntries.find(...).memberRecords.map((mr) => mr.memberUserId) ?? []`
 *   をインラインで JSX に書いていたため、styleEntries に触れない無関係な
 *   state 更新 (動画アップロードモーダルを開く等) でも RecordClient が
 *   再レンダリングされるたびに新しい配列インスタンスが作られていた。
 *   修正C はこれを `useMemo(..., [styleEntries, currentStyleEntryId])` で
 *   安定化した (`currentStyleEntrySelectedUserIds`)。
 *
 * このテストは「styleEntries に触れない無関係な再レンダリング」を実際に
 * RecordClient 上で発生させる (動画選択ボタンをクリックして videoUploadModal
 * state を更新する。styleEntries を経由しないため useMemo の依存配列は
 * 変化しない) ことで、モーダルを閉じずに再現する。
 *
 * モック方針: recordClientNonSwimmerRegression.test.tsx と同一
 * (buildRecordSaveSupabaseMock、next-intl は key の恒等関数)。
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
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

const STYLE_BREAST_50: Style = {
  id: 9,
  name_jp: "平泳ぎ50m",
  name: "Breaststroke",
  style: "Br",
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
  { id: "user-1", user_id: "user-1", role: "admin", is_swimmer: true, users: { id: "user-1", name: "太郎", gender: 0 } },
  { id: "user-2", user_id: "user-2", role: "user", is_swimmer: true, users: { id: "user-2", name: "次郎", gender: 0 } },
] as unknown as Parameters<typeof RecordClient>[0]["members"];

const existingRecords = [
  {
    id: "record-1",
    user_id: "user-1",
    style_id: 2,
    time: 30.0,
    video_path: null,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: null,
    team_id: "team-1",
    split_times: [],
    users: { id: "user-1", name: "太郎", gender: 0 },
    styles: { id: 2, name_jp: "自由形50m", distance: 50 },
  },
] as unknown as Parameters<typeof RecordClient>[0]["existingRecords"];

// WV-21: 2つの種目エントリー (A: 自由形50m, B: 平泳ぎ50m) を持つ fixture。
// A でモーダルを開いたまま B 側を編集し、A の選択が巻き戻らないことを確認する
const existingRecordsTwoEntries = [
  {
    id: "record-a",
    user_id: "user-1",
    style_id: 2,
    time: 30.0,
    video_path: null,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: null,
    team_id: "team-1",
    split_times: [],
    users: { id: "user-1", name: "太郎", gender: 0 },
    styles: { id: 2, name_jp: "自由形50m", distance: 50 },
  },
  {
    id: "record-b",
    user_id: "user-1",
    style_id: 9,
    time: 40.0,
    video_path: null,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: null,
    team_id: "team-1",
    split_times: [],
    users: { id: "user-1", name: "太郎", gender: 0 },
    styles: { id: 9, name_jp: "平泳ぎ50m", distance: 50 },
  },
] as unknown as Parameters<typeof RecordClient>[0]["existingRecords"];

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

function renderRecordClientTwoEntries() {
  return render(
    <RecordClient
      teamId="team-1"
      competitionId="comp-1"
      competition={baseCompetition}
      teamName="テストチーム"
      members={members}
      existingRecords={existingRecordsTwoEntries}
      styles={[STYLE_FREE_50, STYLE_BREAST_50]}
      entries={[]}
      bestTimesByUser={{}}
    />,
  );
}

describe("RecordClient — selectedUserIds の参照安定化 [WV-19]", () => {
  beforeEach(() => {
    fake = buildRecordSaveSupabaseMock();
    mocks.push.mockClear();
  });

  it(
    "[WV-19] モーダルを開いたままチップをトグルした後、styleEntries に触れない" +
      "無関係な再レンダリング (動画選択ボタン押下) が起きても、トグルした選択が" +
      "巻き戻らない（人間の意図: 修正Cの回帰ガード。selectedUserIds の参照が" +
      "無関係な再レンダリングのたびに新しくなると、共有モーダルの useEffect が" +
      "誤発火して未確定の選択を破棄してしまう）",
    () => {
      renderRecordClient();

      fireEvent.click(screen.getByRole("button", { name: "メンバーを選択" }));

      // 次郎 (まだ選ばれていない候補) を選択する
      const jiroChip = screen.getByRole("button", { name: "次郎" });
      expect(jiroChip).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(jiroChip);
      expect(screen.getByRole("button", { name: "次郎" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      // styleEntries に触れない無関係な state 更新を発生させる
      // (動画選択ボタン。videoUploadModal は styleEntries と独立した state)
      fireEvent.click(screen.getByRole("button", { name: /videoSelect/ }));

      // 無関係な再レンダリングを経ても、次郎の選択が巻き戻っていない
      expect(screen.getByRole("button", { name: "次郎" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    },
  );

  it(
    "[WV-21] モーダルを開いたまま、別の種目エントリー (B) の入力値が更新されても、" +
      "現在編集中のエントリー (A) で行ったチップ選択が巻き戻らない（人間の意図: 修正Fの" +
      "回帰ガード。修正C ([styleEntries, currentStyleEntryId]) は styleEntries 全体を" +
      "依存に持つため、A 以外の種目エントリー (B) がタイム入力等で更新されただけでも" +
      "styleEntries の参照が変わり、A の memberRecords の中身が同じでも" +
      "selectedUserIds が新しい配列インスタンスとして再計算されてしまう残存経路が" +
      "あった (Reviewer指摘)。二段 useMemo による文字列キー経由の安定化で、" +
      "この経路でも配列参照が変わらないことを確認する）",
    () => {
      renderRecordClientTwoEntries();

      // A (自由形50m) のメンバー選択モーダルを開く (1つ目の「メンバーを選択」ボタン)
      const selectMemberButtons = screen.getAllByRole("button", { name: "メンバーを選択" });
      expect(selectMemberButtons.length).toBe(2);
      fireEvent.click(selectMemberButtons[0]!);

      const jiroChip = screen.getByRole("button", { name: "次郎" });
      expect(jiroChip).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(jiroChip);
      expect(screen.getByRole("button", { name: "次郎" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      // B (平泳ぎ50m) のタイム入力を編集する (A とは別のエントリーの setStyleEntries を
      // 発火させる。styleEntries の参照は変わるが A の memberRecords の中身は変わらない)
      const timeInputs = screen.getAllByPlaceholderText("timePlaceholder");
      expect(timeInputs.length).toBe(2);
      fireEvent.change(timeInputs[1]!, { target: { value: "41.23" } });

      // B の更新後も、A のモーダルで選んだ次郎の選択が巻き戻っていない
      expect(screen.getByRole("button", { name: "次郎" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    },
  );
});
