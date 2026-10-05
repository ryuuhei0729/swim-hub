// =============================================================================
// teamRecordBulkScreenHarness.tsx
// 種目一覧 (TeamRecordStyleListScreen) / 種目詳細 (TeamRecordStyleDetailScreen) を
// render するテストの共通モック。QA (Evaluator) が所有するテスト支援コード。
// =============================================================================
//
// このファイルを import するだけで、下記モジュールが vi.mock される。
// 画面ごとに差し替えたい値は `harness` のプロパティを書き換える。
//
//   react-native                      KeyboardAvoidingView → View。TextInput は
//                                     harness.rawTextInput で切り替え (下記)。
//                                     ScrollView の contentContainerStyle を記録する
//   @react-navigation/native          useRoute / useNavigation / usePreventRemove /
//                                     useFocusEffect (マウント時に1回 + focusListeners)
//   @/contexts/AuthProvider           supabase / currentUserId / getAccessToken
//   @apps/shared/hooks/queries/teams  members
//   @apps/shared/api/styles           getStyles
//   @apps/shared/api/records          getBestTimesDetailedForUsers
//   VideoUploader / PremiumBadge / LapTimeDisplay → 描画しない
//   MemberSelectModal                 描画せず props を memberSelectProps に記録する
//
// 🚨 テストファイル側で上記モジュールを vi.mock し直してはいけない。ファイル側の
//    vi.mock は巻き上げで先に登録され、このファイルの import 時に上書きされて
//    黙って無効になる。挙動を変えたいときは harness にプロパティを足す。
//
// harness の値はテストファイル内で持ち越される (自動ではリセットしない)。
// 各ファイルの beforeEach で、そのファイルが前提にする値を明示的に設定すること。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { vi } from "vitest";
import {
  buildRecordSaveSupabaseMock,
  type RecordSaveSupabaseMockOptions,
} from "./supabaseRecordSaveMock";

type PreventRemoveListener = (e: { data: { action: unknown } }) => void;

const harness = vi.hoisted(() => ({
  routeParams: { competitionId: "comp-1", teamId: "team-1", styleId: 2 } as Record<string, unknown>,
  navigate: vi.fn(),
  goBack: vi.fn(),
  dispatch: vi.fn(),
  preventRemoveCalls: [] as Array<{
    shouldPreventRemove: boolean;
    listener: PreventRemoveListener;
  }>,
  /** マウント中の画面の useFocusEffect コールバック。呼ぶとフォーカス復帰を再現できる */
  focusListeners: new Set<() => void>(),
  /** 未設定のまま render すると useAuth().supabase が null になり即座に落ちる */
  supabase: null as unknown,
  currentUserId: "user-1",
  getAccessToken: vi.fn(async () => "test-access-token"),
  members: [] as unknown[],
  getStyles: vi.fn(),
  getBestTimesDetailedForUsers: vi.fn(async (): Promise<unknown> => new Map()),
  memberSelectProps: [] as unknown[],
  /**
   * false: __mocks__/react-native.ts の TextInput (testID → data-testid に変換し、
   *        onChangeText を DOM の onChange に結線しない)。
   * true:  testID 属性のまま描画し、onChangeText を onChange に結線する
   *        (fireEvent.change で入力を再現したいファイル用)。
   *        testID で引くなら configure({ testIdAttribute: "testID" }) も併用する。
   */
  rawTextInput: false,
  scrollContentContainerStyles: [] as unknown[],
}));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  const OriginalTextInput = original.TextInput as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  const OriginalScrollView = original.ScrollView as unknown as React.ComponentType<
    Record<string, unknown>
  >;
  return {
    ...original,
    KeyboardAvoidingView: original.View,
    TextInput: (props: Record<string, unknown>) => {
      if (!harness.rawTextInput) return React.createElement(OriginalTextInput, props);
      const { onChangeText, value, ...rest } = props as {
        onChangeText?: (text: string) => void;
        value?: string;
      } & Record<string, unknown>;
      return React.createElement("input", {
        type: "text",
        ...rest,
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      });
    },
    // 静的モックの ScrollView は contentContainerStyle を DOM に落とすだけで
    // 検査できないため、prop そのものを記録してから渡さずに描画する
    ScrollView: ({
      contentContainerStyle,
      ...props
    }: { contentContainerStyle?: unknown } & Record<string, unknown>) => {
      harness.scrollContentContainerStyles.push(contentContainerStyle);
      return React.createElement(OriginalScrollView, props);
    },
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: harness.routeParams }),
  useNavigation: () => ({
    navigate: harness.navigate,
    goBack: harness.goBack,
    dispatch: harness.dispatch,
  }),
  usePreventRemove: (shouldPreventRemove: boolean, listener: PreventRemoveListener) => {
    harness.preventRemoveCalls.push({ shouldPreventRemove, listener });
  },
  // vitest.setup.ts のグローバルモック (`vi.fn((callback) => callback())`) はレンダーの
  // たびに callback を同期実行するため、setState を伴う load と組み合わさると
  // 無限ループになる。マウント時に1回だけ発火させ、以降は focusListeners 経由の
  // 明示的な呼び出しでのみ発火させる。callback は再レンダーで作り直されるので、
  // ref 経由で常に最新のものを呼ぶ (実際の react-navigation も同様)。
  useFocusEffect: (callback: () => void) => {
    const callbackRef = React.useRef(callback);
    callbackRef.current = callback;
    React.useEffect(() => {
      const listener = () => callbackRef.current();
      harness.focusListeners.add(listener);
      listener();
      return () => {
        harness.focusListeners.delete(listener);
      };
    }, []);
  },
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: harness.supabase,
    // isPremium=false → 代理動画アップロード分岐は通らない
    subscription: null,
    user: { id: harness.currentUserId },
    getAccessToken: harness.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: harness.members, isLoading: false }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = harness.getStyles;
  },
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimesDetailedForUsers = harness.getBestTimesDetailedForUsers;
  },
}));

vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/records/LapTimeDisplay", () => ({ LapTimeDisplay: () => null }));
vi.mock("@/components/teams/MemberSelectModal", () => ({
  MemberSelectModal: (props: unknown) => {
    harness.memberSelectProps.push(props);
    return null;
  },
}));

export { harness };

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

export const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/**
 * `"<op>:<table>"` (例: `"select:records"`) をキーに応答を引く読み取り専用の supabase フェイク。
 * 対応しているのは画面の読み込みが使う select / eq / order / in / single だけで、
 * insert / update / delete は TypeError で落ちる (保存を検証するなら
 * buildDetailScreenSupabaseMock を使う)。
 */
export function createResponseMapSupabase() {
  const responses: Record<string, { data: unknown; error: unknown }> = {};
  /** テーブルごとの select 発行回数 (再取得の検証用) */
  const selectCallCounts: Record<string, number> = {};
  const supabase = {
    from: (table: string) => {
      let op: string | null = null;
      const builder: Record<string, unknown> = {
        select: (..._a: unknown[]) => {
          if (!op) {
            op = "select";
            selectCallCounts[table] = (selectCallCounts[table] ?? 0) + 1;
          }
          return builder;
        },
        eq: () => builder,
        order: () => builder,
        in: () => builder,
        single: () => Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
          resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
      };
      return builder;
    },
  };
  return { supabase, responses, selectCallCounts };
}

/**
 * 画面の読み込み (`loadTeamRecordCompetitionData`) と保存 (`saveStyleRecords`) の両方を
 * 1つで賄う supabase フェイク。`buildRecordSaveSupabaseMock` は `.order()` を意図的に
 * 持たない (保存スコープの検証には出てこない) が、読み込みは `.order()` を呼ぶため
 * no-op で通すラッパーを被せる。
 */
export function buildDetailScreenSupabaseMock(options: RecordSaveSupabaseMockOptions = {}) {
  const base = buildRecordSaveSupabaseMock(options);
  const from = (table: string) => {
    const builder = base.supabase.from(table) as Record<string, unknown> & {
      order?: (...args: unknown[]) => unknown;
    };
    builder.order = (..._args: unknown[]) => builder;
    return builder;
  };
  return { ...base, supabase: { from } };
}
