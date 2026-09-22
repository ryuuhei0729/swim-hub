// =============================================================================
// teamRecordBulk.nonSwimmerHandoffDetail.test.tsx
// Sprint Contract Phase A スケルトン — 非泳者フィルタの新画面への引き継ぎ
// =============================================================================
//
// 事実8 (PM確定): 非泳者フィルタは既存機能 (直近コミット 731cc035 / dc8a26b6)。
// 新画面へ必ず引き継ぐこと。
// 重要な設計意図: isCurrentUserAdmin 判定と氏名解決には**生の members を
// 使い続け**、候補提示の直前だけフィルタする。
//
// 本ファイルは**詳細画面側**の候補フィルタ・氏名解決を対象にする。

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
    routeParams: { competitionId: "comp-1", teamId: "team-1", styleId: 2 } as Record<string, unknown>,
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(async () => "test-access-token"),
    membersBox: { current: [] as unknown[] },
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
    user: { id: "admin-nonswimmer-1" },
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: mocks.membersBox.current, isLoading: false }),
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

const capturedMemberSelectProps: Array<{ members: Array<{ user_id: string }> }> = [];
vi.mock("@/components/teams/MemberSelectModal", () => ({
  MemberSelectModal: (props: { members: Array<{ user_id: string }> }) => {
    capturedMemberSelectProps.push(props);
    return null;
  },
}));

import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("[V-09] 詳細画面での非泳者フィルタ引き継ぎ", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedMemberSelectProps.length = 0;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    mocks.getStyles.mockResolvedValue([
      { id: 2, name_jp: "自由形50m", name: "Freestyle", style: "Fr", distance: 50 },
    ]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:entries"] = { data: [], error: null };

    mocks.membersBox.current = [
      {
        user_id: "admin-nonswimmer-1",
        role: "admin",
        is_swimmer: false,
        users: { id: "admin-nonswimmer-1", name: "非泳者管理者" },
      },
      {
        user_id: "swimmer-1",
        role: "user",
        is_swimmer: true,
        users: { id: "swimmer-1", name: "選手A" },
      },
    ];
  });

  it("詳細画面のメンバー選択候補一覧 (MemberSelectModal 等) に非泳者が含まれない", async () => {
    mocks.responses["select:records"] = { data: [], error: null };

    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(capturedMemberSelectProps.length).toBeGreaterThan(0);
    });

    const lastProps = capturedMemberSelectProps[capturedMemberSelectProps.length - 1]!;
    const candidateIds = lastProps.members.map((m) => m.user_id);

    expect(candidateIds).toContain("swimmer-1");
    expect(candidateIds).not.toContain("admin-nonswimmer-1");
  });

  it("既に非泳者が割り当て済みのレグ (リレー種目) がある場合、select の表示が壊れない (web の withCurrentSelection と同型の保護)", async () => {
    // 非泳者管理者自身が第1泳者としてリレーレグに割り当て済みの既存記録
    // (非泳者を「選手」として登録できてしまった過去データ、または非泳者化
    //  タイミングのズレによる既存割り当てを想定)。
    mocks.routeParams.relayEventId = "relay_4x50_free" as never;
    mocks.responses["select:records"] = {
      data: [0, 1, 2, 3].map((idx) => ({
        id: `relay-record-${idx}`,
        user_id: idx === 0 ? "admin-nonswimmer-1" : `swimmer-${idx}`,
        style_id: 2,
        time: 27 + idx,
        is_relaying: idx !== 0,
        reaction_time: null,
        note: null,
        split_times: [],
        users: { id: idx === 0 ? "admin-nonswimmer-1" : `swimmer-${idx}`, name: `選手${idx}` },
      })),
      error: null,
    };
    mocks.membersBox.current = [
      ...mocks.membersBox.current,
      { user_id: "swimmer-2", role: "user", is_swimmer: true, users: { id: "swimmer-2", name: "選手2" } },
      { user_id: "swimmer-3", role: "user", is_swimmer: true, users: { id: "swimmer-3", name: "選手3" } },
    ];

    // クラッシュせずレンダリングが完了することを確認する (壊れたら getStyles 呼び出し前に例外で落ちる)
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(mocks.getStyles).toHaveBeenCalled();
    });

    delete (mocks.routeParams as { relayEventId?: unknown }).relayEventId;
  });

  it("氏名解決 (登録済み MemberRecord.memberName の表示) は生の members から行われ、非泳者フィルタ後の配列からは行われない (フィルタ後配列だと非泳者本人の氏名が解決できなくなるため)", async () => {
    // 非泳者管理者自身の既存記録 (過去に選手として登録された行) を用意する。
    // 氏名解決がフィルタ後配列からだと、非泳者本人の名前が解決できず空欄になる。
    mocks.responses["select:records"] = {
      data: [
        {
          id: "record-nonswimmer-1",
          user_id: "admin-nonswimmer-1",
          style_id: 2,
          time: 30.5,
          is_relaying: false,
          reaction_time: null,
          note: null,
          split_times: [],
          users: { id: "admin-nonswimmer-1", name: "非泳者管理者" },
        },
      ],
      error: null,
    };

    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    // 【仕様変更 (種目詳細画面の選手タブ化) に伴う修正】個人種目では選手氏名が
    // タブラベル (item-tab-1) とアクティブなメンバーカード (memberName) の
    // 両方に描画されるようになった。getByText は複数マッチで例外になるため
    // getAllByText で「氏名が解決され、どこかに表示されている」ことだけを見る
    // (0件=氏名解決の失敗と区別できれば良く、出現箇所数はこの観点の対象外)。
    await waitFor(() => {
      expect(screen.getAllByText("非泳者管理者").length).toBeGreaterThan(0);
    });
  });
});
