/**
 * styles.style ケーシング移行 (GitHub Issue #13) の安全性検証
 *
 * PM 実測 (2026-09-01): 移行時に「静かに0件を返すクエリ」が存在すると指摘された箇所:
 *   - apps/shared/api/goals.ts (checkTimeAchievement / hasTimeRecords) の
 *     `.eq("styles.style", params.style.toLowerCase())`
 *   - apps/shared/api/styles.ts (getStylesByStroke) の `.eq("style", stroke)`
 *
 * 実測更新: Developer は既に `.eq` → `.ilike` (大文字小文字非依存の完全一致) + 変換なし
 * (`.toLowerCase()` 削除) に修正済み。
 *
 * Reviewer 裁定 (2026-09-02): `.ilike` は**恒久的な設計ではなく、コード先行→migration適用
 * というデプロイ順序が守られる保証がない期間のための暫定措置**である (各ファイルの
 * コメントを Developer が同旨に訂正済み)。`.ilike` が救えるのは「新コード(ilike)×旧DB
 * (小文字)」の窓のみで、逆方向 (「旧コード(.eq+toLowerCase)×新DB(タイトルケース)」) は
 * 救えない。旧コードが本番から完全に退役したことが確認できれば、`.eq` に戻して
 * インデックス効率を回復する変更は正当であり、このテストが理由でブロックしてはならない。
 *
 * このテストの役割は「まだ壊れているものを検出する」ではなく、
 * **「デプロイ順序の安全が確認されるまでの間に `.ilike` が `.eq` へ意図せず戻された」
 * ことを検知する暫定ガード**である。恒久的な仕様として `.eq` への変更自体を禁止する
 * ものではない (`.eq` に戻す際は、このテストを更新・削除するのが正しい対応であり、
 * このテストの存在を理由に差し戻すべきではない)。
 *
 * モック方針 (過去の教訓を反映):
 *   Supabase クライアントのモックは `eq`/`ilike` の呼び出し引数を捨てずに記録する。
 *   「結果が返ってきたか」ではなく「どのメソッドで・どのケーシングの値で絞り込んだか」
 *   を assert する (feedback_swimhub_test_mock_discards_query_args.md の教訓)。
 *
 * private メソッドへのアクセスについて:
 *   `checkTimeAchievement` / `hasTimeRecords` は GoalAPI の private メソッドだが、
 *   `checkMilestoneAchievement` (type=time) / `hasRecordsForMilestone` (type=time) の
 *   薄いディスパッチ経由で到達できる。今回は目的の絞り込みクエリの引数検証に
 *   焦点を絞るため、両エントリポイントを直接呼び出す(TS の private はコンパイル時のみの
 *   制約でありランタイムでは呼び出し可能。実装を再実装せず本物の関数を呼んでいる)。
 */
import { describe, expect, it } from "vitest";
import { GoalAPI } from "../../api/goals";
import { StyleAPI } from "../../api/styles";
import type { Milestone, MilestoneTimeParams } from "../../types/goals";

interface RecordedCall {
  method: "eq" | "ilike";
  column: string;
  value: unknown;
}

/**
 * eq/ilike の呼び出し引数を記録しつつチェーン可能なクエリビルダーのモック。
 * 終端は thenable にして `await` 時に `finalResult` に解決する。
 */
function createRecordingQueryBuilder(
  calls: RecordedCall[],
  finalResult: { data: unknown; error: unknown },
) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    lte: () => builder,
    gte: () => builder,
    eq: (column: string, value: unknown) => {
      calls.push({ method: "eq", column, value });
      return builder;
    },
    ilike: (column: string, value: unknown) => {
      calls.push({ method: "ilike", column, value });
      return builder;
    },
    then: (
      onfulfilled?: ((v: { data: unknown; error: unknown }) => unknown) | null,
      onrejected?: ((e: unknown) => unknown) | null,
    ) => Promise.resolve(finalResult).then(onfulfilled, onrejected),
  };
  return builder;
}

function makeMilestone(overrides: Partial<MilestoneTimeParams> = {}): Milestone {
  return {
    id: "milestone-1",
    goal_id: "goal-1",
    title: "テストマイルストーン",
    type: "time",
    params: {
      distance: 100,
      target_time: 60,
      style: "Fr",
      swim_category: "Swim" as const,
      ...overrides,
    },
    deadline: null,
    status: "not_started",
    achieved_at: null,
    reflection_done: false,
    reflection_note: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
  } as Milestone;
}

describe("GoalAPI — styles.style 絞り込みの ilike 固定 (回帰ガード)", () => {
  it("[V-MIG-01] checkTimeAchievement は styles.style を eq でなく ilike で、値を変換せずに絞り込む", async () => {
    const calls: RecordedCall[] = [];
    const mockClient = {
      from: (table: string) => {
        if (table === "practice_logs") {
          // practice_logs に該当なし → records フォールバックへ進ませる
          return createRecordingQueryBuilder(calls, { data: [], error: null });
        }
        if (table === "records") {
          return createRecordingQueryBuilder(calls, { data: [], error: null });
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const api = new GoalAPI(mockClient as unknown as ConstructorParameters<typeof GoalAPI>[0]);
    const milestone = makeMilestone({ style: "Fr" });

    // private メソッドを直接呼ぶ (本物の実装。実装の再実装ではない)
    await (
      api as unknown as {
        checkTimeAchievement: (
          m: Milestone,
          userId: string,
        ) => Promise<{ achieved: boolean }>;
      }
    ).checkTimeAchievement(milestone, "user-1");

    const styleStyleCalls = calls.filter((c) => c.column === "styles.style");
    expect(styleStyleCalls, "styles.style への絞り込みが1回も呼ばれていない").toHaveLength(1);
    expect(
      styleStyleCalls[0]?.method,
      "styles.style は eq でなく ilike で絞り込むこと (デプロイ順序の安全が確認されるまでの暫定ガード)",
    ).toBe("ilike");
    expect(styleStyleCalls[0]?.value, "styles.style の絞り込み値は大文字小文字を変換しないこと").toBe(
      "Fr",
    );

    // eq で styles.style が呼ばれていないことも明示的に確認 (逆方向の回帰検知)
    const eqOnStyleStyle = calls.filter((c) => c.method === "eq" && c.column === "styles.style");
    expect(eqOnStyleStyle).toHaveLength(0);
  });

  it("[V-MIG-02] hasTimeRecords (レコード存在確認) も styles.style を ilike・値そのままで絞り込む", async () => {
    const calls: RecordedCall[] = [];
    const mockClient = {
      from: (table: string) => {
        if (table === "practice_logs") {
          return createRecordingQueryBuilder(calls, { data: [], error: null });
        }
        if (table === "records") {
          return createRecordingQueryBuilder(calls, { data: [], error: null });
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
    const api = new GoalAPI(mockClient as unknown as ConstructorParameters<typeof GoalAPI>[0]);
    const milestone = makeMilestone({ style: "Br" });

    await (
      api as unknown as {
        hasTimeRecords: (userId: string, m: Milestone) => Promise<boolean>;
      }
    ).hasTimeRecords("user-1", milestone);

    const styleStyleCalls = calls.filter((c) => c.column === "styles.style");
    expect(styleStyleCalls).toHaveLength(1);
    expect(styleStyleCalls[0]?.method).toBe("ilike");
    expect(styleStyleCalls[0]?.value).toBe("Br");
  });
});

describe("StyleAPI — getStylesByStroke の ilike 固定 (回帰ガード)", () => {
  it("[V-MIG-03] style 列を eq でなく ilike で、値を変換せずに絞り込む", async () => {
    const calls: RecordedCall[] = [];
    const mockClient = {
      from: () => createRecordingQueryBuilder(calls, { data: [], error: null }),
    };
    const api = new StyleAPI(mockClient as unknown as ConstructorParameters<typeof StyleAPI>[0]);

    await api.getStylesByStroke("Fr");

    const styleCalls = calls.filter((c) => c.column === "style");
    expect(styleCalls).toHaveLength(1);
    expect(styleCalls[0]?.method).toBe("ilike");
    expect(styleCalls[0]?.value).toBe("Fr");
  });
});
