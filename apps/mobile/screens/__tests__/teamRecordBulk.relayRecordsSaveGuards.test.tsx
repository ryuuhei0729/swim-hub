// =============================================================================
// teamRecordBulk.relayRecordsSaveGuards.test.tsx
// relay_records / relay_record_legs 差し替えの防波堤 (mobile)
// (QA Sprint Contract Phase B / 第3弾)
// =============================================================================
//
// web の `apps/web/__tests__/records/relayRecordsSaveGuards.test.tsx` と**対**。
// 両 Developer が確定させた保存の方針は web / mobile で同一なので、
// 同じ観点を mobile 側でも独立に固定する
// (片方だけ壊れる形の退行が SwimHub で最も起きやすい)。
//
// Sprint Contract 検証観点:
//   [V-MG-01] `records` が1件でも失敗したら relay 側は **1行も書かない**
//   [V-MG-02] 古い行の delete は **全計画が成功したときだけ**
//   [V-MG-03] 差し替えは **明示 id の delete**。team_id / competition_id の
//             条件 delete にしていない。差し替え前の取得は両方でサーバー絞り込み
//   [V-MG-04] レグ insert 失敗で **今 insert した親を巻き戻す**
//   [V-MG-05] `created_by` をクライアントから送らない
//   [V-MG-06] 個人種目だけの保存は relay_records に一切触れない
//   [V-MG-07] レグの leg_index / leg_time / record_id / user_id が正しい
//   [V-MG-08] 性別不明のメンバーは `mixed` に寄せる (`?? 0` で男性にしない)
//   [V-MG-09] 総合タイム・水路が web と同じ値になる (パリティ) /
//             古い行は自然キーに関係なくすべて削除対象
//
// ⚠️ `relay_records.note` は PM 裁定で列そのものが廃止された (非 NULL を書く
//    経路がどこにも無かった)。これに伴い shared の `findExistingRelayForNote` も
//    削除され、insert payload は 8 列 → 7 列になった。
//    「note を引き継ぐ」観点は機構ごと存在しないので pin し直さない。
//
// トートロジー防止:
//   期待値 (総合 112.10 / 区間 27.50, 28.70, 28.30, 27.60) は fixture から
//   手で計算したリテラル。プロダクションの calcCumulativeTimes を呼ばない。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return {
    ...actual,
    KeyboardAvoidingView: actual.View,
  };
});

const mocks = vi.hoisted(() => {
  /** styles.id 2 = 50m 自由形 → 4 レグ揃うと relay_4x50_free が検出される */
  const style = {
    id: 2,
    name_jp: "50m自由形",
    name: "50m Freestyle",
    style: "Fr",
    distance: 50,
  };

  const responses: Record<string, { data: unknown; error: unknown }> = {};
  const insertCalls: Array<{ table: string; payload: unknown }> = [];
  const updateCalls: Array<{ table: string; payload: unknown; eq: Array<{ column: string; value: unknown }> }> = [];
  const deleteCalls: Array<{ table: string }> = [];
  /** 全操作の発生順 (insert → delete の順序を証明するのに使う) */
  const operations: Array<{ table: string; op: string }> = [];
  /**
   * `.eq()` の列名・値を発生順に記録する。
   * 🚨 引数を捨てるとサーバー絞り込みとクライアント filter を区別できない。
   */
  const eqCalls: Array<{ table: string; op: string | null; column: string; value: unknown }> = [];
  const inCalls: Array<{ table: string; op: string | null; column: string; values: unknown[] }> =
    [];
  const insertedIds: Record<string, string[]> = {};

  /** `insert().select("id").single()` が id を払い出すテーブル */
  const ID_ISSUING_TABLES = new Set(["records", "relay_records"]);

  function makeSupabase() {
    const idSeq: Record<string, number> = {};

    const issueId = (table: string): string => {
      idSeq[table] = (idSeq[table] ?? 0) + 1;
      const id = `fake-${table}-id-${idSeq[table]}`;
      (insertedIds[table] ??= []).push(id);
      return id;
    };

    return {
      from: (table: string) => {
        let op: string | null = null;
        let pendingUpdate: { table: string; payload: unknown; eq: Array<{ column: string; value: unknown }> } | null = null;
        const builder: {
          select: (..._a: unknown[]) => typeof builder;
          eq: (column: string, value: unknown) => typeof builder;
          order: (..._a: unknown[]) => typeof builder;
          in: (column: string, values: unknown[]) => typeof builder;
          insert: (payload: unknown) => typeof builder;
          update: (payload: unknown) => typeof builder;
          delete: (..._a: unknown[]) => typeof builder;
          single: () => Promise<{ data: unknown; error: unknown }>;
          then: (resolve: (v: { data: unknown; error: unknown }) => void) => void;
        } = {
          select: (..._a) => {
            if (!op) {
              op = "select";
              operations.push({ table, op });
            }
            return builder;
          },
          eq: (column: string, value: unknown) => {
            eqCalls.push({ table, op, column, value });
            if (op === "update" && pendingUpdate) pendingUpdate.eq.push({ column, value });
            return builder;
          },
          order: () => builder,
          in: (column: string, values: unknown[]) => {
            inCalls.push({ table, op, column, values: [...values] });
            return builder;
          },
          insert: (payload: unknown) => {
            if (!op) {
              op = "insert";
              operations.push({ table, op });
            }
            insertCalls.push({ table, payload });
            return builder;
          },
          update: (payload: unknown) => {
            if (!op) {
              op = "update";
              operations.push({ table, op });
            }
            pendingUpdate = { table, payload, eq: [] };
            updateCalls.push(pendingUpdate);
            return builder;
          },
          delete: (..._a) => {
            if (!op) {
              op = "delete";
              operations.push({ table, op });
            }
            deleteCalls.push({ table });
            return builder;
          },
          single: () => {
            // テストが明示した応答を最優先する (失敗注入をここで潰さない)
            const override = responses[`${op}:${table}`];
            if (override) return Promise.resolve(override);
            if (op === "insert" && ID_ISSUING_TABLES.has(table)) {
              return Promise.resolve({ data: { id: issueId(table) }, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          },
          then: (resolve) => {
            const override = responses[`${op}:${table}`];
            if (override) return resolve(override);
            if (op === "update") {
              // 【修正ラウンド 2026-09-17】production (`saveStyleRecords.ts`) が
              // `.update(payload).eq("id", id).select("id")` で 0 行 UPDATE を
              // 検知して INSERT にフォールバックするようになった (High #2)。
              // テストが明示的に上書きしない限り「1行ヒット (成功)」をデフォルトに
              // する (production の呼び出し形は必ず `.eq("id", ...)` を伴うため)。
              // 空配列を明示的に `responses` へ設定したテストだけが 0 行を再現できる。
              const idEq = pendingUpdate?.eq.find((e) => e.column === "id");
              return resolve({ data: idEq ? [{ id: idEq.value }] : [{}], error: null });
            }
            return resolve({ data: null, error: null });
          },
        };
        return builder;
      },
    };
  }

  /**
   * メンバー一覧 (テストごとに差し替える)。
   * 既定は 4 人全員 gender=0 → 性別区分は male。
   *
   * 「性別不明」の到達経路は **泳者がメンバー一覧に居ないこと** である
   * (記録が書かれた後にその泳者がチームを離れると `members` から消えるが
   *  `records.user_id` は残る)。`gender` を undefined にする経路ではない。
   */
  const teamMembers: Array<{
    user_id: string;
    role: string;
    users: { id: string; name: string; gender?: number };
  }> = [
    { user_id: "user-lead", role: "admin", users: { id: "user-lead", name: "リード", gender: 0 } },
    {
      user_id: "user-second",
      role: "user",
      users: { id: "user-second", name: "セカンド", gender: 0 },
    },
    { user_id: "user-third", role: "user", users: { id: "user-third", name: "サード", gender: 0 } },
    {
      user_id: "user-anchor",
      role: "user",
      users: { id: "user-anchor", name: "アンカー", gender: 0 },
    },
  ];

  return {
    style,
    responses,
    insertCalls,
    updateCalls,
    deleteCalls,
    operations,
    eqCalls,
    inCalls,
    insertedIds,
    teamMembers,
    supabase: makeSupabase(),
    routeParams: {
      competitionId: "comp-thrush",
      teamId: "team-thrush",
      relayEventId: "relay_4x50_free",
    } as Record<string, unknown>,
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(async () => "test-access-token"),
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
  usePreventRemove: () => undefined,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabase,
    subscription: null,
    user: { id: "user-lead" },
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({
    members: mocks.teamMembers,
    isLoading: false,
  }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimesDetailedForUsers = vi.fn(async () => new Map());
  },
}));

vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/records/LapTimeDisplay", () => ({ LapTimeDisplay: () => null }));
vi.mock("@/components/teams/MemberSelectModal", () => ({ MemberSelectModal: () => null }));

import { Alert } from "react-native";
import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/**
 * 区間タイム 27.50 / 28.70 / 28.30 / 27.60、総合 112.10 (手計算)。
 * is_relaying = [false, true, true, true] の 4 行連続 + style_id 2。
 */
const RELAY_LEG_TIMES = [27.5, 28.7, 28.3, 27.6] as const;
const RELAY_TOTAL_TIME = 112.1;
const RELAY_USER_IDS = ["user-lead", "user-second", "user-third", "user-anchor"] as const;

function relayRecordRows() {
  return RELAY_LEG_TIMES.map((time, index) => ({
    id: `existing-record-${index}`,
    user_id: RELAY_USER_IDS[index],
    style_id: 2,
    time,
    is_relaying: index !== 0,
    reaction_time: null,
    note: null,
    split_times: [],
    users: { id: RELAY_USER_IDS[index], name: `泳者${index}` },
  }));
}

/**
 * 差し替え前に存在する古い `relay_records.id` を解決するための `relay_record_legs`
 * フェイク行。
 *
 * 【修正ラウンド 2026-09-17 (Critical #1)】以前は `replace()` 自身が
 * `relay_records.select("id").eq("team_id", ...).eq("competition_id", ...)
 * .eq("relay_kind", ...).eq("leg_distance", ...)` で古い行を取得していたが、
 * これは同じ種目に複数チーム/組がある場合に他チームの行を巻き込んで削除して
 * しまう Critical だった。新設計では `replace()` は内部で一切 select しない。
 * 画面が読み込み時点 (`TeamRecordStyleDetailScreen.load()`) で
 * `scopeRelayRecordIdsForLegRecords` (= `TeamRelayRecordsAPI.resolveRelayRecordIdsForRecords`)
 * を呼び、`relay_record_legs.select("relay_record_id").in("record_id", recordIds)`
 * の結果から `relay_records.id` を逆引きする。このフェイクはその行を模擬する。
 */
function staleRelayLegRows(relayRecordIds: readonly string[] = ["stale-relay-row"]) {
  return relayRecordIds.map((id) => ({ relay_record_id: id }));
}

function resetMocks() {
  vi.clearAllMocks();
  mocks.insertCalls.length = 0;
  mocks.updateCalls.length = 0;
  mocks.deleteCalls.length = 0;
  mocks.operations.length = 0;
  mocks.eqCalls.length = 0;
  mocks.inCalls.length = 0;
  for (const table of Object.keys(mocks.insertedIds)) delete mocks.insertedIds[table];
  for (const key of Object.keys(mocks.responses)) delete mocks.responses[key];

  mocks.getStyles.mockResolvedValue([mocks.style]);
  mocks.responses["select:competitions"] = {
    data: { id: "comp-thrush", title: "ツグミ記録会", pool_type: 0 },
    error: null,
  };
  mocks.responses["delete:records"] = { data: null, error: null };
  // routeParams はテストをまたいで書き換わる可変オブジェクトなので、
  // describe ブロックが独自に上書きしない限りリレー種目詳細画面が既定になるよう
  // 毎回リセットする (V-MG-06 が個人種目用に上書きした状態が後続 describe に
  // 漏れ残ると、テスト順序に依存する偽の green/red を生む)。
  mocks.routeParams = {
    competitionId: "comp-thrush",
    teamId: "team-thrush",
    relayEventId: "relay_4x50_free",
  };
}

async function renderAndSave() {
  const queryClient = makeQueryClient();
  render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

  await waitFor(() => {
    expect(screen.getByText("記録を保存")).toBeDefined();
  });
  fireEvent.click(screen.getByText("記録を保存"));
}

const relayInserts = () => mocks.insertCalls.filter((call) => call.table === "relay_records");
const legInserts = () => mocks.insertCalls.filter((call) => call.table === "relay_record_legs");

// ---------------------------------------------------------------------------
// [V-MG-01]
//
// ミューテーション手順 (PM 用):
//   TeamRecordBulkFormScreen.tsx の `if (needsRelayWork && !hasError) {` を
//   `if (needsRelayWork) {` にすると、`records` が一部しか書けていない状態でも
//   総合タイムが書かれる。→ このブロックの 2 テストが赤になるはず。
// ---------------------------------------------------------------------------
describe("[V-MG-01] records が1件でも失敗したら relay 側を1行も書かない (mobile)", () => {
  beforeEach(() => {
    resetMocks();
    mocks.responses["select:records"] = { data: relayRecordRows(), error: null };
  });

  it("records の update が失敗すると relay_records に insert も select もしない", async () => {
    // relayRecordRows() は保存前から存在する4行なので upsert 化後は UPDATE で書かれる
    // (INSERT ではない)。よって失敗させるのも update 側。
    mocks.responses["update:records"] = {
      data: null,
      error: { message: "update denied", code: "23505" },
    };

    await renderAndSave();

    // ⚠️ 「relay の insert が 0 件」を保存処理の途中で見ると、まだ到達していない
    //    だけで緑になる (ミューテーションを見逃す)。保存処理が hasError で
    //    終わり切ったこと (= Alert が出たこと) を先に待つ。
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    expect(mocks.updateCalls.filter((call) => call.table === "records")).toHaveLength(4);
    expect(mocks.insertCalls.filter((call) => call.table === "records")).toHaveLength(0);
    // 保存に失敗したので画面も戻らない
    expect(mocks.goBack).not.toHaveBeenCalled();

    expect(relayInserts()).toHaveLength(0);
    expect(legInserts()).toHaveLength(0);
    expect(mocks.operations.filter((op) => op.table === "relay_records")).toHaveLength(0);
  });

  it("すべて成功した場合は relay_records に 1 本だけ insert する (対照)", async () => {
    await renderAndSave();

    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    expect(relayInserts()).toHaveLength(1);
    expect(legInserts()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// [V-MG-02]
//
// ミューテーション手順 (PM 用):
//   `if (!failed && existingForMatch.length > 0) {` を
//   `if (existingForMatch.length > 0) {` にすると、新しい行を書けていないのに
//   古い行を消す。→ このブロックの 1 本目が赤になるはず。
// ---------------------------------------------------------------------------
describe("[V-MG-02] 古い行の delete は全計画が成功したときだけ (mobile)", () => {
  beforeEach(() => {
    resetMocks();
    mocks.responses["select:records"] = { data: relayRecordRows(), error: null };
    mocks.responses["select:relay_record_legs"] = { data: staleRelayLegRows(), error: null };
  });

  it("relay_records の insert が失敗したら古い行を delete しない", async () => {
    mocks.responses["insert:relay_records"] = {
      data: null,
      error: { message: "insert denied", code: "42501" },
    };

    await renderAndSave();

    // 保存処理が終わり切ってから見る (途中で見ると未到達なだけで緑になる)
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    expect(relayInserts()).toHaveLength(1);
    expect(mocks.inCalls.filter((call) => call.table === "relay_records")).toHaveLength(0);
    expect(mocks.deleteCalls.filter((call) => call.table === "relay_records")).toHaveLength(0);
  });

  it("すべて成功したら古い行を明示 id で delete する (対照)", async () => {
    await renderAndSave();

    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    expect(mocks.inCalls.filter((call) => call.table === "relay_records")).toEqual([
      { table: "relay_records", op: "delete", column: "id", values: ["stale-relay-row"] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// [V-MG-03]
//
// ミューテーション手順 (PM 用):
//   古い行の delete を `.in("id", ...)` から
//   `.eq("team_id", teamId).eq("competition_id", competitionId)` に変えると
//   **今 insert した行も一緒に消える**。→ 下記 2 テストが赤になるはず。
// ---------------------------------------------------------------------------
describe("[V-MG-03] 差し替え順序と delete の条件 (mobile)", () => {
  beforeEach(() => {
    resetMocks();
    mocks.responses["select:records"] = { data: relayRecordRows(), error: null };
    mocks.responses["select:relay_record_legs"] = { data: staleRelayLegRows(), error: null };
  });

  it("relay_records の操作順は (画面ロード時の relay_record_legs select) → insert → (レグ insert) → delete である", async () => {
    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    const relayOps = mocks.operations
      .filter((op) => op.table === "relay_records" || op.table === "relay_record_legs")
      .map((op) => `${op.op}:${op.table}`);

    // 画面ロード時点 (TeamRecordStyleDetailScreen.load()) で
    // relay_record_legs から relay_records.id を逆引きしておき (select)、
    // 保存時は insert → insert(legs) → delete の順に書く。
    // relay_records 自体への事前 select はもう発生しない。
    expect(relayOps).toEqual([
      "select:relay_record_legs",
      "insert:relay_records",
      "insert:relay_record_legs",
      "delete:relay_records",
    ]);
  });

  it("delete は明示 id で行い、team_id / competition_id の条件 delete にしない", async () => {
    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    const deleteFilters = mocks.eqCalls.filter(
      (call) => call.table === "relay_records" && call.op === "delete",
    );
    expect(deleteFilters.map((call) => call.column)).not.toContain("team_id");
    expect(deleteFilters.map((call) => call.column)).not.toContain("competition_id");

    // 今 insert した行の id は削除対象に入っていない
    const newRelayIds = mocks.insertedIds.relay_records ?? [];
    expect(newRelayIds).toHaveLength(1);
    const deletedIds = mocks.inCalls.find(
      (call) => call.table === "relay_records" && call.column === "id",
    )?.values;
    for (const newId of newRelayIds) {
      expect(deletedIds).not.toContain(newId);
    }
  });

  // 【修正ラウンド 2026-09-17 (Critical #1)】以前は「差し替え前の取得が
  // relay_records を team_id/competition_id/relay_kind/leg_distance でサーバー
  // 絞り込みしていること」を検証していた。これは DB 列条件による絞り込みを前提に
  // したアサーションであり、新設計ではこの絞り込み自体が Critical の原因だった
  // (同一種目の別チーム/別組の行を区別できない)。
  // 「サーバー側で絞り込んでいること」を検証する意図は維持し、検証対象を
  // 「relay_records への列条件 .eq()」から「relay_record_legs への
  // .in(record_id, この種目詳細画面が読み込んだ records.id 集合)」へ移す。
  it("差し替え前の取得は relay_record_legs を record_id (この種目詳細画面が読み込んだ records.id 集合) でサーバー絞り込みする", async () => {
    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    const legScopeIn = mocks.inCalls.filter(
      (call) => call.table === "relay_record_legs" && call.op === "select",
    );
    expect(legScopeIn).toEqual([
      {
        table: "relay_record_legs",
        op: "select",
        column: "record_id",
        values: relayRecordRows().map((r) => r.id),
      },
    ]);

    // relay_records 自体への条件 select (旧内部 SELECT) はもう発生しない
    expect(mocks.eqCalls.filter((call) => call.table === "relay_records" && call.op === "select")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// [V-MG-04]
//
// ミューテーション手順 (PM 用):
//   `if (legError) { ... }` から
//   `await supabase.from("relay_records").delete().eq("id", newRelay.id)` を
//   削除すると、レグの無い親が残る。→ 下記 1 本目が赤になるはず。
// ---------------------------------------------------------------------------
describe("[V-MG-04] レグ insert 失敗で親を巻き戻す (mobile)", () => {
  beforeEach(() => {
    resetMocks();
    mocks.responses["select:records"] = { data: relayRecordRows(), error: null };
  });

  it("relay_record_legs の insert が失敗したら今 insert した親を id 指定で delete する", async () => {
    mocks.responses["insert:relay_record_legs"] = {
      data: null,
      error: { message: "legs denied", code: "23503" },
    };

    await renderAndSave();

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    expect(legInserts()).toHaveLength(1);
    const newRelayIds = mocks.insertedIds.relay_records ?? [];
    expect(newRelayIds).toHaveLength(1);

    expect(
      mocks.eqCalls
        .filter((call) => call.table === "relay_records" && call.op === "delete")
        .map((call) => [call.column, call.value]),
    ).toEqual([["id", newRelayIds[0]]]);
  });

  it("レグ insert が成功したときは巻き戻しの delete を発行しない (対照)", async () => {
    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    expect(
      mocks.eqCalls.filter((call) => call.table === "relay_records" && call.op === "delete"),
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// [V-MG-05] 〜 [V-MG-09]
// ---------------------------------------------------------------------------
describe("[V-MG-05] created_by をクライアントから送らない (mobile)", () => {
  beforeEach(() => {
    resetMocks();
    mocks.responses["select:records"] = { data: relayRecordRows(), error: null };
  });

  it("relay_records の insert payload に created_by が無い", async () => {
    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    const payload = relayInserts()[0]?.payload as Record<string, unknown>;
    expect(payload).toBeDefined();
    expect(Object.keys(payload)).not.toContain("created_by");
    expect(Object.keys(payload)).not.toContain("user_id");
  });

  it("insert payload が契約どおりの列だけを持つ (web と同一の形)", async () => {
    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    const payload = relayInserts()[0]?.payload as Record<string, unknown>;
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
  });
});

describe("[V-MG-06] 個人種目だけの保存は relay_records に一切触れない (mobile)", () => {
  beforeEach(() => {
    resetMocks();
    // 個人種目詳細画面として開く (relayEventId ではなく styleId スコープ)
    mocks.routeParams = { competitionId: "comp-thrush", teamId: "team-thrush", styleId: 2 };
    mocks.responses["select:records"] = {
      data: [
        {
          id: "existing-record-solo",
          user_id: "user-lead",
          style_id: 2,
          time: 26.4,
          is_relaying: false,
          reaction_time: null,
          note: null,
          split_times: [],
          users: { id: "user-lead", name: "リード" },
        },
      ],
      error: null,
    };
  });

  it("is_relaying の記録が無い保存では relay_records を select も insert もしない", async () => {
    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    // existing-record-solo は保存前から存在する既存行なので UPDATE される
    expect(mocks.insertCalls.filter((call) => call.table === "records")).toHaveLength(0);
    expect(mocks.updateCalls.filter((call) => call.table === "records")).toHaveLength(1);
    expect(mocks.operations.filter((op) => op.table === "relay_records")).toHaveLength(0);
    expect(mocks.operations.filter((op) => op.table === "relay_record_legs")).toHaveLength(0);
  });
});

describe("[V-MG-07] レグの payload (mobile)", () => {
  beforeEach(() => {
    resetMocks();
    mocks.responses["select:records"] = { data: relayRecordRows(), error: null };
  });

  it("leg_index は 0-based で 0..3、leg_time は区間タイム (通算ではない)", async () => {
    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    const legRows = legInserts()[0]?.payload as Array<Record<string, unknown>>;
    expect(legRows).toHaveLength(4);
    expect(legRows.map((row) => row.leg_index)).toEqual([0, 1, 2, 3]);

    // 通算 [27.50, 56.20, 84.50, 112.10] が入っていたら退行
    expect(legRows.map((row) => row.leg_time)).toEqual([27.5, 28.7, 28.3, 27.6]);
    expect(legRows.map((row) => row.leg_time)).not.toEqual([27.5, 56.2, 84.5, 112.1]);
  });

  it("record_id が保存された records の id を指す (relayRecordRows は既存行なので UPDATE で id 保持)", async () => {
    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    // relayRecordRows() の4行は保存前から存在するので UPDATE され、id は新規採番されず
    // 既存の records.id (updateCalls の eq 条件) のまま保持される。
    const recordUpdates = mocks.updateCalls.filter((call) => call.table === "records");
    expect(recordUpdates).toHaveLength(4);
    const updatedRecordIds = recordUpdates.map((call) => call.eq[0]?.value);
    expect(updatedRecordIds).toEqual([
      "existing-record-0",
      "existing-record-1",
      "existing-record-2",
      "existing-record-3",
    ]);

    const legRows = legInserts()[0]?.payload as Array<Record<string, unknown>>;
    expect(legRows.map((row) => row.record_id)).toEqual(updatedRecordIds);
  });

  it("user_id は 4 レグそれぞれの泳者になる (第1泳者に潰れない)", async () => {
    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    const legRows = legInserts()[0]?.payload as Array<Record<string, unknown>>;
    expect(legRows.map((row) => row.user_id)).toEqual([...RELAY_USER_IDS]);
  });
});

describe("[V-MG-08] 性別区分の prefill (mobile)", () => {
  beforeEach(() => {
    resetMocks();
    mocks.responses["select:records"] = { data: relayRecordRows(), error: null };
  });

  it("メンバー一覧に居ない泳者を含む編成は mixed になる (?? 0 で男性に寄せない)", async () => {
    // 第4泳者 (user-anchor) を一覧から外す = チームを離れた後の状態
    const removed = mocks.teamMembers.pop();
    if (!removed) throw new Error("fixture が壊れている");

    try {
      await renderAndSave();
      await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

      const payload = relayInserts()[0]?.payload as Record<string, unknown>;
      expect(payload.gender_category).toBe("mixed");
      expect(payload.gender_category).not.toBe("male");
    } finally {
      mocks.teamMembers.push(removed);
    }
  });

  it("4 人全員 gender=0 なら male になる (対照。常に mixed ではない)", async () => {
    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    const payload = relayInserts()[0]?.payload as Record<string, unknown>;
    expect(payload.gender_category).toBe("male");
  });
});

describe("[V-MG-09] web とのパリティ (mobile)", () => {
  beforeEach(() => {
    resetMocks();
    mocks.responses["select:records"] = { data: relayRecordRows(), error: null };
    mocks.responses["select:relay_record_legs"] = { data: staleRelayLegRows(), error: null };
  });

  it("relay_kind / leg_distance / leg_count / total_time / pool_type が web と同じ値になる", async () => {
    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    const payload = relayInserts()[0]?.payload as Record<string, unknown>;
    expect(payload.team_id).toBe("team-thrush");
    expect(payload.competition_id).toBe("comp-thrush");
    expect(payload.relay_kind).toBe("free");
    expect(payload.leg_distance).toBe(50);
    expect(payload.leg_count).toBe(4);
    // 大会の水路をそのまま使う (?? で片方に寄せていない)
    expect(payload.pool_type).toBe(0);
    expect(payload.total_time).toBe(RELAY_TOTAL_TIME);
  });

  it("種類・距離・泳者が違う古い行も削除対象に含まれる (孤児を残さない)", async () => {
    mocks.responses["select:relay_record_legs"] = {
      data: staleRelayLegRows([
        "stale-medley-row",
        "stale-other-distance-row",
        "stale-other-squad-row",
      ]),
      error: null,
    };

    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    expect(mocks.inCalls.filter((call) => call.table === "relay_records")).toEqual([
      {
        table: "relay_records",
        op: "delete",
        column: "id",
        values: ["stale-medley-row", "stale-other-distance-row", "stale-other-squad-row"],
      },
    ]);
  });

  it("insert payload に note を送らない (DB に列が無いので送ると insert が落ちる)", async () => {
    await renderAndSave();
    await waitFor(() => expect(mocks.goBack).toHaveBeenCalled());

    const payload = relayInserts()[0]?.payload as Record<string, unknown>;
    expect(Object.keys(payload)).not.toContain("note");
  });
});
