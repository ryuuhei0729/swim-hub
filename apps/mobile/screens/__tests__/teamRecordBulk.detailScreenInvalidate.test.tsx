// =============================================================================
// teamRecordBulk.detailScreenInvalidate.test.tsx
// =============================================================================
//
// 【命名の経緯】このファイルは元々 `TeamRecordBulkFormScreen.invalidate.test.tsx`
// という名前だったが、対象画面 `TeamRecordBulkFormScreen.tsx` は
// 修正ラウンド 2026-09-17 (「組」入力の2階層化復旧) で削除され、
// `TeamRecordStyleDetailScreen.tsx` に置き換わった。中身は既にこの新画面の
// テストになっていたが、ファイル名だけ削除済みの旧画面名のまま残っていたため
// (Reviewer 指摘)、既存の命名規則 `teamRecordBulk.<関心事>.test.tsx` に合わせて
// リネームした。観点そのもの (保存後のキャッシュ invalidate) は変わっていない。
//
// Sprint Contract 検証観点 (B-2 の姉妹バグ):
//   チーム記録の種目詳細画面 (TeamRecordStyleDetailScreen) の保存後 invalidate は
//   ["calendar"] と teamKeys.competitions(teamId) のみで、recordKeys.lists() が
//   欠落している。姉妹画面 TeamPracticeLogBulkFormScreen.tsx は practiceKeys.lists() を
//   正しく invalidate しており、これは非対称バグ (同一クラスの欠陥)。
//   → 対象メンバーの記録一覧 (大会タブ) キャッシュが最新化されない (V-03)。
//
// トートロジー防止メモ: 「invalidateQueries が呼ばれること」ではなく
// 「recordKeys.lists() 配下のキーが invalidate 対象に含まれること」を実際の
// QueryClient 経由で検証する。修正前のコードではこのテストは FAIL する。
//
// 実装上の注意: この画面は supabase.from(...) を直接叩く (shared API 経由ではない) ため、
// チェーン可能かつ thenable な最小限の supabase フェイクを用意する。
// 既存レコードを1件 (split_times 無し・非リレー) 用意し、buildStyleEntriesFromExisting
// (実装済みの純粋関数) が time>0 の memberRecord を再構築することを利用して、
// UI 操作 (種目/メンバー選択) なしで即座に保存可能な状態を作る
// (この画面のフルインタラクションE2Eは実機/Playwright 側で別途行う)。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, configure } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { recordKeys, teamKeys } from "@apps/shared/hooks/queries/keys";
import { Alert } from "react-native";

// このファイル限定で TextInput を onChange 結線済みに差し替えるため (下記 vi.mock)、
// RN の `testID` prop がそのまま DOM の `testid` 属性になる (`data-testid` にならない)。
// RTL のクエリ対象属性を合わせて切り替える (CompetitionTabFormScreen.test.tsx と同じ対処)。
configure({ testIdAttribute: "testID" });

// react-native の静的モックには KeyboardAvoidingView が含まれないため、
// この画面専用に補完する (RecordFormScreen.standalone.test.tsx と同じ方針。
// 共有モック __mocks__/react-native.ts 自体は変更しない)
vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return {
    ...actual,
    KeyboardAvoidingView: actual.View,
    // __mocks__/react-native.ts の TextInput は onChangeText を DOM の onChange に
    // 結線しないため fireEvent.change でテキスト入力を再現できない。V-M32 の
    // delete 経路 (既存行のタイムを0クリアして削除対象にする) を再現するために
    // このファイル限定で結線する。
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
  const style = {
    id: 2,
    name_jp: "50m自由形",
    name: "50m Freestyle",
    style: "Fr",
    distance: 50,
  };

  const existingRecord = {
    id: "record-1",
    user_id: "user-1",
    style_id: 2,
    time: 30.5,
    is_relaying: false,
    reaction_time: null,
    note: null,
    split_times: [] as { id: string; distance: number; split_time: number }[],
    users: { id: "user-1", name: "太郎" },
  };

  /** V-M32 の部分失敗シナリオ用: 太郎とは別の既存記録 (次郎) */
  const existingRecord2 = {
    id: "record-2",
    user_id: "user-2",
    style_id: 2,
    time: 28.0,
    is_relaying: false,
    reaction_time: null,
    note: null,
    split_times: [] as { id: string; distance: number; split_time: number }[],
    users: { id: "user-2", name: "次郎" },
  };

  // supabase.from(table)...の呼び出しシーケンス (select/insert/delete) ごとにレスポンスを
  // 切り替えられる最小のチェーン可能 + thenable フェイク。
  const responses: Record<string, { data: unknown; error: unknown }> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        let op: string | null = null;
        const builder: {
          select: (..._a: unknown[]) => typeof builder;
          eq: (..._a: unknown[]) => typeof builder;
          order: (..._a: unknown[]) => typeof builder;
          in: (..._a: unknown[]) => typeof builder;
          insert: (..._a: unknown[]) => typeof builder;
          update: (..._a: unknown[]) => typeof builder;
          delete: (..._a: unknown[]) => typeof builder;
          single: () => Promise<{ data: unknown; error: unknown }>;
          then: (
            resolve: (v: { data: unknown; error: unknown }) => void,
          ) => void;
        } = {
          select: (..._a) => {
            if (!op) op = "select";
            return builder;
          },
          eq: () => builder,
          order: () => builder,
          in: () => builder,
          insert: (..._a) => {
            if (!op) op = "insert";
            return builder;
          },
          update: (..._a) => {
            if (!op) op = "update";
            return builder;
          },
          delete: (..._a) => {
            if (!op) op = "delete";
            return builder;
          },
          single: () =>
            Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
          then: (resolve) => resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        };
        return builder;
      },
    };
  }

  return {
    style,
    existingRecord,
    existingRecord2,
    responses,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1", styleId: 2 } as Record<string, unknown>,
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
    subscription: null, // isPremium=false -> 代理動画アップロード分岐は通らない
    user: { id: "user-1" },
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({
    members: [
      { user_id: "user-1", role: "admin", users: { id: "user-1", name: "太郎" } },
      { user_id: "user-2", role: "user", users: { id: "user-2", name: "次郎" } },
    ],
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

// 本テストの検証対象外の重量コンポーネントを薄いスタブに差し替える
// (RecordFormScreen.standalone.test.tsx と同じ方針)
vi.mock("@/components/shared/VideoUploader", () => ({
  VideoUploader: () => null,
}));
vi.mock("@/components/shared/PremiumBadge", () => ({
  PremiumBadge: () => null,
}));
vi.mock("@/components/records/LapTimeDisplay", () => ({
  LapTimeDisplay: () => null,
}));
vi.mock("@/components/teams/MemberSelectModal", () => ({
  MemberSelectModal: () => null,
}));

import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("TeamRecordStyleDetailScreen — 保存成功後のキャッシュ無効化 (V-03)", () => {
  let queryClient: QueryClient;
  let invalidateSpy: MockInstance<QueryClient["invalidateQueries"]>;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [mocks.existingRecord], error: null };
    mocks.responses["delete:records"] = { data: null, error: null };
    mocks.responses["insert:records"] = { data: { id: "new-record-1" }, error: null };
  });

  it(
    "[V-03] 既存メンバー記録の再保存後、大会タブが購読する recordKeys.lists() 配下が " +
      "invalidate される (従来は calendar / teamKeys.competitions のみ)",
    async () => {
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

      // 既存の1件 (time=30.5, split_times無し) が buildStyleEntriesFromExisting で
      // 再構築され、UI 操作なしで保存可能な状態になっている
      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });

      fireEvent.click(screen.getByText("記録を保存"));

      await waitFor(() => {
        const invalidatedListsKey = invalidateSpy.mock.calls.some(([arg]) => {
          const key = (arg as { queryKey?: unknown[] } | undefined)?.queryKey;
          return Array.isArray(key) && JSON.stringify(key) === JSON.stringify(recordKeys.lists());
        });
        expect(invalidatedListsKey).toBe(true);
      });
    },
  );

  it("[非退行] calendar キャッシュも引き続き無効化される", async () => {
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });
    await waitFor(() => {
      expect(screen.getByText("記録を保存")).toBeDefined();
    });
    fireEvent.click(screen.getByText("記録を保存"));

    await waitFor(() => {
      const invalidatedCalendar = invalidateSpy.mock.calls.some(([arg]) => {
        const key = (arg as { queryKey?: unknown[] } | undefined)?.queryKey;
        return Array.isArray(key) && JSON.stringify(key) === JSON.stringify(["calendar"]);
      });
      expect(invalidatedCalendar).toBe(true);
    });
  });

  it("[非退行] teamKeys.competitions(teamId) も引き続き無効化される", async () => {
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });
    await waitFor(() => {
      expect(screen.getByText("記録を保存")).toBeDefined();
    });
    fireEvent.click(screen.getByText("記録を保存"));

    await waitFor(() => {
      const invalidatedTeamCompetitions = invalidateSpy.mock.calls.some(([arg]) => {
        const key = (arg as { queryKey?: unknown[] } | undefined)?.queryKey;
        return (
          Array.isArray(key) &&
          JSON.stringify(key) === JSON.stringify(teamKeys.competitions("team-1"))
        );
      });
      expect(invalidatedTeamCompetitions).toBe(true);
    });
  });

});

// =============================================================================
// [V-M32] 部分失敗でもランキングのキャッシュを落とす (M-1)
//
// この画面は編集時に「既存 records を delete → 代理 insert をループ」する。
// 途中の insert が失敗すると `hasError = true` になり Alert を出して早期 return するが、
// **delete と成功した分の insert は既に DB に効いている**。
// つまり部分失敗こそキャッシュが最も古くなる状態で、
// 「もう存在しない記録」と「入った行の欠落」が同時に順位表に出る。
// 「失敗したから無効化を飛ばす」は逆で、無効化は hasError の早期 return より
// **前**に置く必要がある (web の RecordClient.tsx と同じ判断)。
//
// 🚨 「失敗したから呼ばれない」を pin してはいけない。それが修正対象の不具合。
//
// 対で「delete 自体が失敗して throw する経路では呼ばない」も押さえる。
// そこは records を1行も変更していないので、落とさないのが正しい。
//
// ランキングの無効化は `invalidateTeamRankings()` = `invalidateQueries({ predicate })`
// で行われる。他の無効化 (`queryKey` 指定) と区別するため、
// **predicate を持つ呼び出しで、かつその predicate がランキングのキーに一致する**
// ことを確認する (「predicate 付きの呼び出しがあった」だけでは別物を拾いうる)。
// =============================================================================
describe("[V-M32] 部分失敗時のランキングキャッシュ無効化 (M-1)", () => {
  let queryClient: QueryClient;
  let invalidateSpy: MockInstance<QueryClient["invalidateQueries"]>;

  /** ランキングのキーに一致する predicate 付き invalidateQueries が呼ばれた回数 */
  const rankingInvalidateCount = () =>
    invalidateSpy.mock.calls.filter(([arg]) => {
      const predicate = (arg as { predicate?: (q: unknown) => boolean } | undefined)?.predicate;
      if (typeof predicate !== "function") return false;
      // predicate が実際にランキング系のキーだけを拾うことまで確認する
      const hitsRankings = predicate({ queryKey: teamKeys.rankings("team-1", undefined) });
      const hitsHasAnyRecord = predicate({ queryKey: teamKeys.hasAnyRecord("team-1") });
      const skipsPractices = !predicate({ queryKey: teamKeys.practices("team-1") });
      return hitsRankings && hitsHasAnyRecord && skipsPractices;
    }).length;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    mocks.getStyles.mockResolvedValue([mocks.style]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    // 太郎(record-1)・次郎(record-2) の既存2行。upsert 化後は両方とも UPDATE される。
    mocks.responses["select:records"] = {
      data: [mocks.existingRecord, mocks.existingRecord2],
      error: null,
    };
    mocks.responses["delete:records"] = { data: null, error: null };
  });

  const save = async () => {
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });
    await waitFor(() => {
      expect(screen.getByText("記録を保存")).toBeDefined();
    });
    fireEvent.click(screen.getByText("記録を保存"));
  };

  /**
   * 次郎 (2件目) のタイム入力を空にする = shouldSave=false でフォームから
   * 消える = 既存 record-2 は削除対象になる (太郎の record-1 は UPDATE のまま)。
   * upsert 化後の「部分失敗」の再現には、旧アーキテクチャの
   * delete-all→insert-all と違い、UPDATE (太郎) と DELETE (次郎) が
   * 同時に走る状況を作る必要がある。
   *
   * 【仕様変更 (種目詳細画面の選手タブ化) に伴う修正】ItemTabs が「組」から
   * 「選手」単位になり、record-bulk-member-time は常にアクティブな選手1名分
   * しか描画されない (findAllByTestId が2件返る前提は崩れた)。次郎のタブ
   * (item-tab-2、選手の登場順=太郎→次郎) に切り替えてから該当欄を空にする。
   */
  const clearJiroTime = async () => {
    fireEvent.click(screen.getByTestId("item-tab-2"));
    const timeInputs = (await screen.findAllByTestId(
      "record-bulk-member-time",
    )) as HTMLInputElement[];
    expect(timeInputs).toHaveLength(1);
    const jiroInput = timeInputs[0];
    expect(jiroInput?.value).toBe("28.00");
    fireEvent.change(jiroInput as HTMLInputElement, { target: { value: "" } });
  };

  it("[V-M32] 保存成功時にランキングのキャッシュが落ちる (前提の確認)", async () => {
    await save();

    await waitFor(() => expect(rankingInvalidateCount()).toBeGreaterThanOrEqual(1));
  });

  it("[V-M32] UPDATE 成功 (太郎) + DELETE 失敗 (次郎) の部分失敗でもランキングのキャッシュが落ちる", async () => {
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });
    await waitFor(() => {
      expect(screen.getByText("記録を保存")).toBeDefined();
    });
    await clearJiroTime();

    // 次郎の削除 (record-2) だけ失敗させる。太郎の UPDATE は成功するので
    // 「一部は既に DB に反映済み」という部分失敗状態になる。
    mocks.responses["delete:records"] = {
      data: null,
      error: { code: "42501", message: "delete failed" },
    };

    fireEvent.click(screen.getByText("記録を保存"));

    // まず「部分失敗の経路を実際に通った」ことを Alert で確認する。
    // これを確認しないと、成功経路を測って緑になっているのと区別できない
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    // その上で、無効化が飛ばされていないこと (太郎の UPDATE は既に確定しているため)
    expect(rankingInvalidateCount()).toBeGreaterThanOrEqual(1);
    // 画面に留まる (リダイレクトしない) のも Web 準拠の既存挙動
    expect(mocks.goBack).not.toHaveBeenCalled();
  });

  it("[V-M32] 部分失敗時は記録一覧・大会・カレンダーのキャッシュも一緒に落ちる", async () => {
    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });
    await waitFor(() => {
      expect(screen.getByText("記録を保存")).toBeDefined();
    });
    await clearJiroTime();

    mocks.responses["delete:records"] = {
      data: null,
      error: { code: "42501", message: "delete failed" },
    };

    fireEvent.click(screen.getByText("記録を保存"));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    const invalidatedKeys = invalidateSpy.mock.calls
      .map(([arg]) => (arg as { queryKey?: unknown[] } | undefined)?.queryKey)
      .filter(Array.isArray)
      .map((key) => JSON.stringify(key));
    expect(invalidatedKeys).toContain(JSON.stringify(["calendar"]));
    expect(invalidatedKeys).toContain(JSON.stringify(teamKeys.competitions("team-1")));
    expect(invalidatedKeys).toContain(JSON.stringify(recordKeys.lists()));
  });

  it(
    "[V-M32] 対: バリデーションで保存が DB 書き込み前に中断された場合はランキングを落とさない " +
      "(upsert 化で『delete 自体が失敗して throw する経路』は無くなったが、" +
      "『1件も書き込み対象が無く保存関数が例外を投げる経路』(atLeastOneRecord) が" +
      "同じ役割 = 書き込みゼロなら無効化もゼロ、を引き継ぐ)",
    async () => {
      // 太郎・次郎の両方のタイムを空にする → 保存対象が1件も無く
      // saveStyleRecords が SaveStyleRecordsValidationError を投げる →
      // invalidateQueries に一切到達しない
      //
      // 【仕様変更】選手タブ化により record-bulk-member-time は常にアクティブな
      // 選手1名分しか描画されない。太郎(item-tab-1)を空にしてから次郎(item-tab-2)
      // に切り替えて同様に空にする (findAllByTestId が2件返る前提は崩れた)。
      render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });
      await waitFor(() => {
        expect(screen.getByText("記録を保存")).toBeDefined();
      });
      const taroInput = (await screen.findByTestId(
        "record-bulk-member-time",
      )) as HTMLInputElement;
      fireEvent.change(taroInput, { target: { value: "" } });

      fireEvent.click(screen.getByTestId("item-tab-2"));
      const jiroInput = (await screen.findByTestId(
        "record-bulk-member-time",
      )) as HTMLInputElement;
      fireEvent.change(jiroInput, { target: { value: "" } });

      fireEvent.click(screen.getByText("記録を保存"));

      // エラー経路を通ったことを確認 (通っていなければこのテストは無意味)
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      expect(rankingInvalidateCount()).toBe(0);
      const invalidatedKeys = invalidateSpy.mock.calls
        .map(([arg]) => (arg as { queryKey?: unknown[] } | undefined)?.queryKey)
        .filter(Array.isArray)
        .map((key) => JSON.stringify(key));
    expect(invalidatedKeys).not.toContain(JSON.stringify(["calendar"]));
  });
});
