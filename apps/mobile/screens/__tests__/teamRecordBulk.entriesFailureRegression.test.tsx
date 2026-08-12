// =============================================================================
// teamRecordBulk.entriesFailureRegression.test.tsx
// =============================================================================
//
// Reviewer 指摘 (Critical 1件 + Warning 2件、2026-08-12 着地確認済み) の回帰テスト。
//
// [Critical] entries の取得失敗が記録入力画面全体をブロックしていた
//   TeamRecordBulkFormScreen.tsx が `throw entriesRes.error` で致命扱いにしており、
//   ErrorView が navigation.goBack() しか提供しないため記録入力に進めなくなっていた。
//   entries はエントリー初期反映・参考ラベル表示のための補助データに過ぎず、
//   この機能追加前は画面が依存していなかった単一障害点を新設してはならない。
//
// [Warning 1] userName フォールバックが生の "Unknown" ハードコードだった
//   web の t("teams.competitionRecordsModal.unknownUser") と同じキーに統一された。
//
// [Warning 2] entryTimeReference のバッジ表示ガードが `!= null` のみだった
//   web と同じ `!= null && > 0` に揃えられた (entry_time=0 のときバッジを出さない)。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
    style,
    responses,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1" },
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(async () => "test-access-token"),
    teamMembers: [
      { user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎" } },
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

describe("TeamRecordBulkFormScreen — entries 取得失敗の回帰 (Critical, 2026-08-12着地確認)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
  });

  it(
    "entries の取得が失敗しても ErrorView に遷移せず、記録入力フォームが開ける" +
      "（人間の意図: entries はエントリー初期反映・参考ラベル表示のための補助データに過ぎない。" +
      "この機能追加前は記録入力画面が依存していなかった entries の取得失敗が、" +
      "画面全体を落とす新たな単一障害点になってはならない）",
    async () => {
      mocks.responses["select:records"] = {
        data: [
          {
            id: "record-1",
            user_id: "user-1",
            style_id: 2,
            time: 30.0,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-1", name: "太郎" },
          },
        ],
        error: null,
      };
      // entries の取得自体が失敗する
      mocks.responses["select:entries"] = {
        data: null,
        error: { message: "entries fetch failed" },
      };

      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      // ErrorView (再試行ボタン) には遷移しない。記録入力フォームの保存ボタンが表示される
      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });
      expect(screen.queryByText("再試行")).toBeNull();

      // 既存記録 (太郎, 30.00秒) の入力・編集は続行できる (entries 失敗の影響を受けない)
      const timeInput = screen.getByPlaceholderText("例: 1:30.50") as HTMLInputElement;
      expect(timeInput.value).toBe("30.00");
    },
  );
});

describe("TeamRecordBulkFormScreen — userName フォールバックの i18n 化 (Warning 1, 2026-08-12着地確認)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [], error: null };
  });

  it(
    "entries.users の join が欠落したエントリー行の表示名は、生の 'Unknown' ではなく" +
      "i18n キー teams.competitionRecordsModal.unknownUser 経由の翻訳済み文言" +
      "('不明') になる (人間の意図: web の t(\"competitionRecordsModal.unknownUser\") と" +
      "同一キーで文言を揃える。生の英語リテラルへの後退を検出する)",
    async () => {
      mocks.responses["select:entries"] = {
        data: [
          { id: "entry-1", user_id: "user-ghost", style_id: 2, entry_time: 40.0, note: null, users: null },
        ],
        error: null,
      };

      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });

      // i18n 経由の翻訳済み文言 ("不明") が表示される。生の "Unknown" は出ない
      expect(document.body.textContent).toContain("不明");
      expect(document.body.textContent).not.toContain("Unknown");
    },
  );
});

describe("TeamRecordBulkFormScreen — entry_time=0 のバッジ非表示 (Warning 2, 2026-08-12着地確認)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
  });

  it(
    "entry_time=0 のエントリーがあっても参考ラベル (エントリータイム:) は表示されない" +
      "(人間の意図: web `RecordClient.tsx` は `entryTimeReference != null && > 0` で" +
      "ガードしており 0 のときは非表示。mobile も同じ式に揃えたことを固定する。" +
      "parseTimeFlexible は通常 0 を返さないため現行 UI からは再現できないが、" +
      "データ移行や直接 DB 編集で入り得る値)",
    async () => {
      mocks.responses["select:records"] = {
        data: [
          {
            id: "record-1",
            user_id: "user-1",
            style_id: 2,
            time: 30.0,
            is_relaying: false,
            reaction_time: null,
            note: null,
            split_times: [],
            users: { id: "user-1", name: "太郎" },
          },
        ],
        error: null,
      };
      mocks.responses["select:entries"] = {
        data: [
          { id: "entry-1", user_id: "user-1", style_id: 2, entry_time: 0, note: null, users: { id: "user-1", name: "太郎" } },
        ],
        error: null,
      };

      const queryClient = makeQueryClient();
      render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });

      expect(screen.queryByText(/エントリータイム:/)).toBeNull();
    },
  );
});
