/**
 * RecordClient — 保存フロー回帰テスト (空タイム行スキップ / リレー種目グループの構造保持)
 *
 * Sprint Contract 検証観点:
 *   [仕様#3] 棄権・欠場した選手の行はタイム未入力のまま保存すればその行は登録されない
 *     (既存の `shouldSave = mr.time > 0` の挙動。RecordClient.tsx:926-928)
 *   [仕様#2 前提] リレーとして検出された種目グループは、Phase 1/2 が
 *     is_relaying 4件連続パターンを検出して1つの StyleEntry (1カード) に集約している。
 *     エントリー行マージ機能がこの構造を壊さないことを保証するには、まず
 *     「マージ前の現状でリレー検出が正しく機能し、1カードのまま保存対象になる」
 *     ことを固定しておく必要がある (回帰の基準点)。
 *
 * このテストは Developer の新機能 (entries マージ) 実装前の **現状のコード** に対して
 * 実行する。実装着地後も green のままであるべき (=既存動作を壊していないことの検証)。
 * entries マージ自体の検証は、新規 shared 純粋関数が着地してから別途追加する。
 *
 * 実装方針は `EntriesClient.test.tsx` (前スプリント) を踏襲: 巨大な client component を
 * 丸ごとレンダリングし、next-intl / next/navigation / AuthProvider をモックした上で
 * 実際の DOM 操作 (保存ボタン押下) を通して検証する。RecordClient は supabase.from() を
 * 直叩きする方式 (API クラス経由ではない) のため、テーブルごとに呼び出しを記録する
 * 最小限の supabase フェイクをこのファイル内に用意する。
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Style } from "@apps/shared/types";
import RecordClient from "../../app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/RecordClient";

vi.mock("@/components/video/TeamVideoUploader", () => ({
  default: () => null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next-intl", async (importOriginal) => {
  const original = await importOriginal<typeof import("next-intl")>();
  return {
    ...original,
    // 値展開は不要 (テストは文言ではなく保存されるレコード件数・内容を検証する)
    useTranslations: () => ((key: string) => key) as unknown as ReturnType<
      typeof original.useTranslations
    >,
    useLocale: () => "ja",
  };
});

const mocks = vi.hoisted(() => {
  const insertCalls: Array<{ table: string; payload: unknown }> = [];

  /**
   * テーブルごとの insert() 呼び出しを payload ごと記録する最小限の supabase フェイク。
   * insert().select("id").single() のチェーンと、delete().eq()/.in() のチェーンの両方を
   * サポートする。records の insert には連番 id を払い出す。
   */
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
  style: "fr",
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
  { id: "user-1", user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎" } },
  { id: "user-2", user_id: "user-2", role: "user", users: { id: "user-2", name: "次郎" } },
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

describe("RecordClient — 空タイム行は保存されない (仕様#3の回帰確認)", () => {
  beforeEach(() => {
    mocks.insertCalls.length = 0;
    mocks.push.mockClear();
  });

  it(
    "同一種目に2名の行があり、1名だけタイム入力済み・もう1名が未入力(time=0)の状態で保存すると、" +
      "records への insert は1回だけ発生し、未入力だった選手の user_id は insert payload に含まれない" +
      "（人間の意図: 棄権・欠場した選手の行を空のまま保存しても記録が作られてはならない。" +
      "これは entries から補完される新規行にも同じ判定が適用されるべき既存の防波堤）",
    async () => {
      const existingRecords = [
        {
          id: "record-1",
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
          id: "record-2",
          user_id: "user-2",
          style_id: 2,
          time: 0,
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
      ];

      renderRecordClient(existingRecords);

      fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

      await waitFor(() => {
        expect(mocks.push).toHaveBeenCalledWith("/teams/team-1?tab=competitions");
      });

      const recordInserts = mocks.insertCalls.filter((c) => c.table === "records");
      expect(recordInserts).toHaveLength(1);
      const insertedUserIds = recordInserts.map(
        (c) => (c.payload as { user_id: string }).user_id,
      );
      expect(insertedUserIds).toEqual(["user-1"]);
      expect(insertedUserIds).not.toContain("user-2");
    },
  );

  it(
    "全行が未入力(time=0)の状態で保存しようとすると、insert は一切発生せず" +
      "バリデーションエラーで処理が中断される（人間の意図: 仕様#3の境界値。" +
      "『少なくとも1件』ルールが空のエントリー行だけの大会でも正しく働くこと)",
    async () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
      const existingRecords = [
        {
          id: "record-1",
          user_id: "user-1",
          style_id: 2,
          time: 0,
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
      ];

      renderRecordClient(existingRecords);

      fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith("validation.atLeastOneRecord");
      });
      expect(mocks.insertCalls).toHaveLength(0);
      expect(mocks.push).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    },
  );
});

describe("RecordClient — リレー検出された StyleEntry の構造保持 (仕様#2 前提の回帰確認)", () => {
  beforeEach(() => {
    mocks.insertCalls.length = 0;
    mocks.push.mockClear();
  });

  const STYLES_FOR_RELAY: Style[] = [
    { id: 2, name_jp: "自由形50m", name: "Freestyle", style: "fr", distance: 50 },
  ];

  function renderWithRelay() {
    // is_relaying = [false, true, true, true] の4件連続 + 同一 styleId → フリーリレー検出
    const relayRecords = [
      { time: 27.5, is_relaying: false, user_id: "user-0" },
      { time: 28.7, is_relaying: true, user_id: "user-1" },
      { time: 28.3, is_relaying: true, user_id: "user-2" },
      { time: 27.6, is_relaying: true, user_id: "user-3" },
    ].map((r, idx) => ({
      id: `relay-record-${idx}`,
      user_id: r.user_id,
      style_id: 2,
      time: r.time,
      video_path: null,
      note: null,
      is_relaying: r.is_relaying,
      reaction_time: null,
      pool_type: null,
      team_id: "team-1",
      split_times: [],
      users: { id: r.user_id, name: `選手${idx}` },
      styles: { id: 2, name_jp: "自由形50m", distance: 50 },
    }));

    return render(
      <RecordClient
        teamId="team-1"
        competitionId="comp-1"
        competition={baseCompetition}
        teamName="テストチーム"
        members={activeMembers}
        existingRecords={relayRecords}
        styles={STYLES_FOR_RELAY}
        entries={[]}
      />,
    );
  }

  it(
    "4件のリレーレコードは1つの種目カード (entryHeader) にまとまり、4件に分裂しない" +
      "（人間の意図: リレー検出された StyleEntry に将来のエントリーマージ機能が触れて" +
      "はならない、という仕様の前提となる現状の構造を固定する）",
    () => {
      renderWithRelay();
      // 識別用の見出しキー (next-intl をモックしているためキー文字列がそのまま描画される)
      expect(screen.getAllByText("entryHeader")).toHaveLength(1);
    },
  );

  it(
    "リレー種目カード内の4泳者すべてに既存タイムが復元された状態で保存すると、" +
      "records への insert は4件発生する (1件にまとめられて保存が欠落しない)",
    async () => {
      renderWithRelay();

      fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

      await waitFor(() => {
        expect(mocks.push).toHaveBeenCalledWith("/teams/team-1?tab=competitions");
      });

      const recordInserts = mocks.insertCalls.filter((c) => c.table === "records");
      expect(recordInserts).toHaveLength(4);
    },
  );
});
