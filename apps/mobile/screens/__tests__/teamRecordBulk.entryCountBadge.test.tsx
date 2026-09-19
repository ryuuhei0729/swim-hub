// =============================================================================
// teamRecordBulk.entryCountBadge.test.tsx
// [新機能] 種目一覧カードの「エントリー済み人数」バッジ (QA Sprint Contract)
// =============================================================================
//
// entryUserCountByStyleId (apps/mobile/screens/teamRecordBulk/loadTeamRecordData.ts)
// は entries の生データから直接 distinct user_id を数える設計になっている
// (styleEntries/entryTimeReference 経由で数えると entry_time が NULL のエントリーを
// 取りこぼす既知のリスクがあるため、あえて raw entries から数えている)。
//
// このファイルは `TeamRecordStyleListScreen` を実物 render し、
// loadTeamRecordCompetitionData → buildIndividualStyleCards → 画面表示までの
// 実経路を通して検証する (screen は render せず純粋関数だけ呼ぶテストでは、
// この Map 構築ロジック自体は素通りしてしまうため)。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return { ...actual, KeyboardAvoidingView: actual.View };
});

const mocks = vi.hoisted(() => {
  const responses: Record<string, { data: unknown; error: unknown }> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        let op: string | null = null;
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn((..._a: unknown[]) => {
          if (!op) op = "select";
          return builder;
        });
        builder.eq = vi.fn(() => builder);
        builder.order = vi.fn(() => builder);
        builder.in = vi.fn(() => builder);
        builder.single = vi.fn(() =>
          Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        );
        builder.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
          resolve(responses[`${op}:${table}`] ?? { data: null, error: null });
        return builder;
      },
    };
  }

  return {
    responses,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1" },
    navigate: vi.fn(),
    goBack: vi.fn(),
    getStyles: vi.fn(),
    membersBox: { current: [] as unknown[] },
  };
});

// useFocusEffect はマウント時に1回だけ callback を実行する実装で上書きする
// (RecordsScreen.refreshDrift.test.tsx 等と同一パターン)。空の vi.fn() にはしない
// (フォーカス時再取得が一切実行されなくなり回帰検知能力を失う) が、グローバルモック
// (vitest.setup.ts の `vi.fn((callback) => callback())`) をそのまま持ち込むと、
// このファイルの callback は `load` (setState を伴う実 fetch) であるため、
// 「レンダーのたびに再実行される」globalモックの挙動と組み合わさり
// setState → 再レンダー → callback 再実行 → setState → ... の無限ループになる
// (実測済み: "Too many re-renders" で検証)。このファイルの関心事はフォーカス時
// 再取得の再現ではなく通常表示なので、マウント1回だけ発火させれば十分。
vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
  useFocusEffect: (callback: () => void) => {
    React.useEffect(() => {
      callback();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: mocks.supabase, user: { id: "admin-1" } }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: mocks.membersBox.current, isLoading: false }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

import { TeamRecordStyleListScreen } from "../TeamRecordStyleListScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/** id 2 = 自由形50m のみ。個人種目カードは1枚に絞り、テストを見やすくする。 */
const STYLE_FREE_50 = { id: 2, name_jp: "自由形50m", name: "Freestyle 50m", style: "Fr", distance: 50 };

function user(id: string, name: string) {
  return { id, name };
}

function entryRow(
  id: string,
  userId: string,
  styleId: number,
  entryTime: number | null,
  name = `選手-${userId}`,
) {
  return { id, user_id: userId, style_id: styleId, entry_time: entryTime, note: null, users: user(userId, name) };
}

function renderScreen(queryClient: QueryClient) {
  return render(<TeamRecordStyleListScreen />, { wrapper: createWrapper(queryClient) });
}

describe("[新機能] 種目一覧カードのエントリー人数バッジ (entryCount)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mocks.getStyles.mockResolvedValue([STYLE_FREE_50]);
    mocks.responses["select:competitions"] = {
      // 短水路 (pool_type: 0) に固定し、水路フィルタによるカード非表示を
      // このテストの関心事から排除する。
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [], error: null };
    mocks.membersBox.current = [{ user_id: "admin-1", role: "admin", users: { id: "admin-1", name: "管理者" } }];
  });

  it("entry_time が NULL のエントリーも人数に数える (最重要: 申告タイム無しの取りこぼし防止)", async () => {
    mocks.responses["select:entries"] = {
      data: [
        entryRow("entry-1", "user-1", 2, null),
        entryRow("entry-2", "user-2", 2, 45.0),
      ],
      error: null,
    };

    renderScreen(queryClient);

    // 厳密一致 (getByText は完全一致) — 部分文字列一致による偽陽性を避ける
    expect(await screen.findByText("(2人エントリー)")).toBeTruthy();
  });

  it("同一ユーザーが同じ種目に複数のエントリー行を持つ場合、重複カウントしない (distinct user_id)", async () => {
    mocks.responses["select:entries"] = {
      data: [
        entryRow("entry-1", "user-1", 2, 30.0),
        entryRow("entry-2", "user-1", 2, 31.0), // 同一ユーザーの別エントリー行
        entryRow("entry-3", "user-2", 2, 32.0),
      ],
      error: null,
    };

    renderScreen(queryClient);

    expect(await screen.findByText("(2人エントリー)")).toBeTruthy();
    // 3件のエントリー行をそのまま数えた誤り (3人) が表示されていないことも確認する
    expect(screen.queryByText("(3人エントリー)")).toBeNull();
  });

  it("リレーカードにはエントリー人数ラベルが出ない (entries は個人種目の style_id にのみ紐づく概念)", async () => {
    mocks.responses["select:entries"] = {
      data: [
        entryRow("entry-1", "user-1", 2, 30.0),
        entryRow("entry-2", "user-2", 2, null),
        entryRow("entry-3", "user-3", 2, 33.0),
        entryRow("entry-4", "user-4", 2, 34.0),
        entryRow("entry-5", "user-5", 2, null),
      ],
      error: null,
    };

    renderScreen(queryClient);

    // 個人種目カード (自由形50m) 1枚 + リレー7枚 = 8枚のカードが描画される画面全体で、
    // エントリー人数ラベルは自由形50mの1件しか出現しないこと (リレー7枚には出ない)
    await screen.findByText("(5人エントリー)");
    const badges = screen.getAllByText(/^\(\d+人エントリー\)$/);
    expect(badges).toHaveLength(1);
  });

  it("エントリーが0人の種目にはラベルが表示されない (ノイズ抑制)", async () => {
    mocks.responses["select:entries"] = { data: [], error: null };

    renderScreen(queryClient);

    await screen.findByText("50m自由形");
    expect(screen.queryByText(/エントリー\)$/)).toBeNull();
  });

  it("タイム入力済み人数 (filledCount) とエントリー人数 (entryCount) は独立に計算され、両方表示される", async () => {
    mocks.responses["select:records"] = {
      data: [
        {
          id: "record-1",
          user_id: "record-user-1",
          style_id: 2,
          time: 27.5,
          is_relaying: false,
          reaction_time: null,
          note: null,
          split_times: [],
          users: user("record-user-1", "選手A"),
        },
        {
          id: "record-2",
          user_id: "record-user-2",
          style_id: 2,
          time: 28.1,
          is_relaying: false,
          reaction_time: null,
          note: null,
          split_times: [],
          users: user("record-user-2", "選手B"),
        },
        {
          id: "record-3",
          user_id: "record-user-3",
          style_id: 2,
          time: 29.3,
          is_relaying: false,
          reaction_time: null,
          note: null,
          split_times: [],
          users: user("record-user-3", "選手C"),
        },
      ],
      error: null,
    };
    mocks.responses["select:entries"] = {
      data: [
        entryRow("entry-1", "entry-user-1", 2, 30.0),
        entryRow("entry-2", "entry-user-2", 2, null),
        entryRow("entry-3", "entry-user-3", 2, 31.0),
        entryRow("entry-4", "entry-user-4", 2, null),
        entryRow("entry-5", "entry-user-5", 2, 32.0),
      ],
      error: null,
    };

    renderScreen(queryClient);

    expect(await screen.findByText("3人")).toBeTruthy();
    expect(screen.getByText("(5人エントリー)")).toBeTruthy();
  });
});
