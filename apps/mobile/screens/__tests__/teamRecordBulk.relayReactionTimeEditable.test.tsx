// =============================================================================
// teamRecordBulk.relayReactionTimeEditable.test.tsx
// =============================================================================
//
// TeamRecordStyleDetailScreen (代理入力・個人種目カード) — リレー ON でも
// リアクションタイム (RT) を入力できること。
//
// 人間の意図:
//   コーチが代理入力する際、選手のリレー引き継ぎタイムはリレー ON の状態でこそ
//   記録したい値である。以前は `{!mr.isRelaying && (...)}` で RT 入力欄自体を
//   非表示にしており、コーチが選手をリレー ON にした瞬間に入力欄が消えて
//   記録できなくなっていた (実害: 引き継ぎ RT が代理入力できない)。
//
// ここで固定する契約:
//   - リレー ON (isRelaying: true) の状態で描画しても RT 入力欄が存在し、編集できる
//   - 「リレー」Switch を OFF → ON にトグルしても RT 入力欄が消えず、
//     既に入力していた値も保持される
//   - RT に入力した値は isRelaying の状態に関わらず state に反映される
//
// ミューテーションでの実証 (作業ログ):
//   `{!mr.isRelaying && (...)}` で RT 入力欄を再度ラップすると、本ファイルの
//   全テストが「見つからない」で red になることを手動で確認済み
//   (production コードは検証後に原状復帰)。
//
// トートロジー回避:
//   RT の表示条件をこのテスト内で再実装しない。「入力欄が見つかるか」
//   「入力した値が画面に反映されるか」という観察可能な結果だけを assert する。
// =============================================================================

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// __mocks__/react-native.ts の TextInput は onChangeText を DOM の onChange に
// 結線しないため fireEvent.change でテキスト入力を再現できない。3件目のテスト
// (RT に新しい値を入力する) のためにこのファイル限定で結線する
// (teamRecordBulk.detailScreenInvalidate.test.tsx と同じ対処)。
vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return {
    ...actual,
    KeyboardAvoidingView: actual.View,
    TextInput: ({
      onChangeText,
      value,
      ...props
    }: { onChangeText?: (text: string) => void; value?: string } & Record<string, unknown>) =>
      React.createElement("input", {
        type: "text",
        ...props,
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      }),
  };
});

const mocks = vi.hoisted(() => {
  const styles = [{ id: 2, name_jp: "50m自由形", name: "50m Freestyle", style: "Fr", distance: 50 }];

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
          in: () => builder,
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
    routeParams: { competitionId: "comp-1", teamId: "team-1", styleId: 2 } as Record<string, unknown>,
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

import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";

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
  reactionTime?: number | null;
}) {
  return {
    id: opts.id,
    user_id: opts.userId,
    style_id: opts.styleId,
    time: opts.time,
    is_relaying: opts.isRelaying,
    reaction_time: opts.reactionTime ?? null,
    note: null,
    split_times: [],
    users: { id: opts.userId, name: opts.name },
  };
}

/** 個人種目カードの Switch (isRelaying トグル) を一意に探す。
 *  __mocks__/react-native.ts の Switch モックだけが data-value 属性を付与するため、
 *  Pressable (button, data-value なし) と区別できる。 */
function getRelaySwitch(container: HTMLElement): HTMLButtonElement {
  const el = container.querySelector("button[data-value]");
  if (!el) throw new Error("relay switch not found");
  return el as HTMLButtonElement;
}

describe("TeamRecordStyleDetailScreen — リレー ON でも RT (リアクションタイム) を入力できる", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.routeParams = { competitionId: "comp-1", teamId: "team-1", styleId: 2 };
    mocks.getStyles.mockResolvedValue(mocks.styles);
    mocks.getBestTimesDetailedForUsers.mockResolvedValue(new Map());
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:entries"] = { data: [], error: null };
    mocks.responses["select:records"] = { data: [], error: null };
  });

  it("既存記録が isRelaying=true の状態で描画しても RT 入力欄が存在し、既存値が表示される", async () => {
    mocks.responses["select:records"] = {
      data: [
        makeRecord({
          id: "r1",
          userId: "user-1",
          name: "管理者",
          styleId: 2,
          time: 27.0,
          isRelaying: true,
          reactionTime: 0.55,
        }),
      ],
      error: null,
    };

    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(screen.getByDisplayValue("27.00")).toBeDefined();
    });
    const rtInput = screen.getByDisplayValue("0.55") as HTMLInputElement;
    expect(rtInput).toBeDefined();
    expect(rtInput.disabled).toBe(false);
  });

  it("「リレー」Switch を OFF → ON にトグルしても RT 入力欄が消えず、入力済みの値が保持される", async () => {
    mocks.responses["select:records"] = {
      data: [
        makeRecord({
          id: "r1",
          userId: "user-1",
          name: "管理者",
          styleId: 2,
          time: 27.0,
          isRelaying: false,
          reactionTime: 0.62,
        }),
      ],
      error: null,
    };

    const queryClient = makeQueryClient();
    const { container } = render(<TeamRecordStyleDetailScreen />, {
      wrapper: createWrapper(queryClient),
    });

    // OFF の時点でも RT 欄は存在する (このスプリント以前から分岐が無かった側)
    expect(await screen.findByDisplayValue("0.62")).toBeDefined();

    const relaySwitch = getRelaySwitch(container);
    expect(relaySwitch.getAttribute("data-value")).toBe("false");
    fireEvent.click(relaySwitch);
    expect(relaySwitch.getAttribute("data-value")).toBe("true");

    // ON にトグルした後も RT 欄が引き続き存在し、値が消えていない
    const rtInputAfterToggle = screen.getByDisplayValue("0.62") as HTMLInputElement;
    expect(rtInputAfterToggle).toBeDefined();
    expect(rtInputAfterToggle.disabled).toBe(false);
  });

  it("リレー ON の状態で RT に新しい値を入力すると画面に反映される (isRelaying による入力拒否が無い)", async () => {
    mocks.responses["select:records"] = {
      data: [
        makeRecord({
          id: "r1",
          userId: "user-1",
          name: "管理者",
          styleId: 2,
          time: 27.0,
          isRelaying: true,
          reactionTime: null,
        }),
      ],
      error: null,
    };

    const queryClient = makeQueryClient();
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    const rtInput = await screen.findByPlaceholderText("0.65");
    fireEvent.change(rtInput, { target: { value: "0.71" } });

    expect(screen.getByDisplayValue("0.71")).toBeDefined();
  });
});
