// =============================================================================
// teamRecordBulk.styleListGrid.test.tsx
// Sprint Contract Phase A スケルトン — 種目一覧画面 (29カードグリッド)
// =============================================================================
//
// 確定仕様: 個人22種目 + リレー7種目 = 29カードのグリッド。
// 大会の pool_type で出し分ける。
// 長水路で既定非表示: styles id 1/8/12/16 (25m個人4種目) +
// relay_4x25_free + relay_4x25_medley。100m個人メドレー(id 20)は隠さない。
//
// `TeamRecordStyleListScreen` を実物 import して render する。29カードの
// canonical な定義元は styles マスター (テスト側は id・name_jp のみのダミー22件を
// 用意する。id の値だけが可視判定に効くため、実際の泳法名を複製する必要はない) +
// `RELAY_EVENTS` (実物 import。ここでは複製しない)。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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

/**
 * id・name_jp のみのダミー22種目。id の値だけが長水路の既定非表示判定に効く。
 * `style`/`distance` を実在種目値 (Fr/50 等) にすると localizedStyleName が
 * name_jp を無視して "50m自由形" のような翻訳済みラベルを合成し、22件すべてが
 * 同一テキストになってテキストクエリで区別できなくなる。あえて空にして
 * name_jp フォールバック ("ダミー種目N") をそのまま描画させる。
 */
const DUMMY_22_STYLES = Array.from({ length: 22 }, (_, i) => ({
  id: i + 1,
  name_jp: `ダミー種目${i + 1}`,
  name: `Style${i + 1}`,
  style: "" as never,
  distance: 0,
}));

function renderScreen(queryClient: QueryClient) {
  return render(<TeamRecordStyleListScreen />, { wrapper: createWrapper(queryClient) });
}

describe("[V-06a] 種目一覧グリッドの基本表示", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mocks.getStyles.mockResolvedValue(DUMMY_22_STYLES);
    mocks.responses["select:records"] = { data: [], error: null };
    mocks.responses["select:entries"] = { data: [], error: null };
    mocks.membersBox.current = [
      { user_id: "admin-1", role: "admin", users: { id: "admin-1", name: "管理者" } },
    ];
  });

  it("短水路大会では個人22種目 + リレー7種目 = 29カードすべてが表示される", async () => {
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };

    const { container } = renderScreen(queryClient);

    await waitFor(() => {
      expect(container.querySelectorAll("button")).toHaveLength(29);
    });
  });

  it("長水路大会かつ既存記録・エントリーが無い場合、styles id 1/8/12/16 と relay_4x25_free/medley の6カードが非表示になる (23カード)", async () => {
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 1 },
      error: null,
    };

    const { container } = renderScreen(queryClient);

    await waitFor(() => {
      expect(container.querySelectorAll("button")).toHaveLength(23);
    });
  });

  it("長水路大会でも id 20 (100m個人メドレー) は非表示にならない (25m種目の既定非表示リストに含めない)", async () => {
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 1 },
      error: null,
    };

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByText("ダミー種目20")).toBeTruthy();
    });
    // id 1 (25m相当・既定非表示対象) は非表示のまま
    expect(screen.queryByText("ダミー種目1")).toBeNull();
  });

  it("カードをタップすると TeamRecordBulkFormDetail へ navigate し、対応する styleKey (styleId または relayEventId) が params に渡る", async () => {
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };

    renderScreen(queryClient);

    const card = await screen.findByText("ダミー種目1");
    card.closest("button")?.click();

    expect(mocks.navigate).toHaveBeenCalledWith("TeamRecordBulkFormDetail", {
      competitionId: "comp-1",
      teamId: "team-1",
      styleId: 1,
    });
  });
});

describe("[V-06b] 水路フィルタの例外 (既存記録・エントリーがある種目は必ず表示)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mocks.getStyles.mockResolvedValue(DUMMY_22_STYLES);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 1 },
      error: null,
    };
    mocks.membersBox.current = [
      { user_id: "admin-1", role: "admin", users: { id: "admin-1", name: "管理者" } },
    ];
  });

  it("長水路大会で styles id 1 (25m相当) に既存 records が1件でもあれば、既定非表示でもカードが表示される", async () => {
    mocks.responses["select:records"] = {
      data: [
        {
          id: "record-1",
          user_id: "admin-1",
          style_id: 1,
          time: 30,
          is_relaying: false,
          reaction_time: null,
          note: null,
          split_times: [],
          users: { id: "admin-1", name: "管理者" },
        },
      ],
      error: null,
    };
    mocks.responses["select:entries"] = { data: [], error: null };

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByText("ダミー種目1")).toBeTruthy();
    });
  });

  it("長水路大会で styles id 8/12/16 のいずれかにエントリー (entries) のみ存在し records が無い場合でも、カードが表示される", async () => {
    mocks.responses["select:records"] = { data: [], error: null };
    mocks.responses["select:entries"] = {
      data: [
        {
          id: "entry-1",
          user_id: "admin-1",
          style_id: 8,
          entry_time: 40,
          note: null,
          users: { id: "admin-1", name: "管理者" },
        },
      ],
      error: null,
    };

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByText("ダミー種目8")).toBeTruthy();
    });
  });

  it("長水路大会で relay_4x25_free に既存 relay_records がある場合、既定非表示でもカードが表示される", async () => {
    // relay_4x25_free (自由形25m x4) を検出させるため、is_relaying=[false,true,true,true] の
    // 4件連続 + style_id=1 (25m自由形) の既存 records を用意する。
    mocks.responses["select:records"] = {
      data: [0, 1, 2, 3].map((idx) => ({
        id: `relay-record-${idx}`,
        user_id: `user-${idx}`,
        style_id: 1,
        time: 15 + idx,
        is_relaying: idx !== 0,
        reaction_time: null,
        note: null,
        split_times: [],
        users: { id: `user-${idx}`, name: `選手${idx}` },
      })),
      error: null,
    };
    mocks.responses["select:entries"] = { data: [], error: null };

    renderScreen(queryClient);

    await waitFor(() => {
      // [仕様変更] リレーラベルは「200FR」等の短縮形ではなく、個人種目と揃えた
      // 「{距離}m{フリーリレー}」形式になった (competition.records.freeRelaySuffix を再利用)。
      // relay_4x25_free は legDistance(25) * legCount(4) = 100m なので「100mフリーリレー」。
      expect(screen.getByText("100mフリーリレー")).toBeTruthy();
    });
  });

  it("既存記録・エントリーのどちらも無い長水路大会の25m種目は、例外に該当せず非表示のまま (対照)", async () => {
    mocks.responses["select:records"] = { data: [], error: null };
    mocks.responses["select:entries"] = { data: [], error: null };

    renderScreen(queryClient);

    await waitFor(() => {
      expect(screen.getByText("ダミー種目20")).toBeTruthy();
    });
    expect(screen.queryByText("ダミー種目1")).toBeNull();
    expect(screen.queryByText("ダミー種目8")).toBeNull();
    expect(screen.queryByText("ダミー種目12")).toBeNull();
    expect(screen.queryByText("ダミー種目16")).toBeNull();
  });
});
