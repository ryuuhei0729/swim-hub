// =============================================================================
// teamRecordBulk.bestTimeBadge.test.tsx
// =============================================================================
//
// 「記録の代理入力」画面 (TeamRecordBulkFormScreen) のベストタイム参照バッジ。
//
// 人間の意図:
//   コーチが他人の記録を代理入力するとき、その選手の自己ベストが見えていないと
//   入力値の桁違いに気付けない。個人の大会入力画面 (CompetitionTabFormScreen) には
//   既にあるバッジを、チーム代理入力の個人種目カードとリレーの4レグにも出す。
//
// ここで固定する契約:
//   - バッジは表示のみ。タイム入力欄にベストタイムが流し込まれないこと
//     (エントリー代理入力の「ベストタイムを流用」ボタンとは別物)。
//   - リレーの第2〜4泳者は引き継ぎスタートなので「引き継ぎベスト」を表示する。
//     第1泳者は通常スタートなので通常ベストを表示する。両者は 0.5 秒前後違うため、
//     取り違えると速い方が自己ベストとして見えてしまう。
//   - 各レグは**自分が泳ぐ種目**のベストを引く (代表 styleId = 第1泳者の種目ではない)。
//
// トートロジー回避:
//   このハーネスは i18n をモックせず実メッセージを使うため、期待ラベルは
//   ja.json から読んで組み立てる (訳文をテスト側にハードコードしない)。
//   fixture の氏名にも期待文字列の部分文字列を含めない。
// =============================================================================

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ja from "@apps/shared/messages/ja.json";

vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return {
    ...actual,
    KeyboardAvoidingView: actual.View,
  };
});

const mocks = vi.hoisted(() => {
  const styles = [
    { id: 2, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 },
    { id: 9, name_jp: "50m平泳ぎ", name: "50m Breaststroke", style: "Br", distance: 50 },
    { id: 13, name_jp: "50m背泳ぎ", name: "50m Backstroke", style: "Ba", distance: 50 },
    { id: 17, name_jp: "50mバタフライ", name: "50m Butterfly", style: "Fly", distance: 50 },
  ];

  const responses: Record<string, { data: unknown; error: unknown }> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        let op: string | null = null;
        const builder: Record<string, unknown> = {
          select: (..._a: unknown[]) => {
            if (!op) op = "select";
            return builder;
          },
          eq: () => builder,
          order: () => builder,
          single: () => Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
          then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
            resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        };
        return builder;
      },
    };
  }

  return {
    styles,
    responses,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1" },
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(async () => "test-access-token"),
    getBestTimesDetailedForUsers: vi.fn(),
    teamMembers: [
      { user_id: "user-1", role: "admin", users: { id: "user-1", name: "管理者" } },
    ] as Array<{ user_id: string; role: string; users: { id: string; name: string } }>,
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
    user: { id: "user-1" },
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: mocks.teamMembers, isLoading: false }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimesDetailedForUsers = mocks.getBestTimesDetailedForUsers;
  },
}));

vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/records/LapTimeDisplay", () => ({ LapTimeDisplay: () => null }));
vi.mock("@/components/teams/MemberSelectModal", () => ({ MemberSelectModal: () => null }));

import { TeamRecordBulkFormScreen } from "../TeamRecordBulkFormScreen";

const LABEL = ja.forms.recordLog;

const createWrapper = (queryClient: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function makeRecord(opts: {
  id: string;
  userId: string;
  name: string;
  styleId: number;
  time: number;
  isRelaying: boolean;
}) {
  return {
    id: opts.id,
    user_id: opts.userId,
    style_id: opts.styleId,
    time: opts.time,
    is_relaying: opts.isRelaying,
    reaction_time: null,
    note: null,
    split_times: [],
    users: { id: opts.userId, name: opts.name },
  };
}

function makeBestTime(opts: {
  styleId: number;
  time: number;
  poolType: number;
  relayingTime?: number;
}) {
  const style = mocks.styles.find((s) => s.id === opts.styleId)!;
  return {
    id: `bt-${opts.styleId}-${opts.poolType}`,
    time: opts.time,
    created_at: "2025-06-01T00:00:00Z",
    pool_type: opts.poolType,
    is_relaying: false,
    style_id: style.id,
    style: { name_jp: style.name_jp, distance: style.distance },
    ...(opts.relayingTime !== undefined
      ? {
          relayingTime: {
            id: `bt-relay-${opts.styleId}-${opts.poolType}`,
            time: opts.relayingTime,
            created_at: "2025-06-01T00:00:00Z",
          },
        }
      : {}),
  };
}

/** メドレーリレー (背→平→バタ→自) の4件連続並び */
function medleyRelayRecords() {
  return [
    makeRecord({ id: "r1", userId: "user-10", name: "山田", styleId: 13, time: 31.0, isRelaying: false }),
    makeRecord({ id: "r2", userId: "user-11", name: "鈴木", styleId: 9, time: 33.5, isRelaying: true }),
    makeRecord({ id: "r3", userId: "user-12", name: "佐藤", styleId: 17, time: 29.8, isRelaying: true }),
    makeRecord({ id: "r4", userId: "user-13", name: "田中", styleId: 2, time: 27.0, isRelaying: true }),
  ];
}

/**
 * バッジ要素の取得方法について:
 *   `__mocks__/react-native.ts` は testID を data-testid に変換するのを TextInput に限定して
 *   おり (View / Text に広げると既存テストが一斉に赤くなるため、モック側のコメント参照)、
 *   `getByTestId` でバッジを引くことはできない。そこでラベル文言 (ja.json 由来) を頭に持つ
 *   <span> を DOM 順に拾う。リレーでは DOM 順 = レグ順なので、配列の完全一致で
 *   「どのレグにどのラベルのバッジが出たか」を順序ごと固定できる。
 */
const BADGE_LABELS = [
  LABEL.bestTimeLabel,
  LABEL.bestTimeRelay,
  LABEL.bestTimeLong,
  LABEL.bestTimeLongRelay,
  LABEL.bestTimeShort,
  LABEL.bestTimeShortRelay,
];

const normalize = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

const badgeTexts = (): string[] =>
  screen
    .queryAllByText((_content, element) => {
      if (element?.tagName !== "SPAN") return false;
      const text = normalize(element.textContent);
      // 「ベストタイム」は「ベストタイム(引継)」の接頭辞だが、直後の ": " まで含めて
      // 判定するのでラベル同士が取り違わることはない
      return BADGE_LABELS.some((label) => text.startsWith(`${label}: `));
    })
    .map((element) => normalize(element.textContent));

/** バッジが出そろうまで待ってから DOM 順の一覧を返す */
const waitForBadges = async (expectedCount: number): Promise<string[]> => {
  await waitFor(() => {
    expect(badgeTexts()).toHaveLength(expectedCount);
  });
  return badgeTexts();
};

describe("TeamRecordBulkFormScreen — ベストタイム参照バッジ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStyles.mockResolvedValue(mocks.styles);
    mocks.getBestTimesDetailedForUsers.mockResolvedValue(new Map());
    mocks.responses["select:competitions"] = {
      // pool_type=0 (短水路)。他水路フォールバックのラベル向きを検証するために固定する
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:entries"] = { data: [], error: null };
    mocks.responses["select:records"] = { data: [], error: null };
  });

  describe("個人種目カード", () => {
    it("同じ水路の通常ベストがラベル付きで表示され、タイム入力欄には流し込まれない", async () => {
      mocks.responses["select:records"] = {
        data: [
          makeRecord({ id: "r1", userId: "user-10", name: "山田", styleId: 2, time: 27.0, isRelaying: false }),
        ],
        error: null,
      };
      mocks.getBestTimesDetailedForUsers.mockResolvedValue(
        new Map([["user-10", [makeBestTime({ styleId: 2, time: 26.5, poolType: 0 })]]]),
      );

      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      expect(await waitForBadges(1)).toEqual([`${LABEL.bestTimeLabel}: 26.50`]);
      // 入力欄は既存記録の値のまま (ベストが初期値に化けない)
      expect(screen.getByDisplayValue("27.00")).toBeDefined();
      expect(screen.queryByDisplayValue("26.50")).toBeNull();
    });

    it("同じ水路に記録が無ければ他水路のベストへ落ち、ラベルで他水路だと分かる", async () => {
      mocks.responses["select:records"] = {
        data: [
          makeRecord({ id: "r1", userId: "user-10", name: "山田", styleId: 2, time: 27.0, isRelaying: false }),
        ],
        error: null,
      };
      mocks.getBestTimesDetailedForUsers.mockResolvedValue(
        new Map([["user-10", [makeBestTime({ styleId: 2, time: 28.4, poolType: 1 })]]]),
      );

      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      expect(await waitForBadges(1)).toEqual([`${LABEL.bestTimeLong}: 28.40`]);
    });

    it("その種目のベストを持たない選手にはバッジが出ない (0.00 を出さない)", async () => {
      mocks.responses["select:records"] = {
        data: [
          makeRecord({ id: "r1", userId: "user-10", name: "山田", styleId: 2, time: 27.0, isRelaying: false }),
        ],
        error: null,
      };
      mocks.getBestTimesDetailedForUsers.mockResolvedValue(
        new Map([["user-10", [makeBestTime({ styleId: 9, time: 33.0, poolType: 0 })]]]),
      );

      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByDisplayValue("27.00")).toBeDefined();
      });
      await waitFor(() => {
        expect(mocks.getBestTimesDetailedForUsers).toHaveBeenCalled();
      });
      expect(badgeTexts()).toEqual([]);
    });
  });

  describe("リレー4レグ", () => {
    beforeEach(() => {
      mocks.responses["select:records"] = { data: medleyRelayRecords(), error: null };
      mocks.getBestTimesDetailedForUsers.mockResolvedValue(
        new Map([
          // 第1泳者 (背泳ぎ): 引き継ぎベストも持つが通常スタートなので使わない
          ["user-10", [makeBestTime({ styleId: 13, time: 30.2, poolType: 0, relayingTime: 29.7 })]],
          // 第2泳者 (平泳ぎ): 引き継ぎベストを持つ
          ["user-11", [makeBestTime({ styleId: 9, time: 34.0, poolType: 0, relayingTime: 33.1 })]],
          // 第3泳者 (バタフライ): 引き継ぎベストが無いので通常ベストへ落ちる
          ["user-12", [makeBestTime({ styleId: 17, time: 29.0, poolType: 0 })]],
          // 第4泳者 (自由形): 他水路にしか記録が無い
          ["user-13", [makeBestTime({ styleId: 2, time: 27.8, poolType: 1, relayingTime: 27.1 })]],
        ]),
      );
    });

    it("第1泳者は通常ベスト、第2泳者は引き継ぎベストを表示する", async () => {
      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      const badges = await waitForBadges(4);
      expect(badges[0]).toBe(`${LABEL.bestTimeLabel}: 30.20`);
      expect(badges[1]).toBe(`${LABEL.bestTimeRelay}: 33.10`);
    });

    it("引き継ぎベストが無い泳者は同一水路の通常ベストへ、同一水路が無い泳者は他水路の引き継ぎベストへ落ちる", async () => {
      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      const badges = await waitForBadges(4);
      expect(badges[2]).toBe(`${LABEL.bestTimeLabel}: 29.00`);
      expect(badges[3]).toBe(`${LABEL.bestTimeLongRelay}: 27.10`);
    });

    it("各レグは自分が泳ぐ種目のベストを引く (平泳ぎのレグに自由形のベストが出ない)", async () => {
      mocks.getBestTimesDetailedForUsers.mockResolvedValue(
        new Map([
          // レグ2 の泳者が持つのは自由形 (= 代表 styleId 側ではなくレグ4 の種目) のベストだけ
          ["user-11", [makeBestTime({ styleId: 2, time: 24.0, poolType: 0, relayingTime: 23.5 })]],
        ]),
      );

      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(mocks.getBestTimesDetailedForUsers).toHaveBeenCalled();
      });
      // 自由形のベストしか持たない泳者が平泳ぎのレグに入っているので、
      // 4レグのどこにも 24.00/23.50 は出ない
      expect(badgeTexts()).toEqual([]);
    });
  });
});
