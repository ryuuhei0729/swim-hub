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

  function makeSupabase() {
    return {
      from: (table: string) => {
        let op: string | null = null;
        const builder: {
          select: (..._a: unknown[]) => typeof builder;
          eq: (..._a: unknown[]) => typeof builder;
          order: (..._a: unknown[]) => typeof builder;
          in: (..._a: unknown[]) => typeof builder;
          insert: (payload: unknown) => typeof builder;
          delete: (..._a: unknown[]) => typeof builder;
          single: () => Promise<{ data: unknown; error: unknown }>;
          then: (resolve: (v: { data: unknown; error: unknown }) => void) => void;
        } = {
          select: (..._a) => {
            if (!op) op = "select";
            return builder;
          },
          eq: () => builder,
          order: () => builder,
          in: () => builder,
          insert: (payload: unknown) => {
            if (!op) op = "insert";
            insertCalls.push({ table, payload });
            return builder;
          },
          delete: (..._a) => {
            if (!op) op = "delete";
            return builder;
          },
          single: () =>
            Promise.resolve(
              op === "insert" && table === "records"
                ? { data: { id: `new-record-${insertCalls.length}` }, error: null }
                : (responses[`${op}:${table}`] ?? { data: null, error: null }),
            ),
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
    teamMembers,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1" },
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(async () => "test-access-token"),
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
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

vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/records/LapTimeDisplay", () => ({ LapTimeDisplay: () => null }));
vi.mock("@/components/teams/MemberSelectModal", () => ({ MemberSelectModal: () => null }));

import { TeamRecordBulkFormScreen } from "../TeamRecordBulkFormScreen";

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
    split_times: legSplits[idx].map((s, j) => ({
      id: `st-${idx}-${j}`,
      distance: s.distance,
      split_time: s.split_time,
    })),
    users: { id: `user-${idx}`, name: `選手${idx}` },
  }));
}

describe("TeamRecordBulkFormScreen — リレー split の事前バリデーション (D3・Success Criteria S6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertCalls.length = 0;
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
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

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
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });
      fireEvent.click(screen.getByText("記録を保存"));

      await waitFor(() => {
        expect(mocks.goBack).toHaveBeenCalled();
      });

      const recordInserts = mocks.insertCalls.filter((c) => c.table === "records");
      expect(recordInserts).toHaveLength(4);
    },
  );
});
