/**
 * 目標の初期タイム (goals.start_time) 全廃の静的ガード (Sprint Contract v2 SC7 / SC8 / SC10 / D1 / D4)
 *
 * ファイルの「現在の内容」を fs で読む (git diff は使わない)。対象は追跡されているファイルだけ
 * (supabase/seed.sql は .gitignore 対象のローカル専用ファイルなので、ここでは読まない)。
 * 空走査防止: 走査したファイル数を assert する。各検査関数は、違反を含むサンプル文字列で
 * 実際に検出できることを同じファイル内で確かめる (書き戻しを検知できることの実証)。
 *
 * 壊したら赤:
 *   - 削除したフック・関数・ファイル (computeGoalProgress / calculateGoalProgress / goalProgressQuery /
 *     useGoalProgress / pickGoalStartTime / useGoalStartTimeAutofill) をどこかに書き戻す
 *   - 目標系の画面・API・型に start_time / startTime / initialTime を書き戻す (練習・動画など別概念は対象外)
 *   - 削除した i18n キーを web / mobile のソースから参照する
 *   - v4 で削除したフォームのベスト取得 (GoalAPI.getBestTime / useGoalFormBestTimeQuery) と
 *     キー (goals.form.bestTimeLabel / goals.form.competitionDateLabel) を書き戻す
 *   - web 詳細・mobile 詳細・管理者カードにマイルストーン達成率のインライン式を書く
 *   - getBestTimeForStyle の「SQL 関数 get_team_member_goals と同一定義」の警告を消す
 *   - 適用済み migration (20260929000000〜20261005000000) を編集する
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APPS = resolve(__dirname, "../../../apps");
const REPO = resolve(APPS, "..");
const SHARED = resolve(__dirname, "..");
const read = (abs: string) => readFileSync(abs, "utf8");
const rel = (abs: string) => relative(REPO, abs);

const SKIP_DIRS = new Set(["node_modules", "__tests__", "__mocks__", ".next", ".expo", "coverage", "dist", "e2e", "ios", "android", ".turbo", ".open-next", "web-build"]);

/** dir 配下の本番ソース (.ts / .tsx。テスト・モック・ビルド成果物は除く) */
function walkSources(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walkSources(abs, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(abs);
  }
  return out;
}

const ALL_SOURCES = [
  ...walkSources(SHARED),
  ...walkSources(join(APPS, "web")),
  ...walkSources(join(APPS, "mobile")),
];

// 目標系 (初期タイムと同じ名前の別概念を含まない範囲) の本番ソース
const GOAL_SCOPE = [
  ...["api/goals.ts", "types/goals.ts", "types/teamMemberGoals.ts", "hooks/queries/goals.ts", "hooks/queries/teamMemberGoals.ts"].map((f) =>
    join(SHARED, f),
  ),
  ...walkSources(join(APPS, "web/app/[locale]/(authenticated)/goals")),
  ...walkSources(join(APPS, "web/components/team/member-goals")),
  ...readdirSync(join(APPS, "mobile/screens"))
    .filter((f) => /^(Goal\w*|MilestoneFormScreen)\.tsx$/.test(f))
    .map((f) => join(APPS, "mobile/screens", f)),
  ...walkSources(join(APPS, "mobile/components/goals")),
  ...walkSources(join(APPS, "mobile/components/teams/member-goals")),
];

// ---- 検査関数 ----------------------------------------------------------------
const REMOVED_IDENTIFIERS = /\b(computeGoalProgress|calculateGoalProgress|goalProgressQuery|useGoalProgress|pickGoalStartTime|useGoalStartTimeAutofill|useGoalFormBestTimeQuery)\b/g;
/** v4 で削除した GoalAPI.getBestTime の定義と呼び出し (BestTimesTable のローカル関数 getBestTime は別物なので拾わない) */
const GOAL_API_GET_BEST_TIME = /\basync\s+getBestTime\s*\(|\.getBestTime\s*\(/g;
/** camelCase の途中に埋まった名前 (setStartTime / handleStartTimeChange 等) も拾う */
const START_TIME_TOKENS = /\w*(?:start_time|startTime|StartTime|initialTime|InitialTime)\w*/g;
/** 削除した i18n キーの静的参照 (web は名前空間相対・mobile は完全修飾のどちらも拾う) */
const REMOVED_KEY_REFS =
  /["'`](?:goals\.)?(?:detail\.initialTime|goalReflection\.initialTimeLabel|form\.startTimeLabel|form\.startTimePlaceholder|create\.startTimeInvalid|edit\.validation\.startTimeInvalid|form\.bestTimeLabel|form\.competitionDateLabel)["'`]|["'`](?:teamMemberGoals\.)?progressUnavailable["'`]/g;
const ACHIEVEMENT_KEY_REF = /["'`](?:goals\.)?detail\.achievement["'`]/;
/** SQL の time > 0 (0 / 0.0 / 0.00。0.5 や >= 0 は不可) */
const TIME_GT_ZERO = /"?time"?\s*>\s*0(\.0+)?(?![.\d])/;
/** マイルストーン件数で割るインライン式 (例: achieved / goal.milestones.length) */
const INLINE_RATIO = /\/\s*\(?\s*[\w?.]*milestones\??\.length/;

const matches = (src: string, re: RegExp) => [...src.matchAll(re)].map((m) => m[0]);

describe("検査関数が違反を検出する (書き戻しの検知の実証)", () => {
  it("削除した識別子・初期タイムの名前・削除キーの参照・インライン式を検出し、別概念は拾わない", () => {
    expect(matches("import { computeGoalProgress } from '../utils/goalProgress';", REMOVED_IDENTIFIERS)).toEqual(["computeGoalProgress"]);
    expect(matches("const q = useQuery(goalProgressQuery(api, id));", REMOVED_IDENTIFIERS)).toEqual(["goalProgressQuery"]);
    expect(matches("const { markTouched } = useGoalStartTimeAutofill({});", REMOVED_IDENTIFIERS)).toEqual(["useGoalStartTimeAutofill"]);
    expect(matches("updateData.start_time = updates.startTime;", START_TIME_TOKENS)).toEqual(["start_time", "startTime"]);
    expect(matches("<p>{t('detail.initialTime')}</p>", START_TIME_TOKENS)).toEqual(["initialTime"]);
    expect(matches("setStartTime(null); handleStartTimeChange(v);", START_TIME_TOKENS)).toEqual(["setStartTime", "handleStartTimeChange"]);
    expect(matches('t("form.startTimeLabel")', REMOVED_KEY_REFS)).toEqual(['"form.startTimeLabel"']);
    expect(matches('t("goals.goalReflection.initialTimeLabel")', REMOVED_KEY_REFS)).toEqual(['"goals.goalReflection.initialTimeLabel"']);
    expect(matches('tMember("progressUnavailable")', REMOVED_KEY_REFS)).toEqual(['"progressUnavailable"']);
    expect(matches('t("form.bestTimeLabel", { time })', REMOVED_KEY_REFS)).toEqual(['"form.bestTimeLabel"']);
    expect(matches('label={t("form.competitionDateLabel")}', REMOVED_KEY_REFS)).toEqual(['"form.competitionDateLabel"']);
    // エントリーのベストタイムラベル (forms.recordLog.bestTimeLabel) は別のキー
    expect(matches('t("forms.recordLog.bestTimeLabel")', REMOVED_KEY_REFS)).toEqual([]);
    expect(matches("const q = useGoalFormBestTimeQuery(supabase, 1, 0);", REMOVED_IDENTIFIERS)).toEqual(["useGoalFormBestTimeQuery"]);
    expect(matches("const best = await goalAPI.getBestTime(styleId, poolType);", GOAL_API_GET_BEST_TIME)).toEqual([".getBestTime("]);
    expect(matches("  async getBestTime(styleId: number, poolType: number) {", GOAL_API_GET_BEST_TIME)).toEqual(["async getBestTime("]);
    expect(matches("const getBestTime = (style) => null; getBestTime(s); api.getBestTimes(); getBestTimeForEntry(a)", GOAL_API_GET_BEST_TIME)).toEqual([]);
    // 練習のタイム入力 (initialTimes) は別概念。クォート付きのキーとしては拾わない
    expect(matches("initialTimes={modalInitialTimes}", REMOVED_KEY_REFS)).toEqual([]);
    expect(ACHIEVEMENT_KEY_REF.test('tGoals("detail.achievement")')).toBe(true);
    expect(ACHIEVEMENT_KEY_REF.test('t("goals.detail.milestoneRatio")')).toBe(false);
    expect(INLINE_RATIO.test("(achievedCount / goal.milestones.length) * 100")).toBe(true);
    expect(INLINE_RATIO.test("x.filter(f).length / goal.milestones.length")).toBe(true);
    // 見出しの件数表示 (1/2) は割り算ではないので拾わない
    expect(INLINE_RATIO.test("({achievedCount}/{goal.milestones.length})")).toBe(false);
    expect(INLINE_RATIO.test("const ratio = computeMilestoneRatio(goal.milestones);")).toBe(false);
    expect(TIME_GT_ZERO.test('AND r."time" > 0::numeric')).toBe(true);
    expect(TIME_GT_ZERO.test("AND r.time > 0.00")).toBe(true);
    expect(TIME_GT_ZERO.test("AND r.time >= 0")).toBe(false);
    expect(TIME_GT_ZERO.test("AND r.time > 0.5")).toBe(false);
  });
});

describe("空走査防止", () => {
  it("本番ソースを十分な件数走査している", () => {
    expect(ALL_SOURCES.length).toBeGreaterThan(500);
    expect(GOAL_SCOPE.length).toBeGreaterThanOrEqual(35);
    for (const f of GOAL_SCOPE.slice(0, 5)) expect(existsSync(f), rel(f)).toBe(true);
  });
});

describe("SC8: 削除した関数・フック・ファイル", () => {
  it.each([
    "packages/shared/utils/goalProgress.ts",
    "packages/shared/utils/goalStartTime.ts",
    "packages/shared/hooks/useGoalStartTimeAutofill.ts",
    "apps/mobile/hooks/useGoalProgress.ts",
  ])("%s が存在しない", (f) => {
    expect(existsSync(join(REPO, f))).toBe(false);
  });

  it("web / mobile / shared の本番ソースのどこにも削除した識別子が無い (コメント含む)", () => {
    const offenders = ALL_SOURCES.flatMap((f) => matches(read(f), REMOVED_IDENTIFIERS).map((m) => `${rel(f)}: ${m}`));
    expect(offenders).toEqual([]);
  });

  it("v4: GoalAPI.getBestTime の定義と、目標系の画面・フックからの呼び出しが無い", () => {
    const files = [...GOAL_SCOPE, join(SHARED, "api/goals.ts"), join(SHARED, "hooks/queries/goals.ts")].filter(existsSync);
    const offenders = files.flatMap((f) => matches(read(f), GOAL_API_GET_BEST_TIME).map((m) => `${rel(f)}: ${m}`));
    expect(offenders).toEqual([]);
  });
});

describe("SC8: 目標系の本番ソースに初期タイムが残っていない", () => {
  it("目標系の画面・API・型に start_time / startTime / initialTime が無い (コメント含む)", () => {
    const offenders = GOAL_SCOPE.filter(existsSync).flatMap((f) =>
      matches(read(f), START_TIME_TOKENS).map((m) => `${rel(f)}: ${m}`),
    );
    expect(offenders).toEqual([]);
  });

  it("supabase-schema.ts の goals (Row / Insert / Update) に start_time が無い", () => {
    const src = read(join(SHARED, "types/supabase-schema.ts"));
    const start = src.indexOf("      goals: {");
    expect(start, "goals テーブルの定義が見つからない").toBeGreaterThan(0);
    const end = src.indexOf("\n      };", start);
    const goalsBlock = src.slice(start, end);
    expect(goalsBlock).toMatch(/target_time/);
    expect(goalsBlock).not.toMatch(/start_time/);
  });

  it.each(["goalsMilestoneAndTimeInputRegression.spec.ts", "goalsProxySaveDelayedJudgment.spec.ts"])(
    "e2e %s が goals へ初期タイムを書かない (列削除後は start_time つきの INSERT が失敗する)",
    (f) => {
      const src = read(join(APPS, "web/e2e/src/tests", f));
      expect(src).toMatch(/from\("goals"\)/);
      expect(matches(src, START_TIME_TOKENS)).toEqual([]);
      // 初期タイム欄は「無いこと」を確かめるだけ (入力・クリックしない)
      expect(src).not.toMatch(/goal-start-time"\]'\)\.(fill|click|press|type)/);
    },
  );
});

describe("SC10: 削除した i18n キーの参照が 0 件", () => {
  it("web / mobile / shared の本番ソースが削除キーを参照していない", () => {
    const offenders = ALL_SOURCES.flatMap((f) => matches(read(f), REMOVED_KEY_REFS).map((m) => `${rel(f)}: ${m}`));
    expect(offenders).toEqual([]);
  });

  it("goals.detail.achievement (時間ベースの「達成率」) は参照が0件で、5言語から削除されている (D8)", () => {
    const referencing = ALL_SOURCES.filter((f) => ACHIEVEMENT_KEY_REF.test(read(f))).map(rel);
    expect(referencing).toEqual([]);
    for (const loc of ["ja", "en", "de", "ko", "zh"]) {
      const messages = JSON.parse(read(join(SHARED, "messages", `${loc}.json`))) as {
        goals: { detail: Record<string, unknown> };
      };
      expect("achievement" in messages.goals.detail, loc).toBe(false);
      // 見出しに使う milestoneRatio は残る (空振りでないことの確認)
      expect(typeof messages.goals.detail.milestoneRatio, loc).toBe("string");
    }
  });
});

describe("SC7: マイルストーン達成率は computeMilestoneRatio だけで計算する", () => {
  it.each([
    "web/app/[locale]/(authenticated)/goals/_components/GoalDetail.tsx",
    "web/components/team/member-goals/MemberGoalCard.tsx",
    "mobile/screens/GoalDetailScreen.tsx",
    "mobile/components/teams/member-goals/TeamMemberGoalCard.tsx",
  ])("%s は computeMilestoneRatio を呼び、件数で割るインライン式を持たない", (f) => {
    const src = read(join(APPS, f));
    expect(src).toMatch(/computeMilestoneRatio\(/);
    expect(src).not.toMatch(INLINE_RATIO);
  });

  it("computeMilestoneRatio の定義元は packages/shared/utils/milestoneRatio.ts の1箇所だけ", () => {
    const definers = ALL_SOURCES.filter((f) => /(function|const)\s+computeMilestoneRatio\b/.test(read(f))).map(rel);
    expect(definers).toEqual(["packages/shared/utils/milestoneRatio.ts"]);
  });
});

describe("D1: getBestTimeForStyle の SQL 関数との同一定義の警告を残す", () => {
  it("getBestTimeForStyle の直前の JSDoc が get_team_member_goals (current_best_time) を参照している", () => {
    const src = read(join(SHARED, "api/goals.ts"));
    const method = src.indexOf("private async getBestTimeForStyle(");
    expect(method, "getBestTimeForStyle が private のまま残っていない").toBeGreaterThan(0);
    const doc = src.slice(src.lastIndexOf("/**", method), method);
    expect(doc).toMatch(/get_team_member_goals/);
    expect(doc).toMatch(/current_best_time/);
  });
});

describe("D4: 新規 migration と適用済み migration", () => {
  const MIGRATIONS = join(REPO, "supabase/migrations");
  const NEW_MIGRATION = join(MIGRATIONS, "20261013000000_drop_goals_start_time.sql");

  it("新規 migration 20261013000000_drop_goals_start_time.sql が1ファイルで、RPC の作り直し (current_best_time は time > 0) と列削除と権限の再付与を持つ", () => {
    expect(existsSync(NEW_MIGRATION), "migration ファイルが無い").toBe(true);
    const sql = read(NEW_MIGRATION);
    const dropFn = sql.search(/DROP\s+FUNCTION\s+(IF\s+EXISTS\s+)?"?public"?\."?get_team_member_goals"?\s*\(\s*"?uuid"?\s*,\s*"?uuid"?\s*\)/i);
    const createFn = sql.search(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+"?public"?\."?get_team_member_goals"?/i);
    expect(dropFn, "DROP FUNCTION get_team_member_goals(uuid, uuid)").toBeGreaterThanOrEqual(0);
    expect(createFn, "CREATE FUNCTION get_team_member_goals").toBeGreaterThan(dropFn);
    const returns = sql.slice(createFn, sql.indexOf("$$", createFn));
    expect(returns).toMatch(/current_best_time/);
    expect(returns).not.toMatch(/start_time/);
    expect(sql).toMatch(/ALTER\s+TABLE\s+(ONLY\s+)?"?public"?\."?goals"?\s+DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?"?start_time"?/i);
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+"?public"?\."?get_team_member_goals"?\s*\([^)]*\)\s+FROM\s+PUBLIC/i);
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+"?public"?\."?get_team_member_goals"?\s*\([^)]*\)\s+FROM\s+"?anon"?/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+"?public"?\."?get_team_member_goals"?\s*\([^)]*\)\s+TO\s+"?authenticated"?/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+"?public"?\."?get_team_member_goals"?\s*\([^)]*\)\s+TO\s+"?service_role"?/i);
    // D7: current_best_time は time > 0 の行の MIN (getBestTimeForStyle の .gt("time", 0) と同一定義)。旧コメントは引き継がない
    const body = sql.slice(createFn);
    expect(body).toMatch(TIME_GT_ZERO);
    expect(sql).not.toMatch(/time > 0 等の条件も足さない/);
    const laterMigrations = readdirSync(MIGRATIONS).filter((f) => f > "20261013000000_drop_goals_start_time.sql" && /start_time/.test(read(join(MIGRATIONS, f))));
    expect(laterMigrations, "列削除は同じ migration で行う (D6)").toEqual([]);
  });

  // 本番適用済み (2026-10-13 実測) の migration は編集しない。値は 2026-10-13 時点の内容
  it.each([
    ["20260929000000_goals_optional_competition_and_reflection_note.sql", "eac4feb5bad6b9cd55537b0ae7efd61a4ff8b05e37eb1912d9d98fc5adbcdbcc"],
    ["20260929000001_delete_competition_with_records_also_deletes_goals.sql", "2037a86ca1c0a2f5aed7700d5783d77bcd36c570c4b9c73267fafe1e7a79425b"],
    ["20260929000002_milestone_achievements_unique.sql", "340793fdb6b06cc60edaf61e889ff98579b052f74200a41a0c2b381afcf881f3"],
    ["20261004000000_get_team_member_goals_rpc.sql", "4a1ec5e5ed7dd8f0dcf23f1ce1a0a0359057dc9879d9a7ce17c7b851f3a999e1"],
    ["20261005000000_get_team_competition_goal_targets_rpc.sql", "c97fdf89e5e2144af9a90efe65521d61e4bf6f7baad1a94d5bc7e58b1e721fca"],
  ])("適用済みの %s は変更されていない", (file, sha256) => {
    const hash = createHash("sha256").update(readFileSync(join(MIGRATIONS, file))).digest("hex");
    expect(hash).toBe(sha256);
  });
});
