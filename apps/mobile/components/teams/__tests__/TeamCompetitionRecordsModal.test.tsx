/**
 * TeamCompetitionRecordsModal コンポーネント テスト (新規実装, Sprint Contract D-4)
 *
 * 検証観点 (Verification Checklist):
 * [V-12] competition_id で絞り込んだクエリを発行している (`eq` の呼び出し引数自体を assert する。
 *        クエリ引数を捨てるモックはスコープを検証不能にするため、eqCalls として記録する)
 * [V-14] 記録0件でもモーダルが開き、空状態が表示される
 * [V-15] 取得失敗時にエラー状態が表示される (competitions/records いずれの失敗でも)
 * [loading] クエリ解決前はローディング表示になる
 *
 * 種目別グルーピング・個人/リレー独立採番の正しさ (rank の値そのもの) は
 * `apps/mobile/utils/__tests__/teamCompetitionRecords.test.ts` (純関数テスト) で
 * 厳密に検証済みのため、本ファイルでは「グルーピング結果が実際に画面に流れて
 * 表示されるか」という配線レベルの smoke test のみ行う (二重にトートロジー的な
 * ランク計算を検証しない)。
 *
 * トートロジー防止: モックの制約をプロダクションのクエリ形状 (select→eq→order /
 * select→eq→single という実際の Supabase チェーン順序) に合わせているだけであり、
 * テスト側で任意に発明した順序ではない。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

interface QueryResponse<T> {
  data: T;
  error: { message: string } | null;
}

interface ChainableBuilder<T> {
  select: (cols: string) => ChainableBuilder<T>;
  eq: (column: string, value: unknown) => ChainableBuilder<T>;
  order: (column: string, opts: { ascending: boolean }) => ChainableBuilder<T>;
  single: () => Promise<QueryResponse<T>>;
  then: <TResult1 = QueryResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
}

function makeQueryBuilder<T>(response: QueryResponse<T>) {
  const eqCalls: Array<{ column: string; value: unknown }> = [];
  const orderCalls: Array<{ column: string; opts: { ascending: boolean } }> = [];
  const builder: ChainableBuilder<T> = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push({ column, value });
      return builder;
    }),
    order: vi.fn((column: string, opts: { ascending: boolean }) => {
      orderCalls.push({ column, opts });
      return builder;
    }),
    single: vi.fn(() => Promise.resolve(response)),
    then: (onfulfilled, onrejected) => Promise.resolve(response).then(onfulfilled, onrejected),
  };
  return { builder, eqCalls, orderCalls };
}

function makeSupabaseMock(options: {
  competition: Record<string, unknown> | null;
  records: Array<Record<string, unknown>>;
  competitionError?: { message: string } | null;
  recordsError?: { message: string } | null;
}) {
  const { competition, records, competitionError = null, recordsError = null } = options;
  const compBuilder = makeQueryBuilder({ data: competition, error: competitionError });
  const recordsBuilder = makeQueryBuilder({ data: records, error: recordsError });
  const fromCalls: string[] = [];

  const from = vi.fn((table: string) => {
    fromCalls.push(table);
    if (table === "competitions") return compBuilder.builder;
    if (table === "records") return recordsBuilder.builder;
    throw new Error(`makeSupabaseMock: 未対応テーブル ${table}`);
  });

  return {
    supabase: { from } as unknown as Record<string, unknown>,
    fromCalls,
    compEqCalls: compBuilder.eqCalls,
    recordsEqCalls: recordsBuilder.eqCalls,
    recordsOrderCalls: recordsBuilder.orderCalls,
  };
}

const mocks = vi.hoisted(() => ({
  supabase: {} as Record<string, unknown>,
  lapTimeDisplaySpy: vi.fn(),
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase })),
}));

// LapTimeDisplay は既存実装の全描画対象外 (QA 事前情報: 重いコンポーネントの深い描画は
// 避ける方針)。props の受け渡しだけを検証できるようスタブ化する。
vi.mock("@/components/records/LapTimeDisplay", () => ({
  LapTimeDisplay: (props: Record<string, unknown>) => {
    mocks.lapTimeDisplaySpy(props);
    return React.createElement("div", { "data-testid": "lap-time-display" });
  },
}));

import { TeamCompetitionRecordsModal } from "../TeamCompetitionRecordsModal";

function baseCompetitionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "comp-1",
    title: "テスト大会",
    date: "2026-09-01",
    place: null,
    pool_type: 0,
    note: null,
    ...overrides,
  };
}

describe("TeamCompetitionRecordsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("[V-12] competition_id で絞り込んだクエリを発行する (クエリ引数自体を検証)", () => {
    it("competitions は eq('id', competitionId) + single()、records は eq('competition_id', competitionId) + order('time', {ascending:true}) で取得する", async () => {
      const { supabase, fromCalls, compEqCalls, recordsEqCalls, recordsOrderCalls } =
        makeSupabaseMock({
          competition: baseCompetitionRow({ id: "comp-scope-1" }),
          records: [],
        });
      mocks.supabase = supabase;

      render(
        <TeamCompetitionRecordsModal
          visible
          onClose={vi.fn()}
          competitionId="comp-scope-1"
          competitionTitle="スコープ大会"
        />,
      );

      await waitFor(() => expect(fromCalls).toContain("records"));

      expect(fromCalls).toContain("competitions");
      expect(compEqCalls).toEqual([{ column: "id", value: "comp-scope-1" }]);
      expect(recordsEqCalls).toEqual([{ column: "competition_id", value: "comp-scope-1" }]);
      expect(recordsOrderCalls).toEqual([{ column: "time", opts: { ascending: true } }]);
    });

    it("competitionId が変わればクエリの eq 引数も追随する (固定値をハードコードしていないことの確認)", async () => {
      const { supabase, compEqCalls, recordsEqCalls } = makeSupabaseMock({
        competition: baseCompetitionRow({ id: "comp-scope-2" }),
        records: [],
      });
      mocks.supabase = supabase;

      render(
        <TeamCompetitionRecordsModal
          visible
          onClose={vi.fn()}
          competitionId="comp-scope-2"
          competitionTitle="スコープ大会2"
        />,
      );

      await waitFor(() => expect(compEqCalls.length).toBeGreaterThan(0));
      expect(compEqCalls[0].value).toBe("comp-scope-2");
      expect(recordsEqCalls[0].value).toBe("comp-scope-2");
    });
  });

  describe("[loading] クエリ解決前はローディング表示になる", () => {
    it("render 直後 (Promise 解決前) は読み込み中メッセージが表示される", () => {
      const { supabase } = makeSupabaseMock({ competition: baseCompetitionRow(), records: [] });
      mocks.supabase = supabase;

      render(
        <TeamCompetitionRecordsModal
          visible
          onClose={vi.fn()}
          competitionId="comp-loading"
          competitionTitle="ローディング大会"
        />,
      );

      // ja.json: teams.competitionRecordsModal.loading = "読み込み中..."
      expect(screen.getByText("読み込み中...")).toBeDefined();
    });
  });

  describe("[V-14] 記録0件でもモーダルが開き、空状態が表示される", () => {
    it("records が空配列でもエラーにならず、空状態メッセージが表示される", async () => {
      const { supabase } = makeSupabaseMock({ competition: baseCompetitionRow(), records: [] });
      mocks.supabase = supabase;

      render(
        <TeamCompetitionRecordsModal
          visible
          onClose={vi.fn()}
          competitionId="comp-empty"
          competitionTitle="空大会"
        />,
      );

      // ja.json: teams.competitionRecordsModal.empty = "記録がまだ登録されていません"
      await screen.findByText("記録がまだ登録されていません");
    });
  });

  describe("[V-15] 取得失敗時にエラー状態が表示される", () => {
    it("records クエリがエラーを返すとエラーメッセージが表示される", async () => {
      const { supabase } = makeSupabaseMock({
        competition: baseCompetitionRow(),
        records: [],
        recordsError: { message: "network error" },
      });
      mocks.supabase = supabase;

      render(
        <TeamCompetitionRecordsModal
          visible
          onClose={vi.fn()}
          competitionId="comp-err"
          competitionTitle="エラー大会"
        />,
      );

      // ja.json: teams.competitionRecordsModal.loadError = "大会記録の取得に失敗しました"
      await screen.findByText("大会記録の取得に失敗しました");
      // ローディング表示とは排他 (両方同時に出ていないこと)
      expect(screen.queryByText("読み込み中...")).toBeNull();
    });

    it("competitions クエリがエラーを返してもエラー状態が表示される", async () => {
      const { supabase } = makeSupabaseMock({
        competition: null,
        records: [],
        competitionError: { message: "not found" },
      });
      mocks.supabase = supabase;

      render(
        <TeamCompetitionRecordsModal
          visible
          onClose={vi.fn()}
          competitionId="comp-err2"
          competitionTitle="エラー大会2"
        />,
      );

      await screen.findByText("大会記録の取得に失敗しました");
    });
  });

  describe("[V-13 配線確認] グルーピング結果が実際に画面へ表示される (rank 計算自体は純関数テストで検証済み)", () => {
    it("種目見出し・個人記録・リレー見出しが表示され、記録の名前が画面に出る", async () => {
      const STYLE = { id: 20, name_jp: "自由形", name: "Fr", style: "fr", distance: 50 };
      const records = [
        {
          id: "r-ind-1",
          user_id: "u-1",
          style_id: STYLE.id,
          time: 30.11,
          reaction_time: null,
          is_relaying: false,
          note: null,
          users: { name: "田中一郎" },
          styles: STYLE,
          split_times: [],
        },
        {
          id: "r-relay-1",
          user_id: "u-2",
          style_id: STYLE.id,
          time: 40.33,
          reaction_time: null,
          is_relaying: true,
          note: null,
          users: { name: "鈴木花子" },
          styles: STYLE,
          split_times: [],
        },
      ];
      const { supabase } = makeSupabaseMock({
        competition: baseCompetitionRow({ place: "○○プール" }),
        records,
      });
      mocks.supabase = supabase;

      render(
        <TeamCompetitionRecordsModal
          visible
          onClose={vi.fn()}
          competitionId="comp-wire"
          competitionTitle="配線確認大会"
        />,
      );

      await screen.findByText("田中一郎");
      expect(screen.getByText("自由形")).toBeDefined();
      expect(screen.getByText("鈴木花子")).toBeDefined();
      // ja.json: teams.competitionRecordsModal.relay = "リレー"
      expect(screen.getByText("リレー")).toBeDefined();
      expect(screen.getByText("○○プール")).toBeDefined();
    });

    it("スプリットがある記録は折り畳みトグルを経由して LapTimeDisplay に distance 昇順の splitTimes が渡る", async () => {
      const STYLE = { id: 21, name_jp: "平泳ぎ", name: "Br", style: "br", distance: 100 };
      const records = [
        {
          id: "r-split",
          user_id: "u-1",
          style_id: STYLE.id,
          time: 70.0,
          reaction_time: null,
          is_relaying: false,
          note: null,
          users: { name: "山田次郎" },
          styles: STYLE,
          split_times: [
            { id: "sp-2", distance: 50, split_time: 33 },
            { id: "sp-1", distance: 25, split_time: 15 },
          ],
        },
      ];
      const { supabase } = makeSupabaseMock({ competition: baseCompetitionRow(), records });
      mocks.supabase = supabase;

      render(
        <TeamCompetitionRecordsModal
          visible
          onClose={vi.fn()}
          competitionId="comp-split"
          competitionTitle="スプリット確認大会"
        />,
      );

      await screen.findByText("山田次郎");
      // 折り畳みトグル (ja.json: splitTimesLabel = "スプリットタイム ({count})")
      const toggle = screen.getByText("スプリットタイム (3)");
      expect(mocks.lapTimeDisplaySpy).not.toHaveBeenCalled();

      const { fireEvent } = await import("@testing-library/react");
      fireEvent.click(toggle.closest("button") as HTMLButtonElement);

      expect(mocks.lapTimeDisplaySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          raceDistance: 100,
          splitTimes: [
            { distance: 25, splitTime: 15 },
            { distance: 50, splitTime: 33 },
            { distance: 100, splitTime: 70.0 },
          ],
        }),
      );
    });
  });
});
