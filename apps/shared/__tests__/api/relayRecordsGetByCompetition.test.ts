/**
 * TeamRelayRecordsAPI.getByCompetition — Sprint Contract D3 境界契約テスト
 *
 * 対象: apps/shared/api/teams/relayRecords.ts (既存ファイルに追加される静的メソッド)
 * 契約シグネチャ (SPRINT_CONTRACT.md「D3 の境界契約」より一字一句):
 *   static async getByCompetition(
 *     supabase: SupabaseClient,
 *     competitionId: string,
 *   ): Promise<RelayRecordWithLegs[]>
 *
 * 検証観点:
 *   [V-D3-1] competitionId で絞り込んだクエリを発行する (`relay_records` への
 *            `.eq("competition_id", competitionId)` 呼び出し引数を実測する)
 *   [V-D3-2] legs は legIndex 昇順で返る (呼び出し元がソートし直さなくてよい —
 *            DB/Supabase の embedded resource 順序は保証されないため、
 *            わざと legIndex を乱した生データを与えて検証する)
 *   [V-D3-3] legs の各要素に userName / profileImagePath / styleNameJp / styleDistance が
 *            解決済みで載る
 *   [V-D3-4] user_id が null (退会) のレグは userName/profileImagePath が null になり
 *            例外を投げない
 *   [V-D3-5] 通算タイム (cumulative time) に相当するフィールドを一切含まない
 *            (`calcCumulativeTimes` で表示側が導出する契約。返り値に紛れ込んでいないか
 *            構造ごと厳密一致で検証する)
 *
 * 【この設計の前提について】
 * 実装がまだ存在しないため、内部で発行される Supabase クエリの正確な形
 * (1クエリの nested select か、複数クエリの組み合わせか) は契約に明記されていない。
 * このテストは、このコードベースの既存パターン (TeamCompetitionRecordsModal の
 * records 取得が nested select で users/styles を1回で解決している) に倣い、
 * `relay_records` への1回の nested select
 * (`relay_record_legs(..., users(...), styles(...))`) を前提にモックを組む。
 * 実装がこの前提と異なる場合 (例: 複数クエリに分割する設計)、Phase B で
 * モックの `from()` ルーティングを実装に合わせて更新すること
 * (このファイルのモックは表向きの入出力契約を検証するためのものであり、
 * クエリ本数そのものを Sprint Contract の合否基準にはしない)。
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TeamRelayRecordsAPI } from "../../api/teams/relayRecords";

interface ChainableBuilder {
  select: (cols: string) => ChainableBuilder;
  eq: (column: string, value: unknown) => ChainableBuilder;
  order: (column: string, opts?: Record<string, unknown>) => ChainableBuilder;
  then: <TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
}

function makeQueryBuilder(response: { data: unknown; error: unknown }) {
  const eqCalls: Array<{ column: string; value: unknown }> = [];
  const builder: ChainableBuilder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push({ column, value });
      return builder;
    }),
    order: vi.fn(() => builder),
    then: (onfulfilled, onrejected) => Promise.resolve(response).then(onfulfilled, onrejected),
  };
  return { builder, eqCalls };
}

/** `relay_records` への nested select が返す想定の生レスポンス (snake_case, embedded resource) */
function rawRelayRecordRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "relay-1",
    team_id: "team-1",
    competition_id: "comp-1",
    relay_kind: "free",
    leg_distance: 50,
    leg_count: 4,
    pool_type: 0,
    gender_category: "mixed",
    total_time: 120.5,
    created_at: "2026-09-01T00:00:00.000Z",
    relay_record_legs: [
      {
        id: "leg-3",
        leg_index: 3,
        user_id: "member-e",
        style_id: 30,
        leg_time: 29.0,
        reaction_time: null,
        record_id: "rec-leg3",
        users: { name: "泳者E", profile_image_path: "path/e.png" },
        styles: { name_jp: "自由形", distance: 50 },
      },
      {
        id: "leg-0",
        leg_index: 0,
        user_id: "member-b",
        style_id: 30,
        leg_time: 28.5,
        reaction_time: 0.65,
        record_id: "rec-leg0",
        users: { name: "泳者B", profile_image_path: null },
        styles: { name_jp: "自由形", distance: 50 },
      },
      {
        id: "leg-2",
        leg_index: 2,
        // 退会 / RLS 0件: user が解決できない
        user_id: null,
        style_id: 30,
        leg_time: 31.5,
        reaction_time: null,
        record_id: null,
        users: null,
        styles: { name_jp: "自由形", distance: 50 },
      },
      {
        id: "leg-1",
        leg_index: 1,
        user_id: "member-d",
        style_id: 30,
        leg_time: 31.0,
        reaction_time: null,
        record_id: "rec-leg1",
        users: { name: "泳者D", profile_image_path: null },
        styles: { name_jp: "自由形", distance: 50 },
      },
    ],
    ...overrides,
  };
}

describe("TeamRelayRecordsAPI.getByCompetition", () => {
  it("[V-D3-1] relay_records を competition_id で絞り込む (eq の実引数を検証)", async () => {
    const { builder, eqCalls } = makeQueryBuilder({ data: [rawRelayRecordRow()], error: null });
    const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient;

    await TeamRelayRecordsAPI.getByCompetition(supabase, "comp-scope-1");

    expect(supabase.from).toHaveBeenCalledWith("relay_records");
    expect(eqCalls).toContainEqual({ column: "competition_id", value: "comp-scope-1" });
  });

  it("[V-D3-2] legs は legIndex 昇順で返る (生データの順序が乱れていても並べ直す)", async () => {
    const { builder } = makeQueryBuilder({ data: [rawRelayRecordRow()], error: null });
    const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient;

    const result = await TeamRelayRecordsAPI.getByCompetition(supabase, "comp-1");

    expect(result).toHaveLength(1);
    expect(result[0]!.legs.map((leg) => leg.legIndex)).toEqual([0, 1, 2, 3]);
  });

  it("[V-D3-3] legs の各要素に userName / profileImagePath / styleNameJp / styleDistance が解決済みで載る", async () => {
    const { builder } = makeQueryBuilder({ data: [rawRelayRecordRow()], error: null });
    const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient;

    const result = await TeamRelayRecordsAPI.getByCompetition(supabase, "comp-1");
    const leg0 = result[0]!.legs.find((leg) => leg.legIndex === 0);

    expect(leg0).toMatchObject({
      userId: "member-b",
      userName: "泳者B",
      profileImagePath: null,
      styleNameJp: "自由形",
      styleDistance: 50,
      recordId: "rec-leg0",
    });
  });

  it("[V-D3-4] user_id が null (退会/RLS 0件) のレグは userName/profileImagePath が null になり例外を投げない", async () => {
    const { builder } = makeQueryBuilder({ data: [rawRelayRecordRow()], error: null });
    const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient;

    const result = await TeamRelayRecordsAPI.getByCompetition(supabase, "comp-1");
    const leg2 = result[0]!.legs.find((leg) => leg.legIndex === 2);

    expect(leg2).toMatchObject({
      userId: null,
      userName: null,
      profileImagePath: null,
      recordId: null,
    });
  });

  it("[V-D3-5] 通算タイムに相当するフィールドを含まない (leg オブジェクトの構造を厳密一致で検証)", async () => {
    const { builder } = makeQueryBuilder({ data: [rawRelayRecordRow()], error: null });
    const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient;

    const result = await TeamRelayRecordsAPI.getByCompetition(supabase, "comp-1");
    const leg0 = result[0]!.legs.find((leg) => leg.legIndex === 0);

    // 契約 (types/relayRecord.ts) が定義するフィールドのみを持つこと。
    // "cumulativeTime" 等の余剰フィールドが紛れ込んでいたらこの厳密一致が落ちる。
    expect(leg0).toEqual({
      id: "leg-0",
      legIndex: 0,
      userId: "member-b",
      styleId: 30,
      legTime: 28.5,
      reactionTime: 0.65,
      recordId: "rec-leg0",
      userName: "泳者B",
      profileImagePath: null,
      styleNameJp: "自由形",
      styleDistance: 50,
    });
  });

  it("competitionId に一致する relay_records が0件のときは空配列を返す", async () => {
    const { builder } = makeQueryBuilder({ data: [], error: null });
    const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient;

    const result = await TeamRelayRecordsAPI.getByCompetition(supabase, "comp-empty");

    expect(result).toEqual([]);
  });

  it("同一大会・同一種目に2チーム登録されていても relay_records の行単位で自然に分離される", async () => {
    const rowA = rawRelayRecordRow({ id: "relay-team-a", team_id: "team-a", total_time: 120.5 });
    const rowB = rawRelayRecordRow({ id: "relay-team-b", team_id: "team-b", total_time: 118.2 });
    const { builder } = makeQueryBuilder({ data: [rowA, rowB], error: null });
    const supabase = { from: vi.fn(() => builder) } as unknown as SupabaseClient;

    const result = await TeamRelayRecordsAPI.getByCompetition(supabase, "comp-1");

    expect(result.map((r) => r.id)).toEqual(["relay-team-a", "relay-team-b"]);
    expect(result.map((r) => r.teamId)).toEqual(["team-a", "team-b"]);
  });
});
