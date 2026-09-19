/**
 * RecordClient — 0行 UPDATE 検知時の INSERT フォールバック (web)
 * (QA Sprint Contract Phase B / 修正ラウンド 2026-09-17・High #2)
 *
 * PostgREST は UPDATE の対象行が0件でもエラーを返さない (DELETE で実証済みの
 * 既知挙動と同じ)。別セッションが保存直前に同じ行を削除していた場合、
 * `.update(payload).eq("id", id).select("id")` は `{ data: [], error: null }` を
 * 返す。旧実装はこれを検知できず、入力が無言で失われていた (High #2)。
 *
 * [新High] 検証観点:
 *   1. 0行 UPDATE を検知したら INSERT にフォールバックし、ユーザーの入力
 *      (タイム等) が失われないこと
 *   2. 正常系 (対象行が実在する) では UPDATE のまま処理され、
 *      フォールバックが誤発火して重複行を作らないこと
 *
 * トートロジー防止: フォールバックの発火条件はモック側 (`updateMatchedRows`)
 * が制御し、production のフォールバック判定ロジックをテスト内に再実装しない。
 * 観測するのはあくまで「INSERT が呼ばれたか・payload に入力値が残っているか」。
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

const STYLE_FREE_50: Style = {
  id: 2,
  name_jp: "自由形50m",
  name: "Freestyle",
  style: "Fr",
  distance: 50,
};

const baseCompetition = {
  id: "comp-heron",
  user_id: "user-1",
  team_id: "team-heron",
  title: "サギ記録会",
  date: "2026-01-07",
  end_date: null,
  place: null,
  pool_type: 0 as const,
  note: null,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
  team: { id: "team-heron", name: "サギ" },
};

const members = [
  {
    id: "user-1",
    user_id: "user-1",
    role: "admin",
    users: { id: "user-1", name: "選手A", gender: 0 },
  },
];

const existingRecords = [
  {
    id: "record-existing-1",
    user_id: "user-1",
    style_id: 2,
    time: 30.5,
    video_path: null,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: null,
    team_id: "team-heron",
    split_times: [],
    users: { id: "user-1", name: "選手A" },
    styles: { id: 2, name_jp: "自由形50m", distance: 50 },
  },
];

function renderRecordClient() {
  return render(
    <RecordClient
      teamId="team-heron"
      competitionId="comp-heron"
      competition={baseCompetition}
      teamName="サギ"
      members={members}
      existingRecords={existingRecords}
      styles={[STYLE_FREE_50]}
      entries={[]}
      bestTimesByUser={{}}
    />,
  );
}

function clickSave() {
  fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));
}

beforeEach(() => {
  mocks.push.mockClear();
});

describe("[新High] 0行 UPDATE 検知時の INSERT フォールバック (web)", () => {
  it("対象行が別セッションで削除済み (0行 UPDATE) でも、ユーザーの入力は INSERT で保存される (無言で消えない)", async () => {
    fake = buildRecordSaveSupabaseMock({
      // record-existing-1 への UPDATE を「0行ヒット」に固定する
      updateMatchedRows: (table) => (table === "records" ? [] : undefined),
    });

    renderRecordClient();
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-heron?tab=competitions"),
    );

    const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
    expect(recordUpdates).toHaveLength(1);
    expect(recordUpdates[0]?.eq).toEqual([{ column: "id", value: "record-existing-1" }]);

    // 0行だったのでフォールバックの INSERT が発生し、フォームの入力値がそのまま書かれる
    const recordInserts = fake.insertCalls.filter((c) => c.table === "records");
    expect(recordInserts).toHaveLength(1);
    expect((recordInserts[0]?.payload as { time: number }).time).toBe(30.5);
    expect((recordInserts[0]?.payload as { user_id: string }).user_id).toBe("user-1");
  });

  it("対照: 対象行が実在する正常系では UPDATE のまま処理され、フォールバックの INSERT は発生しない (誤発火しない)", async () => {
    // updateMatchedRows を指定しない = デフォルト (.eq("id", v) があれば1行ヒット)
    fake = buildRecordSaveSupabaseMock();

    renderRecordClient();
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-heron?tab=competitions"),
    );

    expect(fake.updateCalls.filter((c) => c.table === "records")).toHaveLength(1);
    expect(fake.insertCalls.filter((c) => c.table === "records")).toHaveLength(0);
  });
});
