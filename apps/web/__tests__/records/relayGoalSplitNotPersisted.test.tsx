/**
 * RecordClient — 保存経路で distance===legDist(=raceDistance) の split が永続化されないことの
 * 回帰テスト (Sprint Contract 追補 R2 / S15)
 *
 * 背景 (R2-2): `isRecordSplitTimesCorrupted` の破損検知母集団は `distance < legDist` に
 * narrowing されている。これは「distance === legDist の split は保存経路
 * (RecordClient.tsx:1122-1127 の `!(raceDistance && st.distance === raceDistance)` フィルタ)
 * で構造的に DB へ永続化され得ない」という前提の上に立つ。PM はこの narrowing を正式承認したが、
 * 前提を守る回帰テストが無いと、将来 UI にゴール split を保存する変更が入った際に
 * 静かに前提が崩れる (=破損検知の母集団漏れが再発する)。本ファイルはこの前提を固定する。
 *
 * トートロジー回避: RecordClient を丸ごとレンダリングし、実際の保存ボタン押下を通して
 * supabase.from("split_times").insert() に渡された実際のペイロードを検証する
 * (relaySplitValidationGuard.test.tsx と同じ実測方式)。
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Style } from "@apps/shared/types";
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

const mocks = vi.hoisted(() => {
  const insertCalls: Array<{ table: string; payload: unknown }> = [];

  function makeFakeSupabase() {
    let insertedRecordSeq = 0;
    return {
      from: (table: string) => {
        const builder = {
          insert: (payload: unknown) => {
            insertCalls.push({ table, payload });
            return builder;
          },
          select: () => builder,
          single: () =>
            Promise.resolve(
              table === "records"
                ? { data: { id: `new-record-${++insertedRecordSeq}` }, error: null }
                : { data: null, error: null },
            ),
          delete: () => builder,
          eq: () => Promise.resolve({ error: null }),
          in: () => Promise.resolve({ error: null }),
        };
        return builder;
      },
    };
  }

  return {
    push: vi.fn(),
    insertCalls,
    supabase: makeFakeSupabase(),
  };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: mocks.supabase, subscription: null }),
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
  { id: "user-0", user_id: "user-0", role: "admin", users: { id: "user-0", name: "選手0" } },
  { id: "user-1", user_id: "user-1", role: "user", users: { id: "user-1", name: "選手1" } },
  { id: "user-2", user_id: "user-2", role: "user", users: { id: "user-2", name: "選手2" } },
  { id: "user-3", user_id: "user-3", role: "user", users: { id: "user-3", name: "選手3" } },
];

function renderRecordClient(existingRecords: Parameters<typeof RecordClient>[0]["existingRecords"]) {
  return render(
    <RecordClient
      teamId="team-1"
      competitionId="comp-1"
      competition={baseCompetition}
      teamName="テストチーム"
      members={activeMembers}
      existingRecords={existingRecords}
      styles={[STYLE_FREE_50]}
      entries={[]}
    />,
  );
}

// relay_4x50_free (styleId=2, legDist=50) の 4 泳者。
// times=[27.5,28.7,28.3,27.6] → cumulatives=[27.5,56.2,84.5,112.1]。
// leg0 だけ、自身の leg 内で本物の中間 split (distance=25, leg 相対値 12.0) を持たせる。
// 読み込み時、restoreRelayBoundarySplits が各 leg 自身のゴール境界 (50/100/150/200) を
// record.time の累計から補完するため、entry.relaySplitTimes には
// 中間split(25) + 4境界(50,100,150,200) が並ぶ状態になる。
function makeRelayRecords() {
  const times = [27.5, 28.7, 28.3, 27.6];
  const legSplits: Array<{ distance: number; split_time: number }[]> = [
    [{ distance: 25, split_time: 12.0 }],
    [],
    [],
    [],
  ];
  return times.map((time, idx) => ({
    id: `relay-record-${idx}`,
    user_id: `user-${idx}`,
    style_id: 2,
    time,
    video_path: null,
    note: null,
    is_relaying: idx !== 0, // times配列と同じ長さの固定パターン(先頭のみfalse)
    reaction_time: null,
    pool_type: null,
    team_id: "team-1",
    // legSplits は呼び出し元 (このファイル内) で常に times と同じ4要素の配列を渡す設計
    split_times: legSplits[idx]!.map((s, j) => ({
      id: `st-${idx}-${j}`,
      distance: s.distance,
      split_time: s.split_time,
    })),
    users: { id: `user-${idx}`, name: `選手${idx}` },
    styles: { id: 2, name_jp: "自由形50m", distance: 50 },
  }));
}

describe("RecordClient — distance===legDist(=raceDistance) の split は保存経路で永続化されない (S15)", () => {
  beforeEach(() => {
    mocks.insertCalls.length = 0;
    mocks.push.mockClear();
  });

  it(
    "4 leg 分の relaySplitTimes (中間split 1件 + 各 leg 自身の境界split 4件) を保存すると、" +
      "split_times への insert には distance===50(=legDist=raceDistance) の行が" +
      "1件も含まれず、中間split (distance=25) だけが書き込まれる",
    async () => {
      const existingRecords = makeRelayRecords();
      renderRecordClient(existingRecords);

      fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

      await waitFor(() => {
        // 方式E (2026-08-25確定, Sprint Contract: recordSaveGuard.test.tsx と同様): RecordClient は
        // teams-admin/ からしか到達できない admin 専用画面のため、保存成功後の遷移先は
        // 無条件に /teams-admin/ に固定される。本テストの主眼は split_times payload の検証だが、
        // 「保存が成功したこと」の確認として push 先も実測しているため、方式E に合わせて更新する。
        expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
      });

      const splitTimeInserts = mocks.insertCalls.filter((c) => c.table === "split_times");
      const allInsertedRows = splitTimeInserts.flatMap(
        (c) => c.payload as Array<{ distance: number; split_time: number }>,
      );

      // distance===50 (legDist=raceDistance) の行は1件も無い
      const goalDistanceRows = allInsertedRows.filter((r) => r.distance === 50);
      expect(
        goalDistanceRows,
        `distance===50 の行が insert payload に含まれている: ${JSON.stringify(goalDistanceRows)}`,
      ).toHaveLength(0);

      // leg0 の中間split (distance=25) はちゃんと書き込まれている (フィルタが過剰に
      // 効いて全て消えていないことの確認 — S15 が「何も保存されない」トリビアルな
      // テストになっていないことの保証)
      expect(allInsertedRows).toContainEqual(
        expect.objectContaining({ distance: 25, split_time: 12.0 }),
      );

      // insert 全体としては leg0 の中間split 1件のみ (4境界すべてゴールフィルタで除去)
      expect(allInsertedRows).toHaveLength(1);
    },
  );
});
