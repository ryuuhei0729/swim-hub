// =============================================================================
// リレー記録の書き込み経路は `competition_id` を必須にする
//   ([V-P2-70] / [V-P2-71] — 第2弾 年度別ランキングの注意書き出し分けの根拠)
//
// 対象: apps/shared/api/teams/relayRecords.ts
//
// ## なぜこれが年度別ランキングの観点なのか
//
// 年度を選ぶと `competitions.date` が NULL の記録 (= 大会に紐づかない記録) は
// 両 RPC から落ちる。個人種目ではこれが実際に起きるので UI が
// `teams.ranking.period.fiscalYearNote` で説明する。
//
// **リレーでは起きない。** `relay_records.competition_id` は列としては nullable
// だが、**アプリからその行を作る経路が無い**。だから注意書きを出すと
// 「リレーに一括登録などない」のに警告を読ませることになる (PM 裁定 2026-09-09)。
//
// ## 🚨 担保の役割分担 — どちらも必要で、代わりにならない
//
//   1. **型 pin (下の `_competitionIdIsRequired`) = 主たる担保**
//      `RelayRecordReplaceScope.competitionId` が `string | null` になったら
//      **`tsc --noEmit` が落ちる**。最も起こりやすい退行 (既存の insert 経路が
//      nullable に緩む) をコンパイル時に塞ぐ。復活条件が型と1対1で対応する。
//
//   2. **`apps/shared/types/relayRecord.ts` の `competitionId` docstring
//      = 新しい経路を作る人が読む場所**
//      型 pin が捕まえられないのは「`RelayRecordReplaceScope` を経由しない
//      **まったく新しい API モジュール**が `competition_id = NULL` で insert する」
//      ケース。その穴への道案内は docstring しかない。
//
//   ⚠️ **「型 pin があるから docstring は不要」と判断しないこと。**
//      逆に「docstring があるから型 pin は不要」でもない。塞いでいる穴が違う。
//
// ## 🚨 リレーの注意書きを有効に戻す条件
//
//   - `RelayRecordReplaceScope.competitionId` が `string | null` になる
//     → 下の型 pin が赤くなる
//   - 大会に紐づかないリレー記録の入力 UI / API が新設される
//     → 型 pin は赤くならない。**`relayRecord.ts` の docstring を読んだ人が
//        気づく必要がある**
//
// ## 参照
//   - `supabase/tests/14_fiscal_year_boundary.test.sql` のスコープ解説ブロック
//     (RPC 側の事実と、撤回した「非対称は誤り」という前提の記録)
//   - `V-DB-89b` … 合成した `competition_id = NULL` のリレー行が年度指定で落ちること
//     (RPC 側の防御。アプリ経路では作れない状態なので UI 要件ではない)
// =============================================================================

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TeamRelayRecordsAPI, type RelayRecordReplaceScope } from "../../api/teams/relayRecords";
import type { RelaySavePlan } from "../../utils/relayRecordSave";

// -----------------------------------------------------------------------------
// [V-P2-70] 型 pin (主たる担保)
//
// `competitionId` が `string | null` に緩むと **この代入で tsc が落ちる**。
// ⚠️ `expectTypeOf` は使わない — このリポジトリの vitest は `typecheck` を
//    有効にしていないので `expectTypeOf` の assert は**実行時に無音で通る**
//    (= 何も担保しない)。素の代入なら `tsc --noEmit` が必ず見る。
// -----------------------------------------------------------------------------
const SCOPE: RelayRecordReplaceScope = {
  teamId: "team-kingfisher",
  competitionId: "comp-kingfisher-spring",
  poolType: 1,
  // 【修正ラウンド 2026-09-17】旧 `relayEventId?` を廃止し、画面が読み込んだ
  // `relay_records.id` の明示集合に置換 (Critical #1)。DB 列条件による絞り込みは
  // 一切行わない設計なので、この pin テストも id ベースの scope で組み立てる。
  relayRecordIds: ["rr-existing-1", "rr-existing-2"],
};

// 型注釈が付いた実体から取り出す。
// `RelayRecordReplaceScope.competitionId` が `string | null` になると
// この代入が `Type 'string | null' is not assignable to type 'string'` で落ちる。
//
// ⚠️ `({} as RelayRecordReplaceScope).competitionId` にしてはいけない。
//    型は同じだが**実行時の値が undefined** になるので、下のセンチネルが
//    `typeof` で見たときに 'undefined' になり意味を失う (QA が実際に踏んだ)。
const _competitionIdIsRequired: string = SCOPE.competitionId;

/** 型 pin の行が消されたら落ちるようにするための実行時センチネル */
const TYPE_PIN_SENTINEL = typeof _competitionIdIsRequired;

const PLAN: RelaySavePlan = {
  relayEventId: "relay_4x100_free",
  totalTime: 214.55,
  legCount: 4,
  genderCategory: "male",
  legs: [
    {
      legIndex: 0,
      userId: "usr-1",
      styleId: 3,
      legTime: 53.1,
      reactionTime: null,
      // `records` の insert 結果と突き合わせるための添字。shared は意味を解釈しない
      validRecordIndex: 0,
    },
    {
      legIndex: 1,
      userId: "usr-2",
      styleId: 3,
      legTime: 53.5,
      reactionTime: null,
      // `records` の insert 結果と突き合わせるための添字。shared は意味を解釈しない
      validRecordIndex: 1,
    },
    {
      legIndex: 2,
      userId: "usr-3",
      styleId: 3,
      legTime: 53.9,
      reactionTime: null,
      // `records` の insert 結果と突き合わせるための添字。shared は意味を解釈しない
      validRecordIndex: 2,
    },
    {
      legIndex: 3,
      userId: "usr-4",
      styleId: 3,
      legTime: 54.05,
      reactionTime: null,
      // `records` の insert 結果と突き合わせるための添字。shared は意味を解釈しない
      validRecordIndex: 3,
    },
  ],
};

interface InsertCall {
  table: string;
  row: Record<string, unknown>;
}

/**
 * `relay_records` への insert 行を記録する fake。
 *
 * ⚠️ `.eq()` の列名と値も捨てずに記録する。捨てると「どのスコープで既存行を
 *    消したか」を検証できない (モックが引数を捨ててサーバー絞り込みと
 *    クライアント filter を区別できなくなった前科がある)。
 */
function makeSupabase() {
  const insertCalls: InsertCall[] = [];
  const eqCalls: Array<{ table: string; column: string; value: unknown }> = [];
  const inCalls: Array<{ table: string; column: string; values: unknown[] }> = [];

  const client = {
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn((column: string, value: unknown) => {
        eqCalls.push({ table, column, value });
        return builder;
      });
      builder.in = vi.fn((column: string, values: unknown[]) => {
        inCalls.push({ table, column, values: [...values] });
        return builder;
      });
      builder.delete = vi.fn(() => builder);
      builder.insert = vi.fn((row: Record<string, unknown> | Record<string, unknown>[]) => {
        for (const one of Array.isArray(row) ? row : [row]) {
          insertCalls.push({ table, row: one });
        }
        return builder;
      });
      builder.single = vi.fn(async () => ({ data: { id: "rr-new" }, error: null }));
      builder.then = (
        onfulfilled?: ((value: { data: unknown; error: unknown }) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null,
      ) => Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
      return builder;
    }),
  };

  return { insertCalls, eqCalls, inCalls, client: client as unknown as SupabaseClient };
}

describe("[V-P2-70] リレー記録の書き込みは competition_id を必須にする", () => {
  it("型 pin の行が存在する (消されていない)", () => {
    // 型 pin 自体は tsc が見るものなので、ここでは存在確認だけ行う
    expect(TYPE_PIN_SENTINEL).toBe("string");
  });

  it("🚨 insert される relay_records 行の competition_id が scope の値である", async () => {
    const fake = makeSupabase();
    const api = new TeamRelayRecordsAPI(fake.client);

    await api.replace(SCOPE, [PLAN], [null, null, null, null]);

    const relayRows = fake.insertCalls.filter((call) => call.table === "relay_records");
    expect(relayRows).toHaveLength(1);
    // 🚨 null でも undefined でもなく scope の値そのもの
    expect(relayRows[0]?.row.competition_id).toBe("comp-kingfisher-spring");
    expect(relayRows[0]?.row.competition_id).not.toBeNull();
  });

  it("🚨 insert 行に competition_id が「無い」状態を作らない (列の写し忘れ検出)", async () => {
    // 列名の写像を落とすと DB 側の DEFAULT (= NULL) が入り、
    // **アプリ経路で作れないはずの行が生まれる**。キーの存在を明示的に見る
    const fake = makeSupabase();
    const api = new TeamRelayRecordsAPI(fake.client);

    await api.replace(SCOPE, [PLAN], [null, null, null, null]);

    const row = fake.insertCalls.find((call) => call.table === "relay_records")?.row ?? {};
    expect(Object.keys(row)).toContain("competition_id");
    // team_id と対で見る (片方だけ落ちる退行も検出する)
    expect(Object.keys(row)).toContain("team_id");
    expect(row.team_id).toBe("team-kingfisher");
  });

  // 【修正ラウンド 2026-09-17】以前は「差し替え前の取得を team_id/competition_id で
  // 絞り込んでいること」を検証していたが、これは旧 replace() の内部 SELECT を前提に
  // したアサーションであり、新設計では replace() は内部 SELECT を行わない
  // (呼び出し元が読み込んだ relayRecordIds をそのまま staleIds として使うだけ)。
  // 「サーバー側で絞り込んでいること」を検証する意図そのものは維持し、検証対象を
  // 「DB 列条件による絞り込み」から「呼び出し元が渡した明示的な id 集合による絞り込み」
  // へ移す (他の大会・他チームのリレーを巻き込まない、という意図は同じ)。
  it("既存行の削除は scope.relayRecordIds に渡された id だけを対象にする (DB 列条件で絞り込み直さない)", async () => {
    const fake = makeSupabase();
    const api = new TeamRelayRecordsAPI(fake.client);

    await api.replace(SCOPE, [PLAN], [null, null, null, null]);

    // team_id / competition_id による絞り込み delete は発生しない (列条件に逆戻りしていない)
    const eqScopedDelete = fake.eqCalls.filter(
      (call) => call.table === "relay_records" && (call.column === "team_id" || call.column === "competition_id"),
    );
    expect(eqScopedDelete).toHaveLength(0);

    // 代わりに scope.relayRecordIds そのものが .in("id", ...) の対象になる
    const idScopedDelete = fake.inCalls.filter(
      (call) => call.table === "relay_records" && call.column === "id",
    );
    expect(idScopedDelete).toEqual([
      { table: "relay_records", column: "id", values: ["rr-existing-1", "rr-existing-2"] },
    ]);
  });
});
