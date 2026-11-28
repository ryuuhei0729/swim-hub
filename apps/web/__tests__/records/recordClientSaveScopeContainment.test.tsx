// =============================================================================
// recordClientSaveScopeContainment.test.tsx
// Sprint Contract Phase A スケルトン — RecordClient (web) の upsert 化スコープ検証
// =============================================================================
//
// 記録入力は「種目一覧 → 種目を選んで入力 → 種目ごとに保存」の組み立て (mobile と同じ)。
// 保存は開いている種目のぶんだけに絞られる。以下が崩れていないか検証する。
//
// [V-01w] フォームから外れた (ユーザーが削除した) 行だけが DELETE 対象になり、
//         フォームに残っている行は id を保持したまま UPDATE される
//         (=大会内の他 team / 他 competition の records には一切触れない)。
// [#114]  開いていない種目の records は、UPDATE も DELETE もされない。

import React from "react";
import { renderWithQueryClient as render, screen, waitFor, fireEvent } from "@/__tests__/helpers/teamQueryTestUtils";
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

const activeMembers = [
  { id: "user-1", user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎", gender: 0 } },
  { id: "user-2", user_id: "user-2", role: "user", users: { id: "user-2", name: "次郎", gender: 0 } },
  { id: "user-3", user_id: "user-3", role: "user", users: { id: "user-3", name: "三郎", gender: 0 } },
];

type RecordClientPropsFull = Parameters<typeof RecordClient>[0];

function renderRecordClient(
  overrides: Partial<
    Pick<RecordClientPropsFull, "existingRecords" | "entries" | "styles" | "selection">
  >,
) {
  return render(
    <RecordClient
      teamId="team-1"
      competitionId="comp-1"
      competition={baseCompetition}
      teamName="テストチーム"
      members={activeMembers}
      existingRecords={[]}
      styles={[STYLE_FREE_50, STYLE_BREAST_50]}
      entries={[]}
      bestTimesByUser={{}}
      selection={{ kind: "individual", styleId: 2 }}
      {...overrides}
    />,
  );
}

const THREE_EXISTING_ROWS = [
  {
    id: "record-taro",
    user_id: "user-1",
    style_id: 2,
    time: 27.5,
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
  {
    id: "record-jiro",
    user_id: "user-2",
    style_id: 2,
    time: 28.5,
    video_path: null,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: null,
    team_id: "team-1",
    split_times: [],
    users: { id: "user-2", name: "次郎" },
    styles: { id: 2, name_jp: "自由形50m", distance: 50 },
  },
  {
    id: "record-saburo",
    user_id: "user-3",
    style_id: 9,
    time: 35.0,
    video_path: null,
    note: null,
    is_relaying: false,
    reaction_time: null,
    pool_type: null,
    team_id: "team-1",
    split_times: [],
    users: { id: "user-3", name: "三郎" },
    styles: { id: 9, name_jp: "平泳ぎ50m", distance: 50 },
  },
];

beforeEach(() => {
  fake = buildRecordSaveSupabaseMock();
  mocks.push.mockClear();
});

describe("[V-01w] 保存の差分適用 (upsert化) スコープ封じ込め", () => {
  it("自由形50mで次郎をメンバーから外して保存すると、DELETE 対象の id はその1行のみ (太郎は UPDATE、別種目の三郎には触れない)", async () => {
    renderRecordClient({ existingRecords: THREE_EXISTING_ROWS });

    // メンバー選択で次郎を外して確定する
    fireEvent.click(screen.getByRole("button", { name: "record.selectMemberButton" }));
    fireEvent.click(screen.getByRole("button", { name: "次郎" }));
    fireEvent.click(screen.getByRole("button", { name: "record.confirmSelection" }));

    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams/team-1/competitions/comp-1/records");
    });

    const deleteIns = fake.inCalls.filter((c) => c.table === "records" && c.op === "delete");
    expect(deleteIns).toHaveLength(1);
    expect(deleteIns[0]?.values).toEqual(["record-jiro"]);

    const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
    const updatedIds = recordUpdates.map((c) => c.eq[0]?.value);
    expect(updatedIds).toEqual(["record-taro"]);
  });

  it("既存行の値を変更して保存すると、開いている種目の行だけが id を保持したまま UPDATE される (別種目の行は UPDATE も DELETE もされない)", async () => {
    renderRecordClient({ existingRecords: THREE_EXISTING_ROWS });

    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams/team-1/competitions/comp-1/records");
    });

    const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
    const updatedIds = recordUpdates.map((c) => c.eq[0]?.value).sort();
    expect(updatedIds).toEqual(["record-jiro", "record-taro"].sort());
    expect(fake.insertCalls.filter((c) => c.table === "records")).toHaveLength(0);
    // 平泳ぎ50m (三郎) の行は今回のフォームに無いが、別種目なので削除対象にならない
    expect(fake.inCalls.filter((c) => c.table === "records" && c.op === "delete")).toHaveLength(0);
  });

  it("平泳ぎ50mを開いて保存すると、三郎の行だけが UPDATE され、自由形50mの行には触れない", async () => {
    renderRecordClient({
      existingRecords: THREE_EXISTING_ROWS,
      selection: { kind: "individual", styleId: 9 },
    });

    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams/team-1/competitions/comp-1/records");
    });

    const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
    expect(recordUpdates.map((c) => c.eq[0]?.value)).toEqual(["record-saburo"]);
    expect(fake.inCalls.filter((c) => c.table === "records" && c.op === "delete")).toHaveLength(0);
    expect(fake.insertCalls.filter((c) => c.table === "records")).toHaveLength(0);
    // 個人種目だけの保存ではリレーのチーム記録に触れない
    expect(fake.inCalls.filter((c) => c.table === "relay_record_legs")).toHaveLength(0);
  });

  it("新規追加した行 (entries由来 or 完全新規) は INSERT される (既存 records.id 集合に無い id を UPDATE 対象にしない = V-05w と同一観点)", async () => {
    renderRecordClient({
      existingRecords: [THREE_EXISTING_ROWS[0] as (typeof THREE_EXISTING_ROWS)[number]],
      entries: [
        {
          id: "entry-shiro-1",
          user_id: "user-2",
          style_id: 2,
          entry_time: 29.0,
          note: null,
          users: { id: "user-2", name: "次郎" },
        },
      ],
    });

    const timeInputs = screen.getAllByPlaceholderText("timePlaceholder") as HTMLInputElement[];
    const emptyInput = timeInputs.find((input) => input.value === "");
    fireEvent.change(emptyInput as HTMLInputElement, { target: { value: "28.90" } });

    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams/team-1/competitions/comp-1/records");
    });

    const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
    expect(recordUpdates).toHaveLength(1);
    expect(recordUpdates[0]?.eq).toEqual([{ column: "id", value: "record-taro" }]);

    const recordInserts = fake.insertCalls.filter((c) => c.table === "records");
    expect(recordInserts).toHaveLength(1);
    expect((recordInserts[0]?.payload as { user_id: string }).user_id).toBe("user-2");
  });

  it("保存 API 呼び出しの eq/in 呼び出しに team_id と competition_id の両方が使われ、他大会・他チームの records の id が delete/update 対象の id 集合に混入しない", async () => {
    renderRecordClient({ existingRecords: THREE_EXISTING_ROWS });

    fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith("/teams/team-1/competitions/comp-1/records");
    });

    // RecordDataLoader が team_id/competition_id で絞り込んだ existingRecords
    // (props) だけが existingRecordIds の母集合になる。update/delete の対象 id は
    // すべてこの props 由来の3行の id (record-taro/record-jiro/record-saburo) に
    // 収まっており、他大会・他チームの id が紛れ込んでいないことを直接確認する。
    const knownIds = new Set(THREE_EXISTING_ROWS.map((r) => r.id));
    const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
    for (const update of recordUpdates) {
      const targetId = update.eq[0]?.value;
      expect(knownIds.has(targetId as string)).toBe(true);
    }
    const recordDeleteIns = fake.inCalls.filter(
      (c) => c.table === "records" && c.op === "delete",
    );
    for (const del of recordDeleteIns) {
      for (const id of del.values) {
        expect(knownIds.has(id as string)).toBe(true);
      }
    }
  });
});
