/**
 * RecordClient — リレー split の事前バリデーション (D3) 回帰テスト
 * (Sprint Contract Success Criteria S6: 不正入力の拒否)
 *
 * Sprint Contract 検証観点:
 *   [S6] leg 開始通算値以下の split を含む状態で保存すると、alert で保存が中止され、
 *        DB に split (負値・0 含む) が 1 件も書き込まれない (records.insert も発生しない)。
 *
 * 実装方針は recordSaveGuard.test.tsx を踏襲: RecordClient を丸ごとレンダリングし、
 * next-intl / @/i18n/navigation / AuthProvider をモックした上で実際の保存ボタン押下を
 * 通して検証する。既存記録 (existingRecords) の split_times に「leg 相対値として
 * 負値」を直接仕込むことで、再読込直後の entry.relaySplitTimes に不正な通算値
 * (leg 開始通算タイム以下) を再現する。これは「新規に不正な値を入力するケース」だけでなく
 * 「過去に破損した値を持つ記録を開いてそのまま保存し直すケース」も同じガードで
 * 弾かれることを検証する意味を持つ。
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
  const deleteCalls: Array<{ table: string }> = [];

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
          delete: () => {
            deleteCalls.push({ table });
            return builder;
          },
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
    deleteCalls,
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

// relay_4x50_free (styleId=2) の 4 泳者。時間は recordSaveGuard.test.tsx の
// リレー fixture と同一 (times=[27.5,28.7,28.3,27.6] → cumulatives=[27.5,56.2,84.5,112.1])。
function makeRelayRecords(
  legSplits: Array<{ distance: number; split_time: number }[]>,
) {
  const times = [27.5, 28.7, 28.3, 27.6];
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

describe("RecordClient — リレー split の事前バリデーション (D3・Success Criteria S6)", () => {
  beforeEach(() => {
    mocks.insertCalls.length = 0;
    mocks.deleteCalls.length = 0;
    mocks.push.mockClear();
  });

  it(
    "leg1 の split が DB に leg 開始通算タイム以下の (負の leg 相対値を含む) 状態で保存されている場合、" +
      "保存ボタン押下で alert が発報されて中断され、records / split_times への insert が" +
      "1 件も発生しない (人間の意図: 破損データを開いてそのまま保存し直しても新たな不正値が" +
      "DB に書き込まれてはならない)",
    async () => {
      // leg1 (legStart=27.5): DB に distance=25(leg内相対), split_time=-12.5 を保存済みとする。
      // D4 の復元で global splitTime = toCumulativeSplitTime(-12.5, 27.5) = 15.0 (> 0 だが
      // legStart(27.5) より小さい) となり、D3 の `splitTime <= 0` 事前フィルタは通過しつつ
      // `splitTime <= legStart + tolerance(0.005)` に掛かるはず。
      const existingRecords = makeRelayRecords([
        [],
        [{ distance: 25, split_time: -12.5 }],
        [],
        [],
      ]);

      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
      renderRecordClient(existingRecords);

      fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
      });
      const alertArgs = alertSpy.mock.calls.map((c) => c[0]);
      expect(
        alertArgs.some((a) => typeof a === "string" && a.includes("relaySplitBeforeLegStart")),
        `alert 呼び出しに relaySplitBeforeLegStart キーが含まれない: ${JSON.stringify(alertArgs)}`,
      ).toBe(true);

      expect(mocks.insertCalls).toHaveLength(0);
      expect(mocks.push).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    },
  );

  it(
    "leg1 の split が正常な (leg 開始通算タイムより大きい) 状態であれば、バリデーションに" +
      "引っかからず保存が進む (D3 が正常値を誤って弾かないことの回帰確認)",
    async () => {
      // leg1 (legStart=27.5): distance=25, split_time=10.0 (leg 相対値。正常な値)
      // → global splitTime = 10.0 + 27.5 = 37.5 > legStart(27.5) なので正常
      const existingRecords = makeRelayRecords([
        [],
        [{ distance: 25, split_time: 10.0 }],
        [],
        [],
      ]);

      renderRecordClient(existingRecords);

      fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

      await waitFor(() => {
        // 方式E (2026-08-25確定, Sprint Contract: recordSaveGuard.test.tsx と同様): RecordClient は
        // teams-admin/ からしか到達できない admin 専用画面のため、保存成功後の遷移先は
        // 無条件に /teams-admin/ に固定される。本テストの主眼は D3 バリデーションの検証だが、
        // 「保存が成功したこと」の確認として push 先も実測しているため、方式E に合わせて更新する。
        expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
      });

      const recordInserts = mocks.insertCalls.filter((c) => c.table === "records");
      expect(recordInserts).toHaveLength(4);
    },
  );
});
