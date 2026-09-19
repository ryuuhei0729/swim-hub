// =============================================================================
// teamRecordBulk.relaySplitValidationGuard.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点 (Success Criteria S6・D3 mobile 側):
//   leg 開始通算値以下の split を含む状態で保存すると、Alert で保存が中止され、
//   DB に split (負値・0 含む) が 1 件も書き込まれない (records.insert も発生しない)。
//
// トートロジー防止メモ: 実装 (TeamRecordBulkFormScreen.tsx の D3 バリデーション式) を
// コピーせず、実際にコンポーネントを render → 保存ボタン押下 → supabase.from("records")
// への insert 呼び出し件数と Alert.alert の呼び出しを実測する
// (teamRecordBulk.entrySaveGuard.test.tsx と同じ実測方式)。既存記録 (select:records) の
// split_times に「leg 相対値として負値」を仕込み、再読込直後の entry.relaySplitTimes に
// 不正な通算値 (leg 開始通算タイム以下) を再現する。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Alert } from "react-native";
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

// relay_4x50_free (styleId=2) の 4 泳者。times=[27.5,28.7,28.3,27.6] →
// cumulatives=[27.5,56.2,84.5,112.1] → legStart(leg1)=27.5
function makeRelayRecords(legSplits: Array<{ distance: number; split_time: number }[]>) {
  const times = [27.5, 28.7, 28.3, 27.6];
  const isRelaying = [false, true, true, true];
  return times.map((time, idx) => ({
    id: `relay-record-${idx}`,
    user_id: `user-${idx}`,
    style_id: 2,
    time,
    is_relaying: isRelaying[idx],
    reaction_time: null,
    note: null,
    split_times: legSplits[idx]!.map((s, j) => ({ // legSplits は呼び出し元で常に times と同じ4要素を渡す設計
      id: `st-${idx}-${j}`,
      distance: s.distance,
      split_time: s.split_time,
    })),
    users: { id: `user-${idx}`, name: `選手${idx}` },
  }));
}

describe("TeamRecordStyleDetailScreen — リレー split の事前バリデーション (D3・Success Criteria S6)", () => {
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
    "leg1 の split が DB に leg 開始通算タイム以下の (負の leg 相対値を含む) 状態で保存されている場合、" +
      "保存ボタン押下で Alert が発報されて中断され、records への insert が1件も発生しない" +
      "（人間の意図: 破損データを開いてそのまま保存し直しても新たな不正値が DB に書き込まれてはならない）",
    async () => {
      // leg1 (legStart=27.5): DB に distance=25(leg内相対), split_time=-12.5 を保存済みとする。
      // D4 の復元で global splitTime = toCumulativeSplitTime(-12.5, 27.5) = 15.0 (>0 だが
      // legStart(27.5) より小さい) となり、D3 の `splitTime <= 0` 事前フィルタは通過しつつ
      // `splitTime <= legStart + tolerance(0.005)` に掛かるはず。
      mocks.responses["select:records"] = {
        data: makeRelayRecords([[], [{ distance: 25, split_time: -12.5 }], [], []]),
        error: null,
      };

      const alertSpy = vi.spyOn(Alert, "alert");
      const queryClient = makeQueryClient();
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });
      fireEvent.click(screen.getByText("記録を保存"));

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalled();
      });

      // mobile は next-intl のようなキー透過モックを使っていないため、実際に翻訳された
      // 日本語メッセージ (ja.json の relaySplitBeforeLegStart 文言) が渡ることを確認する。
      const alertArgs = alertSpy.mock.calls.flatMap((c) => c);
      expect(
        alertArgs.some((a) => typeof a === "string" && a.includes("スプリットタイムが不正です")),
        `Alert 呼び出しに relaySplitBeforeLegStart の翻訳文言が含まれない: ${JSON.stringify(alertArgs)}`,
      ).toBe(true);
      // leg2 (第2泳者=legIdx1) の開始通算タイムに関する言及であること (leg 取り違え防止)
      expect(alertArgs.some((a) => typeof a === "string" && a.includes("第2泳者"))).toBe(true);

      expect(mocks.insertCalls).toHaveLength(0);
      expect(mocks.goBack).not.toHaveBeenCalled();
    },
  );

  it(
    "leg1 の split が正常な (leg 開始通算タイムより大きい) 状態であれば、バリデーションに" +
      "引っかからず保存が進む (D3 が正常値を誤って弾かないことの回帰確認)",
    async () => {
      // leg1 (legStart=27.5): distance=25, split_time=10.0 (leg 相対値。正常な値)
      // → global splitTime = 10.0 + 27.5 = 37.5 > legStart(27.5) なので正常
      mocks.responses["select:records"] = {
        data: makeRelayRecords([[], [{ distance: 25, split_time: 10.0 }], [], []]),
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
});
