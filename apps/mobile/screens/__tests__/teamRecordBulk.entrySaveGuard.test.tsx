// =============================================================================
// teamRecordBulk.entrySaveGuard.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点 (このスプリントの前提となる既存挙動の回帰確認):
//   [仕様#3] 棄権・欠場した選手の行は、タイム未入力のまま保存すればその行は
//     登録されない (既存の `shouldSave = mr.time > 0` の挙動。
//     TeamRecordBulkFormScreen.tsx:760-763)
//   [仕様#2 前提] リレーとして検出された種目グループ (buildStyleEntries.ts の
//     Phase1/2 が is_relaying 4件連続パターンで検出) は1つの StyleEntry に
//     まとまり、4レグ構造のまま保存される。エントリー行マージ機能がこの構造を
//     壊さないことを保証する土台として、マージ前の現状の構造を固定する。
//
// トートロジー防止メモ: 「shouldSave の式をコピーして正しいと確認する」のではなく、
// 実際にコンポーネントを render → 保存ボタン押下 → supabase.from("records").insert()
// に渡された **実際のペイロード件数と user_id** を検証する (TeamRecordBulkFormScreen.
// invalidate.test.tsx と同じ実測方式)。

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
  /**
   * `.eq()` の列名・値を発生順に記録する。
   *
   * 🚨 引数を捨てないこと。捨てると「サーバー側で絞り込んでいるか」と
   *    「一旦全部取ってクライアントで filter しているか」を区別できず、
   *    情報露出が全 green のまま通り抜ける (既知のアンチパターン)。
   */
  const eqCalls: Array<{ table: string; op: string | null; column: string; value: unknown }> = [];
  const inCalls: Array<{ table: string; op: string | null; column: string; values: unknown[] }> =
    [];
  /** `insert().select().single()` で払い出した id (テーブル名キー・発生順) */
  const insertedIds: Record<string, string[]> = {};

  /**
   * `insert().select("id").single()` が id を払い出すテーブル。
   *
   * 第3弾で `relay_records` を追加した。従来のフェイクは `records` だけを
   * 特別扱いしていたため、`relay_records` の insert が `{ data: null }` を返し、
   * プロダクション側の `if (relayError || !newRelay)` が正しく「失敗」と
   * 判定していた (= プロダクションのバグではなくテストダブルの欠落)。
   */
  const ID_ISSUING_TABLES = new Set(["records", "relay_records"]);

  function makeSupabase() {
    const idSeq: Record<string, number> = {};

    /**
     * テーブル名を含む固有の id を払い出す。
     * `relay_record_legs.record_id` が `records` の id を指しているのか
     * `relay_records` の id を指しているのかをテスト側で区別できるようにする。
     */
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
            if (!op) op = "select";
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
            if (!op) op = "insert";
            insertCalls.push({ table, payload });
            return builder;
          },
          update: (payload: unknown) => {
            op = "update";
            pendingUpdate = { table, payload, eq: [] };
            updateCalls.push(pendingUpdate);
            return builder;
          },
          delete: (..._a) => {
            if (!op) op = "delete";
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
              // 【修正ラウンド 2026-09-17】production が `.update().eq("id", id).select("id")`
              // で 0 行 UPDATE を検知して INSERT にフォールバックするようになった (High #2)。
              // テストが明示的に上書きしない限り「1行ヒット (成功)」をデフォルトにする。
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

  const teamMembers: Array<{ user_id: string; role: string; users: { id: string; name: string } }> =
    [{ user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎" } }];

  return {
    style,
    responses,
    insertCalls,
    updateCalls,
    deleteCalls,
    eqCalls,
    inCalls,
    insertedIds,
    teamMembers,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1", styleId: 2 } as Record<string, unknown>,
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
    user: { id: "user-1" },
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

describe("TeamRecordStyleDetailScreen — 空タイム行は保存されない (仕様#3の回帰確認)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertCalls.length = 0;
    mocks.updateCalls.length = 0;
    mocks.deleteCalls.length = 0;
    mocks.eqCalls.length = 0;
    mocks.inCalls.length = 0;
    for (const table of Object.keys(mocks.insertedIds)) delete mocks.insertedIds[table];
    for (const key of Object.keys(mocks.responses)) delete mocks.responses[key];
    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["delete:records"] = { data: null, error: null };
    mocks.routeParams = { competitionId: "comp-1", teamId: "team-1", styleId: 2 };
  });

  it(
    "同一種目に2名の既存行があり、1名だけタイムが入っておりもう1名が time=0 の状態で保存すると、" +
      "records への insert は1回だけ発生し、未入力だった選手の user_id は含まれない" +
      "（人間の意図: 棄権・欠場した選手の行を空のまま保存しても記録が作られてはならない。" +
      "この防波堤は entries から補完される新規行にも同様に適用されるべき）",
    async () => {
      mocks.responses["select:records"] = {
        data: [
          {
            id: "record-1",
            user_id: "user-1",
            style_id: 2,
            time: 30.5,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-1", name: "太郎" },
          },
          {
            id: "record-2",
            user_id: "user-2",
            style_id: 2,
            time: 0,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-2", name: "次郎" },
          },
        ],
        error: null,
      };

      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });
      fireEvent.click(screen.getByText("記録を保存"));

      await waitFor(() => {
        expect(mocks.goBack).toHaveBeenCalled();
      });

      // record-1/record-2 は保存前から存在する既存行なので INSERT ではなく
      // UPDATE/DELETE に振り分けられる (upsert 化後の正しい帰結)
      const recordInserts = mocks.insertCalls.filter((c) => c.table === "records");
      expect(recordInserts).toHaveLength(0);
      const recordUpdates = mocks.updateCalls.filter((c) => c.table === "records");
      expect(recordUpdates).toHaveLength(1);
      const updatedUserIds = recordUpdates.map((c) => (c.payload as { user_id: string }).user_id);
      expect(updatedUserIds).toEqual(["user-1"]);
      expect(updatedUserIds).not.toContain("user-2");
      // 未入力に戻された次郎の既存行 (record-2) は削除される
      const recordDeletes = mocks.inCalls.filter(
        (c) => c.table === "records" && c.op === "delete",
      );
      expect(recordDeletes).toHaveLength(1);
      expect(recordDeletes[0]?.values).toEqual(["record-2"]);
    },
  );
});

describe("TeamRecordStyleDetailScreen — リレー検出された StyleEntry の構造保持 (仕様#2 前提の回帰確認)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertCalls.length = 0;
    mocks.updateCalls.length = 0;
    mocks.deleteCalls.length = 0;
    mocks.eqCalls.length = 0;
    mocks.inCalls.length = 0;
    for (const table of Object.keys(mocks.insertedIds)) delete mocks.insertedIds[table];
    for (const key of Object.keys(mocks.responses)) delete mocks.responses[key];
    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["delete:records"] = { data: null, error: null };
    mocks.routeParams = {
      competitionId: "comp-1",
      teamId: "team-1",
      relayEventId: "relay_4x50_free",
    };
  });

  it(
    "is_relaying=[false,true,true,true] の4件連続レコードが1つの種目カードにまとまり、" +
      "保存すると records への insert が4件発生する (1件に潰れたり分裂して欠落しない)" +
      "（人間の意図: リレー検出された StyleEntry に将来のエントリーマージ機能が触れては" +
      "ならない、という仕様の前提となる現状の4レグ保存構造を固定する）",
    async () => {
      mocks.responses["select:records"] = {
        data: [
          { time: 27.5, is_relaying: false, user_id: "user-0" },
          { time: 28.7, is_relaying: true, user_id: "user-1" },
          { time: 28.3, is_relaying: true, user_id: "user-2" },
          { time: 27.6, is_relaying: true, user_id: "user-3" },
        ].map((r, idx) => ({
          id: `relay-record-${idx}`,
          user_id: r.user_id,
          style_id: 2,
          time: r.time,
          is_relaying: r.is_relaying,
          reaction_time: null,
          note: null,
          split_times: [],
          users: { id: r.user_id, name: `選手${idx}` },
        })),
        error: null,
      };

      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });
      fireEvent.click(screen.getByText("記録を保存"));

      await waitFor(() => {
        expect(mocks.goBack).toHaveBeenCalled();
      });

      // relay-record-0〜3 は保存前から存在する既存行なので UPDATE される (INSERT ではない)
      const recordInserts = mocks.insertCalls.filter((c) => c.table === "records");
      expect(recordInserts).toHaveLength(0);
      const recordUpdates = mocks.updateCalls.filter((c) => c.table === "records");
      expect(recordUpdates).toHaveLength(4);
    },
  );

  // 【修正ラウンド 2026-09-17 (Critical #1)】以前は「差し替え前の取得が relay_records を
  // team_id/competition_id/relay_kind/leg_distance でサーバー絞り込みしていること」を
  // 検証していた。これは DB 列条件による絞り込みを前提にしたアサーションであり、
  // 新設計ではこの絞り込み自体が Critical の原因だった (同一種目の別チーム/別組の行を
  // 区別できない)。「サーバー側で絞り込んでいること」を検証する意図は維持し、
  // 検証対象を「relay_records への列条件 .eq()」から「relay_record_legs への
  // .in(record_id, この種目詳細画面が読み込んだ records.id 集合)」へ移す。
  it(
    "リレーの差し替え前に行う relay_record_legs の取得は record_id を" +
      "**この種目詳細画面が読み込んだ records.id 集合でサーバー側の絞り込み条件として" +
      "渡している** (DB 列条件で絞り込み直す形になっていないこと。緩めると他チーム・" +
      "他大会の relay_record_legs が一旦クライアントに届いてしまい、テストからは" +
      "区別できないまま情報露出が通り抜ける)",
    async () => {
      const relayRecordIds = ["relay-record-0", "relay-record-1", "relay-record-2", "relay-record-3"];
      mocks.responses["select:records"] = {
        data: [
          { time: 27.5, is_relaying: false, user_id: "user-0" },
          { time: 28.7, is_relaying: true, user_id: "user-1" },
          { time: 28.3, is_relaying: true, user_id: "user-2" },
          { time: 27.6, is_relaying: true, user_id: "user-3" },
        ].map((r, idx) => ({
          id: relayRecordIds[idx],
          user_id: r.user_id,
          style_id: 2,
          time: r.time,
          is_relaying: r.is_relaying,
          reaction_time: null,
          note: null,
          split_times: [],
          users: { id: r.user_id, name: `選手${idx}` },
        })),
        error: null,
      };

      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });
      fireEvent.click(screen.getByText("記録を保存"));

      await waitFor(() => {
        expect(mocks.goBack).toHaveBeenCalled();
      });

      const legScopeIn = mocks.inCalls.filter(
        (c) => c.table === "relay_record_legs" && c.op === "select",
      );
      expect(legScopeIn).toEqual([
        { table: "relay_record_legs", op: "select", column: "record_id", values: relayRecordIds },
      ]);

      // relay_records 自体への条件 select (旧内部 SELECT) はもう発生しない
      expect(
        mocks.eqCalls.filter((c) => c.table === "relay_records" && c.op === "select"),
      ).toHaveLength(0);
    },
  );
});

describe("TeamRecordStyleDetailScreen — 非 admin の権限ガード (既存挙動の回帰確認)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertCalls.length = 0;
    mocks.updateCalls.length = 0;
    mocks.deleteCalls.length = 0;
    mocks.eqCalls.length = 0;
    mocks.inCalls.length = 0;
    for (const table of Object.keys(mocks.insertedIds)) delete mocks.insertedIds[table];
    for (const key of Object.keys(mocks.responses)) delete mocks.responses[key];
    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [], error: null };
    mocks.responses["delete:records"] = { data: null, error: null };
    mocks.routeParams = { competitionId: "comp-1", teamId: "team-1", styleId: 2 };
  });

  it(
    "role: 'user' (非admin) の場合、記録保存フォームは表示されず保存ボタンも存在しない" +
      "（人間の意図: この機能はエントリー行の初期反映だけを追加するものであり、" +
      "既存の isCurrentUserAdmin による client 側ガードを後退させてはならない）",
    async () => {
      mocks.teamMembers.length = 0;
      mocks.teamMembers.push({ user_id: "user-1", role: "user", users: { id: "user-1", name: "太郎" } });

      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText("大会一覧に戻る")).toBeDefined();
      });
      expect(screen.queryByText("記録を保存")).toBeNull();
    },
  );
});
