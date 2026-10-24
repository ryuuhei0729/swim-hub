#!/usr/bin/env node
// =============================================================================
// ros:export - Supabase 投入用 SQL を生成する
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { RacePaceModel } from "@shared/racePace";
import { paths } from "../config";
import { toUpsertSql } from "../export/toSupabase";
import { log } from "./_shared";

if (!existsSync(paths.models)) {
  log(`${paths.models} がありません。先に pnpm ros:aggregate を実行してください`);
  process.exit(0);
}

const models = JSON.parse(readFileSync(paths.models, "utf8")) as RacePaceModel[];
const sql = toUpsertSql(models);
writeFileSync(paths.exportSql, sql);

log(`モデル ${models.length} 件 -> ${paths.exportSql}`);
log("");
log("適用方法:");
log("  1. pnpm exec supabase migration up --workdir supabase   # 未適用の migration だけを当てる");
log(`  2. psql "$DATABASE_URL" -f ${paths.exportSql}`);
log("");
log("※ db reset は使わないこと (ローカルDBを作り直すため既存の開発データが消える)");
log("");
log("※ 自然キーでの upsert なので何度流しても同じ状態になります");
