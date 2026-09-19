// =============================================================================
// backfillRelayRecords.contract.test.ts — バックフィルスクリプトの安全弁
//                                          (QA Sprint Contract Phase B / 第3弾)
// =============================================================================
//
// 対象: scripts/backfill-relay-records.ts
//
// ⚠️ このスクリプトは **トップレベルで `main()` を呼ぶ実行ファイル**なので、
//    import すると副作用が走る。よってユニットテストから関数を直接叩けない。
//    「実際にどう動くか」は QA が**ローカル Supabase の実 DB に自分の fixture を
//    作って実行して確認済み** (結果は QA レポートに全出力を記載):
//      - dry-run 既定で relay_records / relay_record_legs に 0 行も書かない
//      - --apply で 1 本作成 (total_time=104.00 / gender_category=mixed /
//        created_by=チーム管理者 / legs 4 件が records.id を指す)
//      - 2 回目の --apply は「既にバックフィル済み」でスキップし件数が増えない (冪等)
//      - is_relaying が 3 行だけ / pool_type 不一致 / style_id の組が未知 の
//        3 パターンは**すべてスキップし推測で作らない**
//      - 環境変数が無いと exit 1 (fail closed)
//      - `-apply` / `--APPLY` / `--apply=true` / `apply` はいずれも dry-run のまま
//
//    このファイルが守るのは「実行しなくても壊れたと分かる不変条件」だけ。
//    ソースを読んで確かめる形になるので、**否定形の assert を厚めに置く**
//    (「書き込みを常時有効にする経路が無いこと」など)。
//
// Sprint Contract 検証観点:
//   [V-BF-01] dry-run が既定である。書き込みは `--apply` の**完全一致**でしか有効化されない
//   [V-BF-02] 環境変数 (URL / SERVICE_ROLE_KEY) が無ければ実行前に落ちる
//   [V-BF-03] 判定述語 (detectRelayEventId / resolveRelayGenderCategory /
//             calcCumulativeTimes) を書き写さず shared から import している
//   [V-BF-04] 判定できないケースは「推測して作る」経路を持たず必ず skip する
//   [V-BF-05] 冪等性の判定が relay_record_legs.record_id で行われている
//   [V-BF-06] 🚨 migration (20260908000000 / 20260908000100) に DML が無い
//             (破壊的 SQL を migration に置いた前科があるため)

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** repo ルート (apps/shared/__tests__/scripts → ../../../..) */
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const SCRIPT_PATH = path.join(REPO_ROOT, "scripts/backfill-relay-records.ts");

const script = readFileSync(SCRIPT_PATH, "utf8");

/** 行コメント (`//` / ` *`) を落としたコード部分。説明文での誤検出を避ける */
const scriptCode = script
  .split("\n")
  .filter((line) => {
    const trimmed = line.trimStart();
    return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
  })
  .join("\n");

describe("[V-BF-01] dry-run が既定で、--apply の完全一致だけが書き込みを有効化する", () => {
  it("`args.includes(\"--apply\")` で判定している (前方一致や大文字小文字無視ではない)", () => {
    expect(scriptCode).toContain('const isApply = args.includes("--apply");');
  });

  it("--apply を前方一致・小文字化・正規表現で拾う経路が無い (否定形)", () => {
    const looseMatchers = [
      /startsWith\(\s*["']--apply/,
      /toLowerCase\(\)[^\n]*apply/i,
      /\/--apply\//,
      /includes\(\s*["']apply["']\s*\)/,
    ].filter((pattern) => pattern.test(scriptCode));

    expect(looseMatchers.map(String), "--apply の判定が緩い").toEqual([]);
  });

  it("環境変数や既定値で書き込みを有効化する経路が無い (否定形)", () => {
    // 例: `const isApply = process.env.BACKFILL_APPLY === "1"` のような裏口
    const backdoors = [
      /isApply\s*=\s*true/,
      /isApply\s*=\s*!/,
      /isApply\s*=\s*process\.env/,
      /isApply\s*\|\|/,
      /isApply\s*\?\?/,
    ].filter((pattern) => pattern.test(scriptCode));

    expect(backdoors.map(String), "書き込みを常時有効にしうる経路がある").toEqual([]);
  });

  it("dry-run のときは insert に到達する前に early continue する", () => {
    // 「dry-run なのに書いた」を防ぐ最後の砦。ここが消えると
    // --apply 無しでも relay_records に行が入る
    expect(scriptCode).toContain("if (!isApply) {");
    // insert より前に置かれていること (順序を実測する)
    const guardIndex = scriptCode.indexOf("if (!isApply) {");
    const firstRelayInsertIndex = scriptCode.indexOf('.from("relay_records")\n        .insert(');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(firstRelayInsertIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(firstRelayInsertIndex);
  });

  it("既定モードの表示に「書き込みません」と「--apply」の両方が出る (操作者が気づける)", () => {
    expect(script).toContain("dry-run (書き込みません");
    expect(script).toContain("--apply を渡してください");
  });
});

describe("[V-BF-02] 環境変数が無ければ実行前に落ちる (fail closed)", () => {
  it("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を必須にしている", () => {
    expect(scriptCode).toContain('"NEXT_PUBLIC_SUPABASE_URL"');
    expect(scriptCode).toContain('"SUPABASE_SERVICE_ROLE_KEY"');
    expect(scriptCode).toContain("process.exit(1)");
  });

  it("環境変数チェックが Supabase クライアント生成より前に呼ばれている", () => {
    const checkIndex = scriptCode.indexOf("checkEnvVars();");
    const clientIndex = scriptCode.indexOf("getSupabaseClient();");

    expect(checkIndex).toBeGreaterThan(-1);
    expect(clientIndex).toBeGreaterThan(-1);
    expect(checkIndex).toBeLessThan(clientIndex);
  });

  it("anon key へフォールバックしない (service_role が無いときに権限を落として続行しない)", () => {
    expect(scriptCode).not.toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });
});

describe("[V-BF-03] 判定述語を shared から import している (書き写していない)", () => {
  const SHARED_IMPORTS = [
    "detectRelayEventId",
    "fromRelayEventId",
    "calcCumulativeTimes",
    "resolveRelayGenderCategory",
  ] as const;

  it.each(SHARED_IMPORTS)("%s を shared から import している", (name) => {
    expect(scriptCode).toContain(name);
  });

  it("import 元が apps/shared/utils の実ファイルである", () => {
    expect(scriptCode).toContain('from "../apps/shared/utils/relayEvents"');
    expect(scriptCode).toContain('from "../apps/shared/utils/relayRecordSave"');
  });

  it("RELAY_EVENTS の対応表 (styleId の組) をスクリプト内に再定義していない (否定形)", () => {
    // 二重管理になると片方だけ更新されて静かに壊れる
    const duplicated = [
      /relay_4x\d+_(free|medley)/, // RelayEventId のリテラルを直書き
      /styleKey\s*:/, // レグ定義の複製
      /\[\s*12\s*,\s*8\s*,\s*16\s*,\s*1\s*\]/, // メドレー 25m の styleId 組
    ].filter((pattern) => pattern.test(scriptCode));

    expect(duplicated.map(String), "リレー種目の対応表を複製している").toEqual([]);
  });

  it("性別区分を `?? 0` で埋めていない (不明を男性に寄せない)", () => {
    // gender の undefined/null を 0 にすると「不明」が「男性」として静かに確定する
    expect(scriptCode).not.toMatch(/gender[^\n]*\?\?\s*0/);
    expect(scriptCode).not.toMatch(/\?\?\s*0[^\n]*gender/);
  });
});

describe("[V-BF-04] 判定できないケースは推測せずスキップする", () => {
  /** スキップ理由の union に含まれるべき語 */
  const SKIP_REASONS = [
    "teamIdMissing",
    "competitionIdMissing",
    "noRelayPattern",
    "unknownStyleCombination",
    "poolTypeMismatch",
    "invalidPoolType",
    "alreadyBackfilled",
    "writeFailed",
  ] as const;

  it.each(SKIP_REASONS)("スキップ理由 %s が定義されている", (reason) => {
    expect(scriptCode).toContain(reason);
  });

  it("SkipReason の全メンバーに表示ラベルが用意されている (集計の抜けを防ぐ)", () => {
    // SKIP_REASON_LABEL は Record<SkipReason, string> なので、union に足して
    // ラベルを足し忘れると tsc が落ちる。ここでは実際に 8 個並んでいることを見る
    const labelBlock = scriptCode.slice(
      scriptCode.indexOf("const SKIP_REASON_LABEL"),
      scriptCode.indexOf("function checkEnvVars"),
    );

    const missing = SKIP_REASONS.filter((reason) => !labelBlock.includes(reason));
    expect(missing, `ラベルが無いスキップ理由: ${missing.join(", ")}`).toEqual([]);
  });

  it("pool_type を正規化する経路が無い (どちらかの水路に静かに寄せない)", () => {
    const normalizers = [
      /pool_type[^\n]*===\s*1\s*\?\s*1\s*:\s*0/,
      /pool_type[^\n]*\?\?\s*0/,
      /Number\(\s*[^)]*pool_type[^)]*\)\s*\?\s*1/,
    ].filter((pattern) => pattern.test(scriptCode));

    expect(normalizers.map(String), "pool_type を正規化している").toEqual([]);
  });

  it("pool_type が 4 レグで食い違う / 0,1 以外のときに continue している", () => {
    expect(scriptCode).toContain('addSkip("poolTypeMismatch")');
    expect(scriptCode).toContain('addSkip("invalidPoolType")');
  });

  it("🚨 created_by を一切送らない (誰か1人の管理者を代表として詰め込まない)", () => {
    // refactor 前は「そのチームの最古の承認済み管理者」を created_by に入れ、
    // 見つからなければスキップしていた。現在は **列を nullable にして NULL を入れる**
    // 方針に変わっている (2026-09-08 実測)。
    // バックフィルした記録は実際には誰も入力していないので NULL が正直であり、
    // 代表を詰め込むとその 1 人の退会で全リレー記録が道連れになる。
    expect(scriptCode).not.toMatch(/created_by\s*:/);
    // 代表者を探す関数も残っていない (死んだコードとして残すと復活しやすい)
    expect(scriptCode).not.toContain("fetchTeamAdminId");
    expect(scriptCode).not.toContain("noTeamAdmin");
  });

  it("created_by が NULL を取れることに依存している (migration が nullable である)", () => {
    // スクリプトが created_by を送らない前提は「列が nullable」でしか成立しない。
    // NOT NULL に戻されるとバックフィルが全件 insert 失敗する
    const migration = readFileSync(
      path.join(REPO_ROOT, "supabase/migrations/20260908000000_add_relay_records.sql"),
      "utf8",
    );
    const createdByLine = migration
      .split("\n")
      .find((line) => line.includes('"created_by"') && line.includes("uuid"));

    expect(createdByLine, "created_by の列定義が見つからない").toBeDefined();
    expect(createdByLine).not.toMatch(/NOT\s+NULL/i);
    expect(createdByLine).toMatch(/DEFAULT\s+"auth"\."uid"\(\)/);
  });

  it("大会に紐づかない (competition_id NULL) 記録は推測対象にしない", () => {
    expect(scriptCode).toContain('addSkip("competitionIdMissing")');
  });

  it("レグの insert に失敗したら親を巻き戻す (レグ無しの親を残さない)", () => {
    const legErrorBlock = scriptCode.slice(scriptCode.indexOf("if (legError) {"));
    expect(legErrorBlock).toContain('.from("relay_records")');
    expect(legErrorBlock).toContain(".delete()");
    expect(legErrorBlock).toContain('.eq("id", newRelay.id)');
  });
});

describe("[V-BF-05] 冪等性の判定", () => {
  it("relay_record_legs.record_id を見て既に作成済みかを判定する", () => {
    expect(scriptCode).toContain('.from("relay_record_legs")');
    expect(scriptCode).toContain('.select("record_id")');
    expect(scriptCode).toContain('addSkip("alreadyBackfilled")');
  });

  it("冪等判定が insert より前に行われている", () => {
    const idempotencyIndex = scriptCode.indexOf("fetchAlreadyLinkedRecordIds(\n        supabase");
    const insertIndex = scriptCode.indexOf('.from("relay_records")\n        .insert(');

    expect(idempotencyIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(-1);
    expect(idempotencyIndex).toBeLessThan(insertIndex);
  });

  it("upsert / onConflict を使っていない (自然キーで別行を壊した前科があるため)", () => {
    expect(scriptCode).not.toContain(".upsert(");
    expect(scriptCode).not.toContain("onConflict");
  });

  it("書き込むレグに record_id を必ず載せている (これが無いと冪等判定が効かない)", () => {
    expect(scriptCode).toContain("record_id: row.id");
  });
});

describe("[V-BF-06] migration に DML が無い", () => {
  const MIGRATIONS = [
    "supabase/migrations/20260908000000_add_relay_records.sql",
    "supabase/migrations/20260908000100_team_relay_rankings_rpc.sql",
  ] as const;

  it.each(MIGRATIONS)("%s に既存データを書き換える DML が無い", (relPath) => {
    const sql = readFileSync(path.join(REPO_ROOT, relPath), "utf8");

    // コメント行を落としてから探す (説明文に "TRUNCATE は RLS を通らない" 等がある)
    const statements = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");

    const dml = [
      /\bINSERT\s+INTO\b/i,
      /\bUPDATE\s+"?public"?\./i,
      /\bDELETE\s+FROM\b/i,
      /\bTRUNCATE\b/i,
      /\bDROP\s+TABLE\b/i,
    ].filter((pattern) => pattern.test(statements));

    expect(dml.map(String), `${relPath} に DML がある`).toEqual([]);
  });

  it("relay_records の migration が TRUNCATE を authenticated に付け直していない", () => {
    const sql = readFileSync(path.join(REPO_ROOT, MIGRATIONS[0]), "utf8");
    const statements = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");

    // REVOKE ALL の後の GRANT は 4 つの DML だけ。ALL を付け直すと
    // TRUNCATE が復活して RLS では防げない経路が開く
    expect(statements).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."relay_records" TO "authenticated"');
    expect(statements).not.toMatch(/GRANT\s+ALL[^\n]*relay_records"?\s+TO\s+"authenticated"/i);
    expect(statements).not.toMatch(/GRANT\s+ALL[^\n]*relay_record_legs"?\s+TO\s+"authenticated"/i);
  });
});
