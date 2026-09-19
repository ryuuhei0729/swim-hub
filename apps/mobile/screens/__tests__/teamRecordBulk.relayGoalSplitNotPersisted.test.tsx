// =============================================================================
// teamRecordBulk.relayGoalSplitNotPersisted.test.tsx
// =============================================================================
//
// Sprint Contract 追補 R2 / S15 (mobile 側):
//   「distance === legDist(=raceDistance) の split は保存経路で永続化されない」ことを
//   保証する回帰テスト。これは R2-2 で PM が承認した `isRecordSplitTimesCorrupted` の
//   述語 narrowing (`distance < legDist`) の前提であり、将来 UI にゴール split を
//   保存する変更が入ると静かに崩れる。
//
// トートロジー防止メモ: 実際にコンポーネントを render → 保存ボタン押下 →
// supabase.from("split_times").insert() への実際のペイロードを検証する
// (teamRecordBulk.relaySplitValidationGuard.test.tsx と同じ実測方式)。

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
          then: (resolve) => resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        };
        return builder;
      },
    };
  }

  const teamMembers: Array<{ user_id: string; role: string; users: { id: string; name: string } }> =
    [{ user_id: "user-0", role: "admin", users: { id: "user-0", name: "選手0" } }];

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
    routeParams: { competitionId: "comp-1", teamId: "team-1", relayEventId: "relay_4x50_free" } as Record<string, unknown>,
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
    user: { id: "user-0" },
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

// relay_4x50_free (styleId=2, legDist=50) の 4 泳者。times=[27.5,28.7,28.3,27.6]。
// leg0 だけ本物の中間split (distance=25, leg 相対値 12.0) を持たせる。読み込み時、
// restoreRelayBoundarySplits が各 leg 自身のゴール境界 (50/100/150/200) を record.time
// の累計から補完するため、entry.relaySplitTimes には 中間split(25) + 4境界 が並ぶ。
function makeRelayRecords() {
  const times = [27.5, 28.7, 28.3, 27.6];
  const isRelaying = [false, true, true, true];
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
    is_relaying: isRelaying[idx],
    reaction_time: null,
    note: null,
    split_times: legSplits[idx]!.map((s, j) => ({ // legSplits は times と同じ4要素固定配列なので idx は必ず対応する要素を持つ
      id: `st-${idx}-${j}`,
      distance: s.distance,
      split_time: s.split_time,
    })),
    users: { id: `user-${idx}`, name: `選手${idx}` },
  }));
}

describe("TeamRecordStyleDetailScreen — distance===legDist(=raceDistance) の split は保存経路で永続化されない (S15)", () => {
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
  });

  it(
    "4 leg 分の relaySplitTimes (中間split 1件 + 各 leg 自身の境界split 4件) を保存すると、" +
      "split_times への insert には distance===50(=legDist=raceDistance) の行が" +
      "1件も含まれず、中間split (distance=25) だけが書き込まれる",
    async () => {
      mocks.responses["select:records"] = { data: makeRelayRecords(), error: null };

      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });
      fireEvent.click(screen.getByText("記録を保存"));

      await waitFor(() => {
        expect(mocks.goBack).toHaveBeenCalled();
      });

      const splitTimeInserts = mocks.insertCalls.filter((c) => c.table === "split_times");
      const allInsertedRows = splitTimeInserts.flatMap(
        (c) => c.payload as Array<{ distance: number; split_time: number }>,
      );

      const goalDistanceRows = allInsertedRows.filter((r) => r.distance === 50);
      expect(
        goalDistanceRows,
        `distance===50 の行が insert payload に含まれている: ${JSON.stringify(goalDistanceRows)}`,
      ).toHaveLength(0);

      expect(allInsertedRows).toContainEqual(
        expect.objectContaining({ distance: 25, split_time: 12.0 }),
      );
      expect(allInsertedRows).toHaveLength(1);
    },
  );
});
