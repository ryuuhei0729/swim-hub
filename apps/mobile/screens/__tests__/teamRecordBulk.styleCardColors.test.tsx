// =============================================================================
// teamRecordBulk.styleCardColors.test.tsx
// [QA Sprint Contract Phase B] 種目一覧カードの配色が canonical な SwimStyle コード
// ("Fr"/"Br"/"Ba"/"Fly"/"IM") で引かれていること、日本語種目名で引いていないことの検証
// =============================================================================
//
// 過去に web のメンバー管理表 (MembersTimeTable.tsx) で「日本語キーの対応表を
// 5ロケール画面にそのまま流用し、en/de/ko/zh で一切色が付かなくなった」障害と
// 同型の罠が対象。ここでは:
//
// 1. `STYLE_CARD_BACKGROUND_HEX` の定義自体が canonical キーのみで日本語キーを
//    持たないことをピン留めする (単体テスト)。
// 2. `TeamRecordStyleListScreen` を実レンダーし、実際に描画されるカードの
//    background-color が canonical コード対応の hex 値であることを検証する
//    (呼び出し側が canonical コードで正しく引いていることの統合テスト)。
// 3. [ミューテーション実証] 呼び出し側 (TeamRecordStyleListScreen.tsx) を
//    「日本語化されたラベルで引く」実装に一時的に書き換えると、この (2) のテストが
//    実際に red になることを別途手動で確認済み (QA Report 参照。プロダクションコードは
//    検証後に shasum 一致を確認して復元し、テストには実装を再実装していない)。
// =============================================================================

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STYLE_CARD_BACKGROUND_HEX } from "../teamRecordBulk/styleCardColors";

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

/** hex ("#RRGGBB") → jsdom が正規化して返す "rgb(r, g, b)" 形式への変換 (テスト用の汎用ヘルパー、種目色ロジックの複製ではない) */
function hexToRgbString(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

// canonical コードを持つ実在種目に近い2件 (自由形・平泳ぎ) のみを使う
// (グリッド折返し自体は teamRecordBulk.chunkIntoGroupedRows.test.ts で別途検証済みなので、
// ここでは配色の検証に必要な最小構成に絞る)。
const STYLES_WITH_CANONICAL_CODE = [
  { id: 1, name_jp: "50m自由形", name: "Freestyle 50m", style: "Fr", distance: 50 },
  { id: 2, name_jp: "50m平泳ぎ", name: "Breaststroke 50m", style: "Br", distance: 50 },
];

function renderScreen(queryClient: QueryClient) {
  return render(<TeamRecordStyleListScreen />, { wrapper: createWrapper(queryClient) });
}

describe("[定義] STYLE_CARD_BACKGROUND_HEX は canonical な SwimStyle コードのみをキーに持つ", () => {
  it("Fr/Br/Ba/Fly/IM の5キーのみが存在する (日本語キーが紛れ込んでいない)", () => {
    expect(Object.keys(STYLE_CARD_BACKGROUND_HEX).sort()).toEqual(
      ["Ba", "Br", "Fly", "Fr", "IM"].sort(),
    );
  });

  it("日本語の種目名では色を引けない (存在しないキーなので undefined)", () => {
    const table = STYLE_CARD_BACKGROUND_HEX as Record<string, string | undefined>;
    expect(table["自由形"]).toBeUndefined();
    expect(table["平泳ぎ"]).toBeUndefined();
    expect(table["50m自由形"]).toBeUndefined();
  });
});

describe("[V-06a] 種目一覧カードの配色は canonical コードで正しく引かれている (統合)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mocks.getStyles.mockResolvedValue(STYLES_WITH_CANONICAL_CODE);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "配色検証大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [], error: null };
    mocks.responses["select:entries"] = { data: [], error: null };
    mocks.membersBox.current = [
      { user_id: "admin-1", role: "admin", users: { id: "admin-1", name: "管理者" } },
    ];
  });

  it("自由形 (Fr) カードの背景色は STYLE_CARD_BACKGROUND_HEX.Fr と一致する", async () => {
    renderScreen(queryClient);

    const card = await screen.findByText("50m自由形");
    const button = card.closest("button");
    expect(button).not.toBeNull();

    await waitFor(() => {
      expect(button?.style.backgroundColor).toBe(hexToRgbString(STYLE_CARD_BACKGROUND_HEX.Fr));
    });
  });

  it("平泳ぎ (Br) カードの背景色は自由形と異なり、STYLE_CARD_BACKGROUND_HEX.Br と一致する", async () => {
    renderScreen(queryClient);

    const card = await screen.findByText("50m平泳ぎ");
    const button = card.closest("button");
    expect(button).not.toBeNull();

    await waitFor(() => {
      expect(button?.style.backgroundColor).toBe(hexToRgbString(STYLE_CARD_BACKGROUND_HEX.Br));
      expect(button?.style.backgroundColor).not.toBe(hexToRgbString(STYLE_CARD_BACKGROUND_HEX.Fr));
    });
  });
});
