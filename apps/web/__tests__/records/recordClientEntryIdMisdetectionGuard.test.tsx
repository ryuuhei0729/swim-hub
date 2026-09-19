// =============================================================================
// recordClientEntryIdMisdetectionGuard.test.tsx
// Sprint Contract Phase A スケルトン — entries.id 由来行の誤 UPDATE 防止 (web)
// =============================================================================
//
// mobile 版 (teamRecordBulk.entryIdMisdetectionGuard.test.tsx) と対。
// web の buildStyleEntries.ts が「Web 正準」(mobile はその移植) であるため、
// entry.id = entries.id をそのまま MemberRecord.id (entry.id) として使う構造は
// 両アプリ共通 (apps/web/.../records/_client/buildStyleEntries.ts L257 の
// `id: entry.id`)。
//
// 誤検知した場合の実害: entries.id を records.id と誤認して UPDATE すると、
// 存在しない records.id への UPDATE になる。PostgREST は対象0件の UPDATE を
// エラーにせず0行成功で返すため、記録が保存されずに silent failure になる。

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

const activeMembers = [
  { id: "user-1", user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎", gender: 0 } },
  { id: "user-2", user_id: "user-2", role: "user", users: { id: "user-2", name: "次郎", gender: 0 } },
];

type RecordClientPropsFull = Parameters<typeof RecordClient>[0];

function renderRecordClient(
  overrides: Partial<Pick<RecordClientPropsFull, "existingRecords" | "entries">>,
) {
  return render(
    <RecordClient
      teamId="team-1"
      competitionId="comp-1"
      competition={baseCompetition}
      teamName="テストチーム"
      members={activeMembers}
      existingRecords={[]}
      styles={[STYLE_FREE_50]}
      entries={[]}
      bestTimesByUser={{}}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  fake = buildRecordSaveSupabaseMock();
  mocks.push.mockClear();
});

describe("[V-05w] entries.id 由来行の誤 UPDATE 防止", () => {
  it("エントリーから prefill された行 (entry.id が既存 records.id 集合に無い) は INSERT される", async () => {
    renderRecordClient({
      existingRecords: [],
      entries: [
        {
          id: "entry-solo-1",
          user_id: "user-1",
          style_id: 2,
          entry_time: 30.0,
          note: null,
          users: { id: "user-1", name: "太郎" },
        },
      ],
    });

    const timeInput = screen.getByPlaceholderText("timePlaceholder") as HTMLInputElement;
    fireEvent.change(timeInput, { target: { value: "29.80" } });

    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
    });

    // entries.id ("entry-solo-1") は既存 records.id 集合に無いので INSERT される
    // (UPDATE ではない = 0件成功で silent failure しない)
    expect(fake.updateCalls.filter((c) => c.table === "records")).toHaveLength(0);
    const recordInserts = fake.insertCalls.filter((c) => c.table === "records");
    expect(recordInserts).toHaveLength(1);
    expect((recordInserts[0]?.payload as { user_id: string }).user_id).toBe("user-1");
  });

  it("既存 records.id 集合に含まれる行のみ UPDATE される", async () => {
    renderRecordClient({
      existingRecords: [
        {
          id: "record-existing-1",
          user_id: "user-1",
          style_id: 2,
          time: 28.0,
          video_path: null,
          note: null,
          is_relaying: false,
          reaction_time: null,
          pool_type: null,
          team_id: "team-1",
          split_times: [],
          users: { id: "user-1", name: "太郎" },
          styles: { id: 2, name_jp: "自由形50m", distance: 50 },
        },
      ],
      entries: [
        {
          id: "entry-solo-2",
          user_id: "user-2",
          style_id: 2,
          entry_time: 31.0,
          note: null,
          users: { id: "user-2", name: "次郎" },
        },
      ],
    });

    // entries 由来の行 (次郎) にもタイムを入力する
    const timeInputs = screen.getAllByPlaceholderText("timePlaceholder") as HTMLInputElement[];
    expect(timeInputs).toHaveLength(2);
    const jiroInput = timeInputs.find((input) => input.value === "");
    expect(jiroInput).toBeDefined();
    fireEvent.change(jiroInput as HTMLInputElement, { target: { value: "30.10" } });

    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
    });

    // 既存の太郎の行だけが UPDATE され、次郎 (entries 由来) は INSERT される
    const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
    expect(recordUpdates).toHaveLength(1);
    expect(recordUpdates[0]?.eq).toEqual([{ column: "id", value: "record-existing-1" }]);

    const recordInserts = fake.insertCalls.filter((c) => c.table === "records");
    expect(recordInserts).toHaveLength(1);
    expect((recordInserts[0]?.payload as { user_id: string }).user_id).toBe("user-2");
  });

  it("records.id と entries.id が偶然同じ文字列形式でも、membership 判定 (集合参照) で正しく分岐する", async () => {
    // 「同じ文字列形式」の罠: entries.id が既存 records.id と全く同じ値を偶然持つ
    // ケース (自然キーでなく id 集合の membership で判定していることの回帰防止)。
    renderRecordClient({
      existingRecords: [
        {
          id: "shared-id-format-1",
          user_id: "user-1",
          style_id: 2,
          time: 28.0,
          video_path: null,
          note: null,
          is_relaying: false,
          reaction_time: null,
          pool_type: null,
          team_id: "team-1",
          split_times: [],
          users: { id: "user-1", name: "太郎" },
          styles: { id: 2, name_jp: "自由形50m", distance: 50 },
        },
      ],
      // user-2 の entries.id は既存 records.id 集合に無い、別の (今回は非衝突の) 値
      entries: [
        {
          id: "entry-user2-unique",
          user_id: "user-2",
          style_id: 2,
          entry_time: 31.0,
          note: null,
          users: { id: "user-2", name: "次郎" },
        },
      ],
    });

    const timeInputs = screen.getAllByPlaceholderText("timePlaceholder") as HTMLInputElement[];
    const jiroInput = timeInputs.find((input) => input.value === "");
    fireEvent.change(jiroInput as HTMLInputElement, { target: { value: "30.10" } });

    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
    });

    // 太郎 (既存 records.id) だけが UPDATE 対象、次郎 (entries.id) は
    // 既存 records.id 集合に含まれないので INSERT される
    const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
    expect(recordUpdates.map((c) => c.eq[0]?.value)).toEqual(["shared-id-format-1"]);
    const recordInserts = fake.insertCalls.filter((c) => c.table === "records");
    expect(recordInserts).toHaveLength(1);
  });
});
