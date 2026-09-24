/**
 * 既存の `records.is_relaying` からリレーのチーム記録 (`relay_records` /
 * `relay_record_legs`) を作るバックフィルスクリプト。
 *
 * 使用方法 (リポジトリルート = apps の親から実行):
 *   pnpm exec vite-node scripts/backfill-relay-records.ts --                      # dry-run (既定)
 *   pnpm exec vite-node scripts/backfill-relay-records.ts -- --apply              # 実際に書き込む
 *   pnpm exec vite-node scripts/backfill-relay-records.ts -- --team=<uuid>
 *   pnpm exec vite-node scripts/backfill-relay-records.ts -- --verbose
 *
 * ⚠️ **`tsx` は依存に入っていないので `pnpm exec tsx ...` は動かない**
 *    (`Command "tsx" not found`)。vitest 経由で `vite-node` が入っているのでそれを使う。
 *    `--` は引数を確実にスクリプトへ渡すための区切りで、無くても現状は動くが
 *    付けておくこと。`node_modules/.bin/vite-node scripts/... --apply` でも同じ。
 *    (同ディレクトリの `migrate-storage-to-r2.ts` は `pnpm exec tsx` と書いてあるが
 *     こちらも同じ理由で動かない。あれは本スプリントの担当外なので直していない)
 *
 * 環境変数が必要:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY   (RLS をバイパスして全チームの records を読む)
 *
 * ⚠️ **これは migration ではない。** 過去に破壊的な SQL を migration に置いた前科が
 *    あるため、既存データを読んで新テーブルに書く処理は必ず明示実行のスクリプトに置く。
 *    `supabase/migrations/20260908000000_add_relay_records.sql` は DDL のみで
 *    DML を1行も含まない。
 *
 * 【判定述語】
 *   `apps/web/.../records/_client/buildStyleEntries.ts` の
 *   `buildStyleEntriesFromExisting` の Phase 1 と**同じ**:
 *     created_at 昇順で4行連続 かつ is_relaying が [false, true, true, true]
 *     かつ 4件の style_id の組が RELAY_EVENTS に一致 (detectRelayEventId)
 *   `detectRelayEventId` は shared (`apps/shared/utils/relayEvents.ts`) の
 *   実装をそのまま使う。判定を書き写さない。
 *
 * 【スキップ方針】
 *   🚨 **判定できないグループは推測で作らず必ずスキップする。**
 *   スキップ理由は集計して最後に出す。スキップした行は `records` にそのまま残るので、
 *   個人の記録としては失われない (リレーランキングに出ないだけ)。
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  calcCumulativeTimes,
  detectRelayEventId,
  fromRelayEventId,
} from "../apps/shared/utils/relayEvents";
import { resolveRelayGenderCategory } from "../apps/shared/utils/relayRecordSave";
import type { RelayGenderCategory } from "../apps/shared/types/relayRecord";

// 環境変数は dotenvx が自動注入（apps/web/.env.local）

const args = process.argv.slice(2);
/** 既定は dry-run。書き込むには明示的に --apply を渡す。 */
const isApply = args.includes("--apply");
const isVerbose = args.includes("--verbose");
const teamArg = args.find((arg) => arg.startsWith("--team="));
const targetTeamId = teamArg ? teamArg.slice("--team=".length) : null;

/** 1回のクエリで読む行数。Supabase の既定上限 1000 に合わせる。 */
const PAGE_SIZE = 1000;

/** リレーの検出は4行連続を前提にする (既存の読み取りと同じ)。 */
const RELAY_GROUP_SIZE = 4;

interface RecordRow {
  id: string;
  user_id: string;
  team_id: string | null;
  competition_id: string | null;
  style_id: number;
  time: number;
  pool_type: number;
  reaction_time: number | null;
  is_relaying: boolean;
  created_at: string | null;
}

/**
 * スキップ理由。
 *
 * ⚠️ `unknownStyleCombination` は **現状この理由には到達しない。**
 *    `detectRelayGroups()` は「is_relaying が [false,true,true,true] の4連続」と
 *    「style_id の組が RELAY_EVENTS に一致 (`detectRelayEventId`)」の**両方**を
 *    満たすグループだけを返すので、どちらが原因で外れても呼び出し側からは
 *    区別できず `noRelayPattern` に吸収される (QA 実測: IM×4 と距離混在メドレーの
 *    2グループがどちらも `noRelayPattern` として集計された)。
 *
 *    区別できるようにするには `detectRelayGroups()` の判定を2段に割る必要があるが、
 *    **それは本スプリントの核心的な安全性を崩すのでやらない**:
 *    この関数は `buildStyleEntriesFromExisting` (記録入力画面がリレーを復元する
 *    ときの述語) と逐語一致していることが唯一の正しさの根拠で、そこが乖離すると
 *    「画面ではリレーとして復元されるのにバックフィルは別の判定をする」
 *    という静かな不整合が生まれる。
 *
 *    ラベル側は `noRelayPattern` が両方の原因を名乗るように直してある
 *    (どちらか一方だけを名乗ると、集計が嘘になる)。
 *    `unknownStyleCombination` は `detectRelayGroups()` が将来
 *    `RelayEventId | null` を返す形に戻ったときの受け皿として型に残している。
 */
type SkipReason =
  | "teamIdMissing"
  | "competitionIdMissing"
  | "noRelayPattern"
  | "unknownStyleCombination"
  | "poolTypeMismatch"
  | "invalidPoolType"
  | "alreadyBackfilled"
  | "writeFailed";

const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  teamIdMissing: "records.team_id が NULL (チーム記録ではない)",
  competitionIdMissing: "records.competition_id が NULL (大会に紐づかない記録は推測しない)",
  // 「4連続でない」と「style_id の組が未知」の**両方**がここに集計される。
  // 片方だけを名乗ると集計が嘘になる (根拠は SkipReason の docstring)。
  noRelayPattern:
    "リレーとして復元できない (is_relaying が [false,true,true,true] の4連続でない、または style_id の組が RELAY_EVENTS に無い)",
  unknownStyleCombination:
    "style_id の組が RELAY_EVENTS に一致しない (現状この理由には到達せず noRelayPattern に吸収される)",
  poolTypeMismatch: "4レグの pool_type が一致しない",
  invalidPoolType: "pool_type が 0/1 以外 (正規化せずスキップ)",
  alreadyBackfilled: "既に relay_record_legs.record_id から参照されている (冪等スキップ)",
  writeFailed: "書き込みに失敗した",
};

function checkEnvVars(): void {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error("以下の環境変数が設定されていません:");
    for (const key of missing) console.error(`   - ${key}`);
    process.exit(1);
  }
}

function getSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    // checkEnvVars で先に落としているので通常到達しない
    throw new Error("Supabase の接続情報が不足しています");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * `is_relaying = true` の records を含む (team_id, competition_id) の組を列挙する。
 *
 * リレーの検出には非リレー行 (第1泳者) も必要なので、ここでは
 * 「リレーが含まれるグループのキー」だけを集め、行そのものは後でグループ単位に取り直す。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 【なぜ `records.team_id` で帰属を決めるのか — `competitions.team_id` ではない】
 *
 * ランキングの RPC (`get_team_record_rankings` / 第1弾) は **`records.team_id` を
 * 使ってはいけない**という方針で書かれている。書き込み経路が 2:2 に割れており
 * (web の `useCompetitionTabSave.ts` とダッシュボードの `useDashboardHandlers.ts` は
 *  `team_id` を送らない / `TeamCompetitions.tsx` と mobile は送る)、
 * `records.team_id` で絞ると同じチーム大会でも web 由来の記録だけが静かに落ちるため、
 * あちらは `competitions.team_id` で絞る。
 *
 * **このスクリプトが `records.team_id` を使うのは矛盾ではない。答えている問いが違う。**
 *   - RPC の問い: 「**チーム大会に出場した記録**を集めたい」
 *     → 大会の所属で絞るのが正しい (記録行の team_id は当てにならない)
 *   - バックフィルの問い: 「この記録は **どのチームの記録として入力されたか**」
 *     → `relay_records.team_id` が NOT NULL なので帰属先を決める必要がある。
 *       リレーの入力経路は管理者の代理入力画面 (`RecordClient.tsx` /
 *       `TeamRecordBulkFormScreen.tsx`) **だけ**で、そこは必ず `team_id` を送る。
 *       よって「リレーとして入力された records」には team_id が必ず入っている。
 *
 * `competitions.team_id` に切り替えても救える群は実データで **0 件** だった
 * (2026-09-08、本番ダンプ (PII マスク済み) で PM が実測):
 *   - `records.team_id` あり (対象)                          : 5
 *   - `records` 側 NULL だが `competitions` 側にあり          : **0**
 *   - どちらも NULL (個人で出た大会のリレー)                 : 21
 * スキップされる群は本当に個人大会のリレーであり、チームのリレー記録ではない。
 *
 * 🚨 したがって **ここを `competitions.team_id` に書き換えないこと。**
 *    「第1弾の教訓が守られていない」と読めるが、上記のとおり別の問いである。
 * ─────────────────────────────────────────────────────────────────────────────
 */
async function listRelayGroupKeys(
  supabase: SupabaseClient,
): Promise<Array<{ teamId: string | null; competitionId: string | null }>> {
  const keys = new Map<string, { teamId: string | null; competitionId: string | null }>();

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from("records")
      .select("team_id, competition_id")
      .eq("is_relaying", true)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (targetTeamId) query = query.eq("team_id", targetTeamId);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as Array<{ team_id: string | null; competition_id: string | null }>;
    for (const row of rows) {
      keys.set(`${row.team_id ?? "-"}|${row.competition_id ?? "-"}`, {
        teamId: row.team_id,
        competitionId: row.competition_id,
      });
    }

    if (rows.length < PAGE_SIZE) break;
  }

  return [...keys.values()];
}

/**
 * グループ内の全 records を created_at 昇順で取得する。
 *
 * ⚠️ 並びは `created_at` 昇順 + `id` 昇順。既存の読み取り
 * (`RecordDataLoader.tsx` の `.order("created_at", { ascending: true })`) と同じ
 * 主キーを使う。`created_at` は NULL を取りうる (DEFAULT now() だが NOT NULL 制約が
 * 無い) ため、同値・NULL のときに順序が揺れないよう `id` を第2キーに足す。
 */
async function fetchGroupRecords(
  supabase: SupabaseClient,
  teamId: string,
  competitionId: string,
): Promise<RecordRow[]> {
  const rows: RecordRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("records")
      .select(
        "id, user_id, team_id, competition_id, style_id, time, pool_type, reaction_time, is_relaying, created_at",
      )
      .eq("team_id", teamId)
      .eq("competition_id", competitionId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as RecordRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

interface DetectedRelayGroup {
  records: RecordRow[];
  relayEventId: ReturnType<typeof detectRelayEventId>;
}

/**
 * `buildStyleEntriesFromExisting` の Phase 1 と同じ手順でリレーグループを検出する。
 *
 * 使用済みの添字は再利用しない (1本のリレーが2本に二重計上されない)。
 */
function detectRelayGroups(records: readonly RecordRow[]): DetectedRelayGroup[] {
  const used = new Set<number>();
  const groups: DetectedRelayGroup[] = [];

  for (let i = 0; i <= records.length - RELAY_GROUP_SIZE; i++) {
    if (used.has(i)) continue;

    const candidate = records.slice(i, i + RELAY_GROUP_SIZE);
    const [c0, c1, c2, c3] = candidate;
    if (!c0 || !c1 || !c2 || !c3) continue; // i <= length-4 の for ループ条件から
      // slice は常に4件を返すが、型上は保証されないため防御的にスキップ

    const isRelayPattern = !c0.is_relaying && c1.is_relaying && c2.is_relaying && c3.is_relaying;
    if (!isRelayPattern) continue;

    const relayEventId = detectRelayEventId(candidate.map((row) => row.style_id));
    if (!relayEventId) continue;

    groups.push({ records: candidate, relayEventId });
    for (let j = i; j < i + RELAY_GROUP_SIZE; j++) used.add(j);
  }

  return groups;
}

/** `user_id` → `users.gender`。取得できなかったユーザーはエントリを作らない。 */
async function fetchGenderMap(
  supabase: SupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;

  const { data, error } = await supabase
    .from("users")
    .select("id, gender")
    .in("id", [...new Set(userIds)]);

  if (error) throw error;

  for (const row of (data ?? []) as Array<{ id: string; gender: number | null }>) {
    // users.gender は NOT NULL だが、select の型上は null を取りうる。
    // null は「不明」として扱い 0 で埋めない (0 は男性という業務的な意味を持つ)。
    if (row.gender === null) continue;
    map.set(row.id, row.gender);
  }

  return map;
}

/** 既に `relay_record_legs.record_id` から参照されている records.id の集合。 */
async function fetchAlreadyLinkedRecordIds(
  supabase: SupabaseClient,
  recordIds: readonly string[],
): Promise<Set<string>> {
  const linked = new Set<string>();
  if (recordIds.length === 0) return linked;

  const unique = [...new Set(recordIds)];
  for (let offset = 0; offset < unique.length; offset += PAGE_SIZE) {
    const chunk = unique.slice(offset, offset + PAGE_SIZE);
    const { data, error } = await supabase
      .from("relay_record_legs")
      .select("record_id")
      .in("record_id", chunk);

    if (error) throw error;

    for (const row of (data ?? []) as Array<{ record_id: string | null }>) {
      if (row.record_id !== null) linked.add(row.record_id);
    }
  }

  return linked;
}

async function main(): Promise<void> {
  checkEnvVars();
  const supabase = getSupabaseClient();

  console.log(
    isApply
      ? "モード: --apply (relay_records / relay_record_legs に書き込みます)"
      : "モード: dry-run (書き込みません。実行するには --apply を渡してください)",
  );
  if (targetTeamId) console.log(`対象チーム: ${targetTeamId}`);

  const groupKeys = await listRelayGroupKeys(supabase);
  console.log(`is_relaying=true を含む (team_id, competition_id) の組: ${groupKeys.length}`);

  let created = 0;
  const skipped = new Map<SkipReason, number>();
  const addSkip = (reason: SkipReason, count = 1) => {
    skipped.set(reason, (skipped.get(reason) ?? 0) + count);
  };

  // team_id / competition_id が NULL の組はそもそも復元対象にしない
  const restorableKeys: Array<{ teamId: string; competitionId: string }> = [];
  for (const key of groupKeys) {
    if (key.teamId === null) {
      // `records.team_id` が NULL = 個人で出場した大会のリレー。
      // relay_records.team_id は NOT NULL で帰属先が決まらないためスキップする。
      // `competitions.team_id` で救う案は実データで 0 件だった
      // (根拠は listRelayGroupKeys の docstring)。
      addSkip("teamIdMissing");
      continue;
    }
    if (key.competitionId === null) {
      addSkip("competitionIdMissing");
      continue;
    }
    restorableKeys.push({ teamId: key.teamId, competitionId: key.competitionId });
  }

  for (const { teamId, competitionId } of restorableKeys) {
    const records = await fetchGroupRecords(supabase, teamId, competitionId);
    const relayingCount = records.filter((row) => row.is_relaying).length;
    const groups = detectRelayGroups(records);

    // 検出できなかった is_relaying 行の本数を概算で記録する。
    // 「4行連続でない」と「style_id の組が未知」は detectRelayGroups が
    // どちらも「返さない」で表現するため呼び出し側から区別できない。
    // よって両方をまとめて noRelayPattern に集計する
    // (ラベルも両方の原因を名乗る形にしてある)。
    const detectedRelayingRows = groups.length * (RELAY_GROUP_SIZE - 1);
    if (relayingCount > detectedRelayingRows) {
      addSkip("noRelayPattern", relayingCount - detectedRelayingRows);
      if (isVerbose) {
        console.log(
          `  [skip] team=${teamId} competition=${competitionId}: ` +
            `is_relaying ${relayingCount} 行のうち ${detectedRelayingRows} 行だけがリレーとして復元可能`,
        );
      }
    }

    for (const group of groups) {
      const { relayEventId } = group;
      if (!relayEventId) {
        // detectRelayGroups() が detectRelayEventId() の null を弾いているので
        // ここには到達しない (型が `RelayEventId | null` のままなので分岐は残す)。
        // 到達したら推測で作らずスキップする。
        addSkip("unknownStyleCombination");
        continue;
      }

      const legs = group.records;
      const first = legs.at(0);
      if (!first) {
        addSkip("noRelayPattern");
        continue;
      }

      // 水路は正規化しない。4レグで食い違う / 0,1 以外はスキップする
      // (どちらかの水路に静かに寄せない)。
      const poolTypes = new Set(legs.map((row) => row.pool_type));
      if (poolTypes.size > 1) {
        addSkip("poolTypeMismatch");
        if (isVerbose) {
          console.log(
            `  [skip] team=${teamId} competition=${competitionId}: pool_type が不一致 ` +
              `(${[...poolTypes].join(",")})`,
          );
        }
        continue;
      }
      if (first.pool_type !== 0 && first.pool_type !== 1) {
        addSkip("invalidPoolType");
        continue;
      }

      // 冪等性: このグループの records が既に relay_record_legs から参照されていたら
      // 作成済みとみなしてスキップする。
      const linked = await fetchAlreadyLinkedRecordIds(
        supabase,
        legs.map((row) => row.id),
      );
      if (linked.size > 0) {
        addSkip("alreadyBackfilled");
        if (isVerbose) {
          console.log(
            `  [skip] team=${teamId} competition=${competitionId}: 既にバックフィル済み ` +
              `(${linked.size}/${legs.length} レグが参照済み)`,
          );
        }
        continue;
      }

      const genderMap = await fetchGenderMap(
        supabase,
        legs.map((row) => row.user_id),
      );
      const genderCategory: RelayGenderCategory = resolveRelayGenderCategory(
        legs.map((row) => row.user_id),
        genderMap,
      );

      // 総合タイムは区間タイムの累計の最終要素。
      // records.time はリレーでは区間タイムなので、そのまま積み上げてよい。
      const cumulatives = calcCumulativeTimes(legs.map((row) => row.time));
      const totalTime = cumulatives.at(-1);
      if (totalTime === undefined || totalTime <= 0) {
        // CHECK (total_time > 0) に弾かれる値なので書き込む前に落とす
        addSkip("noRelayPattern");
        continue;
      }

      const { kind, legDistance } = fromRelayEventId(relayEventId);

      if (isVerbose || !isApply) {
        console.log(
          `  [create] team=${teamId} competition=${competitionId} ` +
            `${legDistance}m x ${legs.length} ${kind} pool=${first.pool_type} ` +
            `${genderCategory} total=${totalTime}`,
        );
      }

      if (!isApply) {
        created += 1;
        continue;
      }

      const { data: newRelay, error: relayError } = await supabase
        .from("relay_records")
        .insert({
          team_id: teamId,
          competition_id: competitionId,
          relay_kind: kind,
          leg_distance: legDistance,
          leg_count: legs.length,
          pool_type: first.pool_type,
          gender_category: genderCategory,
          total_time: totalTime,
          // created_by は入れない (NULL = 入力者不明)。
          // 🚨 「そのチームの最古の承認済み管理者」を代表として詰め込んではいけない。
          //    relay_records.created_by は ON DELETE SET NULL なので消えはしないが、
          //    バックフィルした全リレー記録が「その1人が入力した」という嘘の履歴を
          //    持つことになる。実際には誰も入力していないので NULL が正直。
          //    列は nullable で、この経路では auth.uid() も NULL (service_role)。
        })
        .select("id")
        .single();

      if (relayError || !newRelay) {
        console.error(
          `  [error] relay_records の insert に失敗: team=${teamId} competition=${competitionId}`,
          relayError,
        );
        addSkip("writeFailed");
        continue;
      }

      const legRows = legs.map((row, index) => ({
        relay_record_id: newRelay.id,
        leg_index: index,
        user_id: row.user_id,
        style_id: row.style_id,
        leg_time: row.time,
        reaction_time: row.reaction_time,
        record_id: row.id,
      }));

      const { error: legError } = await supabase.from("relay_record_legs").insert(legRows);

      if (legError) {
        console.error(
          `  [error] relay_record_legs の insert に失敗: relay_record=${newRelay.id}`,
          legError,
        );
        addSkip("writeFailed");
        // レグ無しの親が残るとランキングにラップの無い行が出るので巻き戻す
        const { error: rollbackError } = await supabase
          .from("relay_records")
          .delete()
          .eq("id", newRelay.id);
        if (rollbackError) {
          console.error(`  [error] 巻き戻しに失敗: relay_record=${newRelay.id}`, rollbackError);
        }
        continue;
      }

      created += 1;
    }
  }

  console.log("");
  console.log("=== 結果 ===");
  console.log(isApply ? `作成: ${created} 本` : `作成予定: ${created} 本 (dry-run)`);
  const totalSkipped = [...skipped.values()].reduce((sum, count) => sum + count, 0);
  console.log(`スキップ: ${totalSkipped} 件`);
  for (const [reason, count] of skipped) {
    console.log(`  - ${SKIP_REASON_LABEL[reason]}: ${count}`);
  }
  if (!isApply && created > 0) {
    console.log("");
    console.log("書き込むには --apply を付けて再実行してください。");
  }
}

main().catch((error: unknown) => {
  console.error("バックフィルが異常終了しました:", error);
  process.exit(1);
});
