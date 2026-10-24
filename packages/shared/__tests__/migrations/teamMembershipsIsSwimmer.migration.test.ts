/**
 * Issue #49 QA テスト (Phase A スケルトン): team_memberships.is_swimmer migration の静的検証
 *
 * Sprint Contract 検証観点:
 *   [V-01] team_memberships に is_swimmer boolean NOT NULL DEFAULT true を追加する migration が
 *          存在し、未適用の既存3件 (20260909235900 / 20260910000000 / 20260910000001) より
 *          後の日付になっている
 *   [V-02] 既存行を書き換える DML (UPDATE/INSERT/DELETE 等) が無い
 *          (DEFAULT true だけで「既存メンバーは migration 適用後も全員が泳者扱いのまま」という
 *           受け入れ基準を満たす設計であることの確認。バックフィル不要という Issue の前提が
 *           実際の migration でも守られているかを固定する)
 *
 * このテストは実際の SQL ファイルを `supabase/migrations/` から glob 探索する。
 * Developer が選ぶ正確なファイル名 (タイムスタンプ) は Phase A 時点では未定のため、
 * ファイル名を決め打ちにせず「is_swimmer に言及している migration」をディレクトリ走査で探す。
 * 現時点では該当ファイルが存在しないため、このテストスイートは red のまま
 * (`toBeDefined()` が failed) になる。
 *
 * 参考にした既存パターン: backfillRelayRecords.contract.test.ts の
 * 「[V-BF-06] migration に DML が無い」ブロック (DML 検出の正規表現をそのまま踏襲)。
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase/migrations");

// 未適用の既存3件 (Issue #49 コメントで実測済み)。新規 migration はこれらより後の日付にすること。
const LATEST_KNOWN_PENDING_TIMESTAMP = "20260910000001";

function findIsSwimmerMigrationFiles(): string[] {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  return files
    .filter((f) => {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
      return /is_swimmer/i.test(sql);
    })
    .sort();
}

describe("[V-01] team_memberships.is_swimmer migration", () => {
  it("is_swimmer に言及する migration ファイルが少なくとも1件存在する", () => {
    const files = findIsSwimmerMigrationFiles();
    expect(files.length, "is_swimmer を含む migration が見つからない").toBeGreaterThan(0);
  });

  it("ファイル名のタイムスタンプが既存の未適用3件より後である", () => {
    const files = findIsSwimmerMigrationFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const timestampMatch = file.match(/^(\d{14})_/);
      expect(timestampMatch, `${file} がタイムスタンプ_で始まっていない`).not.toBeNull();
      const timestamp = timestampMatch![1]!;
      expect(
        timestamp > LATEST_KNOWN_PENDING_TIMESTAMP,
        `${file} (${timestamp}) は既存の未適用 migration (${LATEST_KNOWN_PENDING_TIMESTAMP}) より前`,
      ).toBe(true);
    }
  });

  it("is_swimmer 列の定義が NOT NULL DEFAULT true である", () => {
    const files = findIsSwimmerMigrationFiles();
    expect(files.length).toBeGreaterThan(0);

    const combinedSql = files
      .map((f) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
      .join("\n");

    const columnLine = combinedSql
      .split("\n")
      .find((line) => /is_swimmer/i.test(line) && /boolean/i.test(line));

    expect(columnLine, "is_swimmer の列定義行が見つからない").toBeDefined();
    expect(columnLine).toMatch(/NOT\s+NULL/i);
    expect(columnLine).toMatch(/DEFAULT\s+true/i);
  });

  it("既存データを書き換える DML (バックフィル) が無い (DEFAULT だけで完結する設計であること)", () => {
    const files = findIsSwimmerMigrationFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      const statements = sql
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n");

      const dml = [
        /\bINSERT\s+INTO\b/i,
        /\bUPDATE\s+"?public"?\.?"?team_memberships"?\s+SET\b/i,
        /\bDELETE\s+FROM\b/i,
        /\bTRUNCATE\b/i,
      ].filter((pattern) => pattern.test(statements));

      expect(dml.map(String), `${file} に既存データを書き換える DML がある`).toEqual([]);
    }
  });

  it("既存の自己脱退 RLS (leave) の枝に is_swimmer 変更を許可する追記をしていない (R2 スコープ外)", () => {
    // PM裁定: R2 (自己脱退の便乗変更) は今回のスコープ外、別Issue #50 に切り出し済み。
    // is_swimmer の migration が既存の自己脱退ポリシーへ「is_swimmer も含めて良い」という
    // 例外を追加していないことを確認する (=RLSの脆弱性を今回のスプリントで意図せず広げていない)。
    const files = findIsSwimmerMigrationFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      // 自己脱退ポリシー (20260706000000_membership_join_reactivate_rpc.sql) の
      // 典型的な条件式の一部。これを is_swimmer 用 migration が再定義していないことを確認する。
      expect(sql).not.toMatch(/left_at\s*=\s*now\(\)[\s\S]*is_swimmer/i);
    }
  });
});
