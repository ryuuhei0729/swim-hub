// TeamEntryBulkFormScreen — 行レイアウト変更 (種目ラベルの数字直書き化 + メモ右配置) 検証
//
// Sprint Contract (Phase A, PM承認済み) 検証観点:
//   - 各行の種目フィールドのラベルが「種目 1」「種目 2」… になり、独立見出し行が無い
//   - メモ入力欄が種目フィールドの右側 (同一行) に描画される
//   - 重複エラーが行の全幅 (topRow の外) で表示される
//
// 【jsdom の限界について】
// 「メモが種目の右側にある」という視覚的事実そのものは jsdom では検証不能
// (jsdom は CSS レイアウトエンジンを持たず、要素の実際の座標を計算しない)。
// ここでは代わりに、実機 RN の flexDirection:"row" が意味する「同一の行方向コンテナに
// 同居し、ドキュメント順で左→右の順に並ぶ」という構造的事実だけを検証する
// (対象ロケール ja/en/zh/ko/de はいずれも LTR なので、DOM順=視覚的な左右順に対応する)。
// 実際のマージン縮小・見た目のバランスは Phase B で Android エミュレータ実機確認に回す
// (このファイルの末尾 TODO コメント参照)。
//
// このファイルは既存の teamEntryBulk.adminProxy.test.tsx / .nonSwimmerAdminGuard.test.tsx
// とは独立したファイルとして新規追加する (既存2ファイル・12件は変更しない)。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const styleFree = {
    id: 3,
    name_jp: "自由形100m",
    name: "Freestyle",
    style: "fr",
    distance: 100,
  };
  const styleBreast = {
    id: 9,
    name_jp: "平泳ぎ50m",
    name: "Breaststroke",
    style: "br",
    distance: 50,
  };

  const responses: Record<string, { data: unknown; error: unknown }> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        const op = "select";
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = vi.fn(chain);
        builder.eq = vi.fn(chain);
        builder.order = vi.fn(() => Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }));
        builder.single = vi.fn(() => Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }));
        return builder;
      },
    };
  }

  return {
    styleFree,
    styleBreast,
    responses,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1" },
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getBestTimesForUsers: vi.fn(),
    createBulkEntries: vi.fn().mockResolvedValue([]),
    updateEntry: vi.fn().mockResolvedValue({}),
    deleteBulkEntries: vi.fn().mockResolvedValue(undefined),
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
    user: { id: "admin-1" },
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({
    members: [
      { user_id: "admin-1", role: "admin", users: { id: "admin-1", name: "管理者" } },
      { user_id: "user-1", role: "user", users: { id: "user-1", name: "選手A" } },
    ],
    isLoading: false,
  }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    createBulkEntries = mocks.createBulkEntries;
    updateEntry = mocks.updateEntry;
    deleteBulkEntries = mocks.deleteBulkEntries;
  },
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimesForUsers = mocks.getBestTimesForUsers;
  },
}));

vi.mock("@/components/teams/MemberSelectModal", () => ({
  MemberSelectModal: () => null,
}));

import { TeamEntryBulkFormScreen } from "../TeamEntryBulkFormScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

/**
 * 与えられた要素から、style.flexDirection === "row" を持つ最も近い祖先要素を返す。
 * 実装後の topRow はこの探索で必ず見つかる想定 (見つからなければテストは失敗する = red)。
 */
function findRowFlexAncestor(el: Element | null): HTMLElement | null {
  let cur: HTMLElement | null = el as HTMLElement | null;
  while (cur) {
    if (cur.style.flexDirection === "row") return cur;
    cur = cur.parentElement;
  }
  return null;
}

describe("TeamEntryBulkFormScreen — 行レイアウト (種目ラベル数字直書き + メモ右配置)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    mocks.getStyles.mockResolvedValue([mocks.styleFree, mocks.styleBreast]);
    mocks.getBestTimesForUsers.mockResolvedValue(new Map());
    mocks.createBulkEntries.mockResolvedValue([]);
    mocks.updateEntry.mockResolvedValue({});
    mocks.deleteBulkEntries.mockResolvedValue(undefined);

    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0, date: "2999-01-01", entry_status: "open" },
      error: null,
    };
    mocks.responses["select:entries"] = {
      data: [
        {
          id: "entry-X",
          user_id: "user-1",
          style_id: 3,
          entry_time: 60.5,
          note: null,
          users: { id: "user-1", name: "選手A" },
        },
        {
          id: "entry-Y",
          user_id: "user-1",
          style_id: 9,
          entry_time: 40.0,
          note: null,
          users: { id: "user-1", name: "選手A" },
        },
      ],
      error: null,
    };
  });

  it(
    "各行の種目フィールドのラベルが『種目 1』『種目 2』になり、独立した見出し行 (旧" +
      " rowIndexLabel) は存在しない（人間の意図: 見出し行と種目ラベルが2重に" +
      "『種目』を表示していないか。旧実装は rowHeader に「種目 N」、field に固定文字列" +
      "「種目」の2箇所を持っていたため、後者が残っていないことも同時に確認する）",
    async () => {
      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      // 新ラベル「種目 1」「種目 2」がそれぞれちょうど1件だけ存在する
      expect(screen.getAllByText("種目 1")).toHaveLength(1);
      expect(screen.getAllByText("種目 2")).toHaveLength(1);

      // 旧固定文字列「種目」だけの見出し・ラベルが残っていない
      // (種目選択モーダルのシートタイトルにのみ残存してよいが、モーダルは非表示のはず)
      expect(screen.queryAllByText("種目")).toHaveLength(0);
    },
  );

  it(
    "メモ入力欄が種目フィールドと同一の行方向 (flexDirection:'row') コンテナに同居し、" +
      "ドキュメント順で種目フィールドより後 (=右) に配置される（人間の意図: 『メモ欄を" +
      "種目の右側に表示』という要求の構造的な検証。座標計算は jsdom で不可能なため、" +
      "flex-row 同居 + DOM順で近似する）",
    async () => {
      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      const rowLabel = screen.getByText("種目 1");
      const topRow = findRowFlexAncestor(rowLabel);
      expect(topRow).not.toBeNull();

      const memoInputs = screen.getAllByPlaceholderText("メモ（任意）");
      expect(memoInputs.length).toBeGreaterThan(0);
      const memoInputForRow1 = memoInputs[0]!; // DOM順で1行目が最初に描画されるため必ず存在

      // メモ入力欄は種目ラベルと同じ topRow の内側にある
      expect(topRow!.contains(memoInputForRow1)).toBe(true);

      // ドキュメント順: rowLabel (種目側) → memoInputForRow1 (メモ側)
      // Node.DOCUMENT_POSITION_FOLLOWING (4) が立っていれば memo は rowLabel より後
      const position = rowLabel.compareDocumentPosition(memoInputForRow1);
      const isFollowing = (position & Node.DOCUMENT_POSITION_FOLLOWING) === Node.DOCUMENT_POSITION_FOLLOWING;
      expect(isFollowing).toBe(true);
    },
  );

  it(
    "重複エラーは topRow (種目カラム+メモカラムの flex-row) の外側、行全幅の位置に" +
      "表示される（人間の意図: エラー文言が種目カラムの内側に収まると横幅の狭い" +
      "flex:1 カラムでテキストが折れる。全幅表示で読みやすくするという要求の構造的な検証）",
    async () => {
      render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getAllByText("選手A").length).toBeGreaterThan(0);
      });

      // entry-Y (2行目, 平泳ぎ) の種目を entry-X (1行目, 自由形) と同じ種目に付け替えて
      // 重複させる
      const pickerButtons = screen
        .getAllByRole("button")
        .filter((btn) => /自由形|平泳ぎ/.test(btn.textContent ?? ""));
      fireEvent.click(pickerButtons[1]!); // 2行目 (平泳ぎ) のピッカーボタン

      const freeOptions = await screen.findAllByText(/自由形/);
      fireEvent.click(freeOptions[freeOptions.length - 1]!.closest("button") ?? freeOptions[freeOptions.length - 1]!);

      // 重複エラーが両方の行に表示される (行自体が描画されていることの確認と対で)
      const errorTexts = await screen.findAllByText("同じ選手・種目の行が重複しています");
      expect(errorTexts).toHaveLength(2);

      const rowLabel = screen.getByText("種目 1");
      const topRowForRow1 = findRowFlexAncestor(rowLabel);
      expect(topRowForRow1).not.toBeNull();

      // 1行目のエラーテキスト (DOM順で最初に現れるもの) は topRow の外側にある
      expect(topRowForRow1!.contains(errorTexts[0]!)).toBe(false);
    },
  );

  // TODO (Phase B, jsdom では検証不能): 左右 margin/padding の縮小そのものは
  // 数値比較で「縮んだ」ことは検証できても「見た目として崩れていないか」は
  // Android エミュレータでの実機/スクリーンショット確認に回す。
});
