/**
 * RecordClient — relay_records / relay_record_legs 差し替えの防波堤 (web)
 *                 (QA Sprint Contract Phase B / 第3弾)
 *
 * 両 Developer が確定させた保存の方針を**ミューテーションに耐える形で**固定する。
 * 各 describe の先頭に「このガードをどう外すと赤くなるか」を書いてある
 * (PM に渡すミューテーション手順書と 1:1 対応する)。
 *
 * Sprint Contract 検証観点:
 *   [V-SG-01] `records` が1件でも失敗したら relay 側は **1行も書かない**
 *             (select すらしない)
 *   [V-SG-02] 古い行の delete は **全計画が成功したときだけ**。
 *             1本でも失敗したら古い行を残す
 *   [V-SG-03] 差し替え順序は **insert → 事前取得した古い行を明示 id で delete**。
 *             `.eq("team_id")` のような条件 delete にしていない
 *   [V-SG-04] レグ insert が失敗したら **今 insert した親を巻き戻す**
 *   [V-SG-05] `created_by` をクライアントから送らない (DB DEFAULT auth.uid())
 *   [V-SG-06] 個人種目だけの保存は relay_records に**一切触れない**
 *   [V-SG-07] レグの `legTime` は区間タイム、`record_id` は対応する records 行、
 *             `leg_index` は 0-based
 *   [V-SG-08] 性別不明のメンバーは `mixed` に寄せる (`?? 0` で男性にしない)
 *   [V-SG-09] 古い行は**自然キーに関係なく**すべて削除対象になる
 *             (フォームから消したリレーを孤児として残さない)
 *
 * ⚠️ 当初は「既存行の `note` を自然キーで引き継ぐ」も観点だったが、
 *    **PM 裁定で `relay_records.note` 列そのものが廃止された** (非 NULL を書く
 *    経路がどこにも無かった)。これに伴い shared の `findExistingRelayForNote` も
 *    削除され、insert payload は 8 列 → 7 列になった。
 *    note 列を復活させるなら、自然キー照合の 3 つの設計判断
 *    (泳者集合は順不同 / 種類・距離が違えば照合しない / 退会で NULL 化された行は
 *     照合しない) を一緒に戻すこと。
 *
 * トートロジー防止:
 *   期待値 (総合タイム 112.10 / 区間 27.50, 28.70, 28.30, 27.60) はすべて
 *   fixture から手で計算したリテラル。プロダクションの `calcCumulativeTimes` を
 *   呼んで期待値を作らない。
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

/** styles.id 2 = 50m 自由形 → 4 レグ揃うと relay_4x50_free が検出される */
const STYLE_FREE_50: Style = {
  id: 2,
  name_jp: "自由形50m",
  name: "Freestyle",
  style: "Fr",
  distance: 50,
};

const baseCompetition = {
  id: "comp-thrush",
  user_id: "user-anchor",
  team_id: "team-thrush",
  title: "ツグミ記録会",
  date: "2026-01-07",
  end_date: null,
  place: null,
  pool_type: 0 as const,
  note: null,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
  team: { id: "team-thrush", name: "ツグミ" },
};

/**
 * 4 人全員 gender=0 のメンバー一覧 (性別区分が male になる対照)。
 *
 * `TeamMember.users.gender` は **必須** に変わった (RecordDataLoader が必ず
 * select に入れているため。optional だと select から落ちたときに全リレーが
 * 静かに mixed で保存される)。よって「性別が undefined のメンバー」は
 * 型の上で作れない。
 */
const membersAllMale = [
  {
    id: "user-lead",
    user_id: "user-lead",
    role: "admin",
    users: { id: "user-lead", name: "リード", gender: 0 },
  },
  {
    id: "user-second",
    user_id: "user-second",
    role: "user",
    users: { id: "user-second", name: "セカンド", gender: 0 },
  },
  {
    id: "user-third",
    user_id: "user-third",
    role: "user",
    users: { id: "user-third", name: "サード", gender: 0 },
  },
  {
    id: "user-anchor",
    user_id: "user-anchor",
    role: "user",
    users: { id: "user-anchor", name: "アンカー", gender: 0 },
  },
];

/**
 * 第4泳者 (user-anchor) が**メンバー一覧に居ない**状態。
 *
 * これが「性別不明」の唯一の到達経路である: 記録が書かれた後にその泳者が
 * チームを離れると、`members` (アクティブメンバー) から消えるのに
 * `records.user_id` は残る。`memberGenderByUserId` に entry が無いので
 * `resolveRelayGenderCategory` は `mixed` を返さなければならない
 * (`?? 0` で埋めると「不明」が「男性」として静かに確定する)。
 */
const membersWithoutAnchor = membersAllMale.filter(
  (member) => member.user_id !== "user-anchor",
);

/**
 * is_relaying = [false, true, true, true] の 4 行連続 + style_id 2 で
 * relay_4x50_free として検出されるリレー記録。
 *
 * 区間タイム: 27.50 / 28.70 / 28.30 / 27.60
 * 総合タイム: 112.10 (手計算。calcCumulativeTimes を呼んで作らない)
 */
const RELAY_LEG_TIMES = [27.5, 28.7, 28.3, 27.6] as const;
const RELAY_TOTAL_TIME = 112.1;
const RELAY_USER_IDS = ["user-lead", "user-second", "user-third", "user-anchor"] as const;

function relayExistingRecords() {
  return RELAY_LEG_TIMES.map((time, index) => ({
    id: `existing-record-${index}`,
    user_id: RELAY_USER_IDS[index] as string,
    style_id: 2,
    time,
    video_path: null,
    note: null,
    is_relaying: index !== 0,
    reaction_time: null,
    pool_type: null,
    team_id: "team-thrush",
    split_times: [],
    users: { id: RELAY_USER_IDS[index] as string, name: `泳者${index}` },
    styles: { id: 2, name_jp: "自由形50m", distance: 50 },
  }));
}

/** 個人種目 1 件だけ (is_relaying がどこにも無い) */
function individualOnlyRecords() {
  return [
    {
      id: "existing-record-solo",
      user_id: "user-lead",
      style_id: 2,
      time: 26.4,
      video_path: null,
      note: null,
      is_relaying: false,
      reaction_time: null,
      pool_type: null,
      team_id: "team-thrush",
      split_times: [],
      users: { id: "user-lead", name: "リード" },
      styles: { id: 2, name_jp: "自由形50m", distance: 50 },
    },
  ];
}

/**
 * 差し替え前に存在する古い `relay_records.id` を解決するための `relay_record_legs`
 * フェイク行。
 *
 * 【修正ラウンド 2026-09-17 (Critical #1)】以前は `replace()` 自身が
 * `relay_records.select("id").eq("team_id", ...).eq("competition_id", ...)` で
 * 古い行を取得していたが、これは同じ種目に複数チーム/組がある場合に他チームの
 * 行を巻き込んで削除してしまう Critical だった。新設計では `replace()` は内部で
 * 一切 select しない。呼び出し元 (RecordClient.tsx) が保存開始時点で
 * `TeamRelayRecordsAPI.resolveRelayRecordIdsForRecords()` を呼び、
 * `relay_record_legs.select("relay_record_id").in("record_id", recordIds)` の
 * 結果から `relay_records.id` を逆引きして `replace()` に渡す。
 * このフェイクはその `relay_record_legs` の行を模擬する。
 */
function staleRelayLegRows(relayRecordIds: readonly string[] = ["stale-relay-row"]) {
  return relayRecordIds.map((id) => ({ relay_record_id: id }));
}

type ExistingRecords = Parameters<typeof RecordClient>[0]["existingRecords"];

function renderRecordClient(
  existingRecords: ExistingRecords,
  members: Parameters<typeof RecordClient>[0]["members"] = membersAllMale,
) {
  return render(
    <RecordClient
      teamId="team-thrush"
      competitionId="comp-thrush"
      competition={baseCompetition}
      teamName="ツグミ"
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

const relayInsertsOf = (mock: RecordSaveSupabaseMock) =>
  mock.insertCalls.filter((call) => call.table === "relay_records");
const legInsertsOf = (mock: RecordSaveSupabaseMock) =>
  mock.insertCalls.filter((call) => call.table === "relay_record_legs");

beforeEach(() => {
  fake = buildRecordSaveSupabaseMock();
  mocks.push.mockClear();
});

// ---------------------------------------------------------------------------
// [V-SG-01]
//
// ミューテーション手順 (PM 用):
//   RecordClient.tsx の
//     if (needsRelayWork && !hasError) {
//   を
//     if (needsRelayWork) {
//   にすると、`records` が一部しか書けていない状態でも総合タイムが書かれる。
//   → このブロックの 3 テストが赤になるはず。
// ---------------------------------------------------------------------------
describe("[V-SG-01] records が1件でも失敗したら relay 側を1行も書かない", () => {
  it("4 レグのうち 3 本目の records update が失敗すると relay_records に insert しない", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    // fixture (relayExistingRecords) は保存前から存在する4行なので、upsert化後は
    // INSERT ではなく UPDATE として書かれる。よって失敗させるのも updateError 側。
    fake = buildRecordSaveSupabaseMock({
      updateError: (table, _payload, nth) =>
        table === "records" && nth === 3 ? { message: "update denied", code: "23505" } : null,
    });

    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error.saveFailed"));

    expect(relayInsertsOf(fake)).toHaveLength(0);
    expect(legInsertsOf(fake)).toHaveLength(0);
    // 保存に失敗したので画面遷移もしない
    expect(mocks.push).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it("失敗時は relay_records を select すらしない (差し替えを開始していない)", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    fake = buildRecordSaveSupabaseMock({
      updateError: (table, _payload, nth) =>
        table === "records" && nth === 1 ? { message: "update denied", code: "23505" } : null,
    });

    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error.saveFailed"));

    expect(fake.selectCalls.filter((call) => call.table === "relay_records")).toHaveLength(0);
    expect(fake.deleteCalls.filter((call) => call.table === "relay_records")).toHaveLength(0);

    alertSpy.mockRestore();
  });

  it("すべて成功した場合は relay_records に 1 本だけ insert する (対照)", async () => {
    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    expect(relayInsertsOf(fake)).toHaveLength(1);
    expect(legInsertsOf(fake)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// [V-SG-02]
//
// ミューテーション手順 (PM 用):
//   RecordClient.tsx の
//     if (!failed && existingForMatch.length > 0) {
//   を
//     if (existingForMatch.length > 0) {
//   にすると、新しい行を書けていないのに古い行を消す (記録が完全に消える)。
//   → 下記 1 本目が赤になるはず。
// ---------------------------------------------------------------------------
describe("[V-SG-02] 古い行の delete は全計画が成功したときだけ", () => {
  it("relay_records の insert が失敗したら古い行を delete しない (記録を完全に失わない)", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    fake = buildRecordSaveSupabaseMock({
      selectRows: { relay_record_legs: staleRelayLegRows() },
      insertError: (table) =>
        table === "relay_records" ? { message: "insert denied", code: "42501" } : null,
    });

    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error.saveFailed"));

    // 古い行は残る = delete が発行されていない
    expect(fake.deleteCalls.filter((call) => call.table === "relay_records")).toHaveLength(0);
    expect(fake.inCalls.filter((call) => call.table === "relay_records")).toHaveLength(0);

    alertSpy.mockRestore();
  });

  it("すべて成功したら古い行を delete する (対照。古い行が残り続けない)", async () => {
    fake = buildRecordSaveSupabaseMock({
      selectRows: { relay_record_legs: staleRelayLegRows() },
    });

    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    expect(fake.inCalls.filter((call) => call.table === "relay_records")).toEqual([
      { table: "relay_records", op: "delete", column: "id", values: ["stale-relay-row"] },
    ]);
  });

  it("古い行が 1 件も無ければ delete を発行しない (無駄なクエリを撃たない)", async () => {
    fake = buildRecordSaveSupabaseMock({ selectRows: { relay_records: [] } });

    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    expect(fake.deleteCalls.filter((call) => call.table === "relay_records")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// [V-SG-03]
//
// ミューテーション手順 (PM 用):
//   古い行の delete を
//     .delete().in("id", existingForMatch.map(...))
//   から
//     .delete().eq("team_id", teamId).eq("competition_id", competitionId)
//   に変えると、**今 insert した行も一緒に消える**。
//   → 「delete が明示 id である」assert と「insert → delete の順序」assert が
//     赤になるはず。
// ---------------------------------------------------------------------------
describe("[V-SG-03] 差し替え順序と delete の条件", () => {
  it("delete は明示の id リストで行う (team_id / competition_id の条件 delete にしない)", async () => {
    fake = buildRecordSaveSupabaseMock({
      selectRows: { relay_record_legs: staleRelayLegRows() },
    });

    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    const deleteFilters = fake.eqCalls.filter(
      (call) => call.table === "relay_records" && call.op === "delete",
    );
    // 条件 delete の痕跡 (team_id / competition_id での .eq) が無いこと
    expect(deleteFilters.map((call) => call.column)).not.toContain("team_id");
    expect(deleteFilters.map((call) => call.column)).not.toContain("competition_id");

    // 明示 id リストで消していること
    expect(fake.inCalls.filter((call) => call.table === "relay_records")).toEqual([
      { table: "relay_records", op: "delete", column: "id", values: ["stale-relay-row"] },
    ]);
  });

  it("insert が delete より先に発行される (逆順にすると insert 失敗で記録が消える)", async () => {
    fake = buildRecordSaveSupabaseMock({
      selectRows: { relay_record_legs: staleRelayLegRows() },
    });

    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    // 全操作を発生順に記録した列で順序を実測する
    // (insertCalls / deleteCalls は別配列なので、それだけでは順序を証明できない)
    const relayOps = fake.operations
      .filter((op) => op.table === "relay_records" || op.table === "relay_record_legs")
      .map((op) => `${op.op}:${op.table}`);

    expect(relayOps).toEqual([
      "select:relay_record_legs", // 差し替え前の取得 (画面が読み込んだ records.id から relay_records.id を逆引き)
      "insert:relay_records", // 新しい親
      "insert:relay_record_legs", // 新しいレグ
      "delete:relay_records", // 事前に解決した古い行だけを明示 id で削除
    ]);

    const newRelayIds = fake.insertedIds.relay_records ?? [];
    expect(newRelayIds).toHaveLength(1);
    const deletedIds = fake.inCalls.find(
      (call) => call.table === "relay_records" && call.column === "id",
    )?.values;
    for (const newId of newRelayIds) {
      expect(deletedIds).not.toContain(newId);
    }
  });

  // 【修正ラウンド 2026-09-17 (Critical #1)】以前は「差し替え前の取得が
  // relay_records を team_id / competition_id でサーバー絞り込みしていること」を
  // 検証していた。これは旧 replace() の内部 SELECT を前提にしたアサーションで、
  // 新設計では replace() は内部 SELECT を一切行わない。
  // 「サーバー側で絞り込んでいること」を検証する意図そのものは維持し、検証対象を
  // 「relay_records への .eq(team_id/competition_id)」から
  // 「relay_record_legs への .in(record_id, 画面が読み込んだ records.id)」へ移す。
  // これが緩んで record_id 条件を外すと、大会・チームを跨いだ relay_record_legs
  // 全行が読めてしまい (クライアント filter との区別が付かなくなる)、
  // それを経由して他チームの relay_records.id が削除対象に混入しうる。
  it("差し替え前の取得は relay_record_legs を record_id (画面が読み込んだ records.id 集合) でサーバー絞り込みする", async () => {
    fake = buildRecordSaveSupabaseMock({
      selectRows: { relay_record_legs: staleRelayLegRows() },
    });

    const existingRecords = relayExistingRecords();
    renderRecordClient(existingRecords);
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    const legScopeSelect = fake.inCalls.filter(
      (call) => call.table === "relay_record_legs" && call.op === "select",
    );
    expect(legScopeSelect).toEqual([
      {
        table: "relay_record_legs",
        op: "select",
        column: "record_id",
        values: existingRecords.map((r) => r.id),
      },
    ]);

    // relay_records 自体への条件 select (旧内部 SELECT) はもう発生しない
    expect(fake.selectCalls.filter((call) => call.table === "relay_records")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// [V-SG-04]
//
// ミューテーション手順 (PM 用):
//   RecordClient.tsx の `if (legError) { ... }` ブロックから
//     await supabase.from("relay_records").delete().eq("id", newRelay.id)
//   を削除すると、レグの無い親が残りランキングにラップ無しの行が出る。
//   → このブロックの 1 本目が赤になるはず。
// ---------------------------------------------------------------------------
describe("[V-SG-04] レグ insert 失敗で親を巻き戻す", () => {
  it("relay_record_legs の insert が失敗したら、今 insert した親を id 指定で delete する", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    fake = buildRecordSaveSupabaseMock({
      insertError: (table) =>
        table === "relay_record_legs" ? { message: "legs denied", code: "23503" } : null,
    });

    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error.saveFailed"));

    const newRelayIds = fake.insertedIds.relay_records ?? [];
    expect(newRelayIds).toHaveLength(1);

    // 巻き戻しは「今 insert した親の id」を指定した delete
    expect(
      fake.eqCalls
        .filter((call) => call.table === "relay_records" && call.op === "delete")
        .map((call) => [call.column, call.value]),
    ).toEqual([["id", newRelayIds[0]]]);

    alertSpy.mockRestore();
  });

  it("レグ失敗時も古い行は残す (巻き戻しと古い行の削除を混同しない)", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    fake = buildRecordSaveSupabaseMock({
      selectRows: { relay_record_legs: staleRelayLegRows() },
      insertError: (table) =>
        table === "relay_record_legs" ? { message: "legs denied", code: "23503" } : null,
    });

    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith("error.saveFailed"));

    // 古い行の delete (`.in("id", [...])`) は発行されない
    expect(fake.inCalls.filter((call) => call.table === "relay_records")).toHaveLength(0);

    alertSpy.mockRestore();
  });

  it("レグ insert が成功したときは巻き戻しの delete を発行しない (対照)", async () => {
    fake = buildRecordSaveSupabaseMock({ selectRows: { relay_records: [] } });

    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    expect(
      fake.eqCalls.filter((call) => call.table === "relay_records" && call.op === "delete"),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// [V-SG-05] [V-SG-06] [V-SG-07] [V-SG-08] [V-SG-09]
// ---------------------------------------------------------------------------
describe("[V-SG-05] created_by をクライアントから送らない", () => {
  it("relay_records の insert payload に created_by が無い (DB DEFAULT auth.uid() に任せる)", async () => {
    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    const payload = relayInsertsOf(fake)[0]?.payload as Record<string, unknown>;
    expect(payload).toBeDefined();
    expect(Object.keys(payload)).not.toContain("created_by");
    expect(Object.keys(payload)).not.toContain("user_id");
  });

  it("relay_records の insert payload が契約どおりの列だけを持つ", async () => {
    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    const payload = relayInsertsOf(fake)[0]?.payload as Record<string, unknown>;
    // note は PM 裁定で列そのものが廃止された。8 列 → 7 列
    expect(Object.keys(payload).sort()).toEqual(
      [
        "competition_id",
        "gender_category",
        "leg_count",
        "leg_distance",
        "pool_type",
        "relay_kind",
        "team_id",
        "total_time",
      ].sort(),
    );
    expect(Object.keys(payload)).not.toContain("note");
    expect(payload.team_id).toBe("team-thrush");
    expect(payload.competition_id).toBe("comp-thrush");
    expect(payload.relay_kind).toBe("free");
    expect(payload.leg_distance).toBe(50);
    expect(payload.leg_count).toBe(4);
    // 大会の水路をそのまま使う (?? で片方に寄せていない)
    expect(payload.pool_type).toBe(0);
    expect(payload.total_time).toBe(RELAY_TOTAL_TIME);
  });
});

describe("[V-SG-06] 個人種目だけの保存は relay_records に一切触れない", () => {
  it("is_relaying の記録が無い保存では relay_records を select も insert もしない", async () => {
    renderRecordClient(individualOnlyRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    // individualOnlyRecords() は保存前から存在する1行なので UPDATE になる (INSERT ではない)
    expect(fake.insertCalls.filter((call) => call.table === "records")).toHaveLength(0);
    expect(fake.updateCalls.filter((call) => call.table === "records")).toHaveLength(1);
    expect(fake.selectCalls.filter((call) => call.table === "relay_records")).toHaveLength(0);
    // 差し替え前の逆引き (relay_record_legs) すら発行しない
    // (needsRelayWork が false なので resolveRelayRecordIdsForRecords 自体を呼ばない)
    expect(fake.selectCalls.filter((call) => call.table === "relay_record_legs")).toHaveLength(0);
    expect(fake.inCalls.filter((call) => call.table === "relay_record_legs")).toHaveLength(0);
    expect(relayInsertsOf(fake)).toHaveLength(0);
    expect(legInsertsOf(fake)).toHaveLength(0);
    expect(fake.deleteCalls.filter((call) => call.table === "relay_records")).toHaveLength(0);
  });
});

describe("[V-SG-07] レグの payload", () => {
  it("leg_index は 0-based で 0..3、legTime は区間タイム (通算ではない)", async () => {
    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    const legRows = legInsertsOf(fake)[0]?.payload as Array<Record<string, unknown>>;
    expect(legRows).toHaveLength(4);
    expect(legRows.map((row) => row.leg_index)).toEqual([0, 1, 2, 3]);

    // 区間タイム。通算 [27.50, 56.20, 84.50, 112.10] が入っていたら退行
    expect(legRows.map((row) => row.leg_time)).toEqual([27.5, 28.7, 28.3, 27.6]);
    expect(legRows.map((row) => row.leg_time)).not.toEqual([27.5, 56.2, 84.5, 112.1]);
  });

  it("record_id が保存された records の id を指す (レグと個人記録が繋がっている)", async () => {
    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    // relayExistingRecords() は保存前から存在する4行なので UPDATE で書かれ、
    // id は新規採番されず既存の records.id (fake.insertedIds.records ではなく
    // updateCalls の eq 条件) のまま保持される。
    const recordUpdates = fake.updateCalls.filter((call) => call.table === "records");
    expect(recordUpdates).toHaveLength(4);
    const updatedRecordIds = recordUpdates.map((call) => call.eq[0]?.value);

    const legRows = legInsertsOf(fake)[0]?.payload as Array<Record<string, unknown>>;
    expect(legRows.map((row) => row.record_id)).toEqual(updatedRecordIds);
    expect(updatedRecordIds).toEqual([
      "existing-record-0",
      "existing-record-1",
      "existing-record-2",
      "existing-record-3",
    ]);
  });

  it("relay_record_id が今 insert した親の id を指す", async () => {
    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    const newRelayId = (fake.insertedIds.relay_records ?? [])[0];
    const legRows = legInsertsOf(fake)[0]?.payload as Array<Record<string, unknown>>;
    expect(new Set(legRows.map((row) => row.relay_record_id))).toEqual(new Set([newRelayId]));
  });

  it("user_id は 4 レグそれぞれの泳者になる (第1泳者に潰れない)", async () => {
    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    const legRows = legInsertsOf(fake)[0]?.payload as Array<Record<string, unknown>>;
    expect(legRows.map((row) => row.user_id)).toEqual([...RELAY_USER_IDS]);
  });
});

describe("[V-SG-08] 性別区分の prefill", () => {
  it("メンバー一覧に居ない泳者を含む編成は mixed になる (?? 0 で男性に寄せない)", async () => {
    // 「性別不明」の唯一の到達経路 = 記録が書かれた後にその泳者がチームを離れ、
    // `members` から消えたが `records.user_id` は残っている状態
    renderRecordClient(relayExistingRecords(), membersWithoutAnchor);
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    const payload = relayInsertsOf(fake)[0]?.payload as Record<string, unknown>;
    expect(payload.gender_category).toBe("mixed");
    expect(payload.gender_category).not.toBe("male");
  });

  it("4 人全員 gender=0 なら male になる (対照。常に mixed にしているわけではない)", async () => {
    renderRecordClient(relayExistingRecords(), membersAllMale);
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    const payload = relayInsertsOf(fake)[0]?.payload as Record<string, unknown>;
    expect(payload.gender_category).toBe("male");
  });
});

describe("[V-SG-09] 古い行は自然キーに関係なくすべて削除対象になる", () => {
  // note 列の廃止で自然キー照合は不要になった。
  // 【修正ラウンド 2026-09-17】差し替えのスコープは (team_id, competition_id) の
  // 全行ではなく、「画面が読み込んだ records.id から relay_record_legs 経由で
  // 逆引きした relay_records.id」になった (Critical #1 対応)。この単一大会の
  // シナリオでは resolveRelayRecordIdsForRecords が返す relay_records.id は
  // 種類・距離・泳者に関わらず削除対象に含まれる — 狭めるとフォームから削除した
  // リレーが孤児として残り、`records` が消えた後もランキングに出続ける、という
  // 意図は id ベースの新設計でも同じ。
  it("種類・距離・泳者が違う古い行も削除対象に含まれる (孤児を残さない)", async () => {
    fake = buildRecordSaveSupabaseMock({
      selectRows: {
        relay_record_legs: staleRelayLegRows([
          "stale-medley-row",
          "stale-other-distance-row",
          "stale-other-squad-row",
        ]),
      },
    });

    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    expect(fake.inCalls.filter((call) => call.table === "relay_records")).toEqual([
      {
        table: "relay_records",
        op: "delete",
        column: "id",
        values: ["stale-medley-row", "stale-other-distance-row", "stale-other-squad-row"],
      },
    ]);
  });

  // 【修正ラウンド 2026-09-17】以前は「relay_records を select("id") しか読まない
  // (note 列を読み戻していない)」ことを検証していた。新設計では relay_records 自体は
  // 一切 select されず、代わりに relay_record_legs を "relay_record_id" 列だけ読む。
  // 「廃止した note 列を読み戻していないこと」という意図は、対象テーブルが変わっても
  // 同じ形で維持できる (relay_record_legs にはそもそも note 列が無いが、余計な列を
  // 読んでいないことの回帰防止として残す)。
  it("差し替え前の取得は relay_record_legs の relay_record_id しか読まない (relay_records 自体は select しない)", async () => {
    fake = buildRecordSaveSupabaseMock({
      selectRows: { relay_record_legs: staleRelayLegRows() },
    });

    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    expect(fake.selectCalls.filter((call) => call.table === "relay_records")).toHaveLength(0);

    const selectCall = fake.selectCalls.find((call) => call.table === "relay_record_legs");
    expect(selectCall?.columns).toBe("relay_record_id");
    expect(selectCall?.columns).not.toContain("note");
  });

  it("insert payload に note を送らない (DB に列が無いので送ると insert が落ちる)", async () => {
    renderRecordClient(relayExistingRecords());
    clickSave();

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/teams-admin/team-thrush?tab=competitions"),
    );

    const payload = relayInsertsOf(fake)[0]?.payload as Record<string, unknown>;
    expect(Object.keys(payload)).not.toContain("note");
  });
});
