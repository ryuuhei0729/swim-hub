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
 * 丸ごとレンダリングし、next-intl / @/i18n/navigation / AuthProvider をモックした上で
 * 実際の DOM 操作 (保存ボタン押下) を通して検証する。RecordClient は supabase.from() を
 * 直叩きする方式 (API クラス経由ではない) のため、テーブルごとに呼び出しを記録する
 * 最小限の supabase フェイクをこのファイル内に用意する。
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
    // 値展開は不要 (テストは文言ではなく保存されるレコード件数・内容を検証する)
    useTranslations: () => ((key: string) => key) as unknown as ReturnType<
      typeof original.useTranslations
    >,
    useLocale: () => "ja",
  };
});

// ---------------------------------------------------------------------------
// supabase フェイク
//
// 従来このファイルは `vi.hoisted` 内に自前のフェイクを持っていたが、
// そのフェイクの `eq` は `Promise.resolve()` を返しており **2 段目の `.eq()` が
// 存在しなかった**。リレーのチーム記録化 (第3弾) で `replaceRelayRecords` が
//     .select(...).eq("team_id", ...).eq("competition_id", ...)
// を要求した時点で `TypeError: ....eq is not a function` になった。
//
// 🚨 `.eq()` を 1 段に減らす (= `competition_id` をクライアント側 filter に落とす)
//    方向では直さない。サーバー絞り込みとクライアント filter を区別できなくなる
//    既知のアンチパターンである。共通モック
//    `__tests__/utils/supabaseRecordSaveMock.ts` に差し替え、`.eq()` を任意段
//    チェーンできるようにしたうえで **引数を捨てず** `eqCalls` に記録する。
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => ({ push: vi.fn() }));

/** 各テストの beforeEach で作り直す (呼び出し記録がテスト間で漏れないように) */
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
      bestTimesByUser={{}}
    />,
  );
}

describe("RecordClient — 空タイム行は保存されない (仕様#3の回帰確認)", () => {
  beforeEach(() => {
    fake = buildRecordSaveSupabaseMock();
    mocks.push.mockClear();
  });

  it(
    "同一種目に2名の行があり、1名だけタイム入力済み・もう1名が未入力(time=0)の状態で保存すると、" +
      "タイム入力済みの既存行 (record-1) は UPDATE され (INSERT は発生しない)、" +
      "未入力だった選手 (user-2) は update/insert 対象に含まれず、" +
      "その既存行 (record-2) は削除される" +
      "（人間の意図: 棄権・欠場した選手の行を空のまま保存しても記録が作られてはならない。" +
      "upsert化後は『新規に作らない』だけでなく『既存の記録は消える』が正しい —" +
      "record-1/record-2 は保存前から存在する既存行なので、保存の帰結は INSERT ではなく" +
      "UPDATE/DELETE の振り分けになる。これは entries から補完される新規行にも" +
      "同じ判定が適用されるべき既存の防波堤）",
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
          users: { id: "user-1", name: "太郎", gender: 0 },
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
          users: { id: "user-2", name: "次郎", gender: 0 },
          styles: { id: 2, name_jp: "自由形50m", distance: 50 },
        },
      ];

      renderRecordClient(existingRecords);

      fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

      await waitFor(() => {
        // 方式E (2026-08-25確定): RecordClient は teams-admin/ からしか到達できないため、
        // 戻り先は無条件に /teams-admin/ に固定する (/teams/ の一般メンバー画面ではない)。
        expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
      });

      // record-1 は保存前から存在する既存行なので INSERT ではなく UPDATE される
      const recordInserts = fake.insertCalls.filter((c) => c.table === "records");
      expect(recordInserts).toHaveLength(0);

      const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
      expect(recordUpdates).toHaveLength(1);
      const updatedUserIds = recordUpdates.map((c) => (c.payload as { user_id: string }).user_id);
      expect(updatedUserIds).toEqual(["user-1"]);
      expect(updatedUserIds).not.toContain("user-2");
      // UPDATE は record-1 自身の id だけに絞り込まれている (他行に波及しない)
      expect(recordUpdates[0]?.eq).toEqual([{ column: "id", value: "record-1" }]);

      // user-2 の行 (record-2) はタイムが0のまま保存されたので、フォームから
      // 消えた既存行として削除される (delete-all→insert-allだった旧実装と同じ結果)
      const recordDeletes = fake.inCalls.filter(
        (c) => c.table === "records" && c.op === "delete",
      );
      expect(recordDeletes).toHaveLength(1);
      expect(recordDeletes[0]?.values).toEqual(["record-2"]);
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
          users: { id: "user-1", name: "太郎", gender: 0 },
          styles: { id: 2, name_jp: "自由形50m", distance: 50 },
        },
      ];

      renderRecordClient(existingRecords);

      fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith("validation.atLeastOneRecord");
      });
      expect(fake.insertCalls).toHaveLength(0);
      expect(mocks.push).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    },
  );
});

describe("RecordClient — リレー検出された StyleEntry の構造保持 (仕様#2 前提の回帰確認)", () => {
  beforeEach(() => {
    fake = buildRecordSaveSupabaseMock();
    mocks.push.mockClear();
  });

  const STYLES_FOR_RELAY: Style[] = [
    { id: 2, name_jp: "自由形50m", name: "Freestyle", style: "Fr", distance: 50 },
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
      users: { id: r.user_id, name: `選手${idx}`, gender: 0 },
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
        bestTimesByUser={{}}
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
      "4件全てが records への UPDATE として発生する (1件にまとめられて保存が欠落せず、" +
      "既存の4行なので INSERT ではなく UPDATE になる)",
    async () => {
      renderWithRelay();

      fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

      await waitFor(() => {
        expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
      });

      // relay-record-0〜3 は保存前から存在する既存行なので INSERT は発生しない
      const recordInserts = fake.insertCalls.filter((c) => c.table === "records");
      expect(recordInserts).toHaveLength(0);

      const recordUpdates = fake.updateCalls.filter((c) => c.table === "records");
      expect(recordUpdates).toHaveLength(4);
      const updatedRecordIds = recordUpdates.map((c) => c.eq[0]?.value).sort();
      expect(updatedRecordIds).toEqual(
        ["relay-record-0", "relay-record-1", "relay-record-2", "relay-record-3"].sort(),
      );
    },
  );

  // 【修正ラウンド 2026-09-17 (Critical #1)】以前は「差し替え前の取得が relay_records を
  // team_id / competition_id でサーバー絞り込みしていること」を検証していた。これは
  // 旧 replace() の内部 SELECT を前提にしたアサーションであり、新設計では replace() は
  // 内部 SELECT を一切行わない (同一種目に別チーム/別組があると、この列条件では
  // それらを巻き込んで削除してしまう Critical だったため)。
  // 「サーバー側で絞り込んでいること」を検証する意図は維持し、検証対象を
  // 「relay_records への .eq(team_id/competition_id)」から
  // 「relay_record_legs への .in(record_id, 画面が読み込んだ records.id)」へ移す。
  it(
    "リレーの差し替え前に行う relay_record_legs の取得は record_id を" +
      "**画面が読み込んだ records.id 集合でサーバー側の絞り込み条件として渡している** " +
      "(DB 列条件で絞り込み直す形になっていないこと。緩めると他チーム・他大会の" +
      "relay_record_legs が一旦クライアントに届いてしまい、テストからは区別できないまま" +
      "情報露出が通り抜ける)",
    async () => {
      renderWithRelay();

      fireEvent.click(screen.getByRole("button", { name: "record.saveButton" }));

      await waitFor(() => {
        expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
      });

      const legScopeSelect = fake.inCalls.filter(
        (c) => c.table === "relay_record_legs" && c.op === "select",
      );

      // 列名と値の対応まで見る (列名だけの検査だと値がテンプレート化していても通る)
      expect(legScopeSelect).toEqual([
        {
          table: "relay_record_legs",
          op: "select",
          column: "record_id",
          values: ["relay-record-0", "relay-record-1", "relay-record-2", "relay-record-3"],
        },
      ]);

      // relay_records 自体への条件 select (旧内部 SELECT) はもう発生しない
      expect(fake.selectCalls.filter((c) => c.table === "relay_records")).toHaveLength(0);
    },
  );
});

describe("RecordClient — 戻るボタンの遷移先 (V-01 方式E: 2026-08-25確定)", () => {
  beforeEach(() => {
    fake = buildRecordSaveSupabaseMock();
    mocks.push.mockClear();
  });

  it(
    "ヘッダーの戻るボタンを押すと /teams-admin/team-1?tab=competitions へ遷移する " +
      "（完全一致。/teams/team-1?tab=competitions ではないことを区別できる assert。" +
      "RecordDataLoader は role !== 'admin' を server 側で redirect 済みのため、この画面に" +
      "到達できるのは常に admin だけであり、戻り先は teams-admin に固定してよい）",
    () => {
      renderRecordClient([]);

      fireEvent.click(screen.getByRole("button", { name: "record.backButton" }));

      expect(mocks.push).toHaveBeenCalledTimes(1);
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-1?tab=competitions");
    },
  );
});
