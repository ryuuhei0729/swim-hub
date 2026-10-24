/**
 * apps/shared/__tests__/api/goals.milestoneCountingRange.test.ts
 *
 * マイルストーンの達成・進行中の判定は「マイルストーンを作った後に登録した」記録だけを数える
 * (2026-10-15 ユーザー報告: 50m Fr 26.99 のマイルストーンが、作る前の大会記録 24.32 で作った瞬間に達成になった)。
 * 数える行 = 登録 (created_at) がマイルストーンの作成以降 かつ 練習日・大会日が作成日 (日本時間) 以降。
 * 判定は端末でもサーバー (UTC) でも走るので、どのタイムゾーンで実行しても同じ結果になること。
 * あわせて 0 秒の行 (未入力の本) では達成にしない。
 *
 * モックは「コードが渡した絞り込み (eq / ilike / gte / gt / lte) だけを行データに適用する」。
 * 埋め込み先の列 (practices.date / competitions.date) への絞り込みは、実際の PostgREST と同じく
 * select に `<table>!inner(` があるときだけ親の行を落とす (無ければ子の行にしか効かず、親は残る)。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GoalAPI } from "../../api/goals";
import type { Milestone } from "../../types/goals";

type Row = Record<string, unknown>;

function resolvePath(row: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => (cur as Row | undefined)?.[key], row);
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function makeFilteringTable(rows: Row[]) {
  return () => {
    const filters: Array<(row: Row) => boolean> = [];
    let selectText = "";
    let limitN: number | null = null;
    // 埋め込み先の列への絞り込みは、その埋め込みが !inner のときだけ親の行に効く
    const appliesToParent = (col: string) => {
      const [head, ...rest] = col.split(".");
      return rest.length === 0 || new RegExp(`\\b${head}!inner\\(`).test(selectText);
    };
    const addFilter = (col: string, pred: (v: unknown) => boolean) => {
      if (appliesToParent(col)) filters.push((r) => pred(resolvePath(r, col)));
    };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn((text: string) => {
      selectText = text;
      return builder;
    });
    builder.eq = vi.fn((col: string, v: unknown) => (addFilter(col, (x) => x === v), builder));
    builder.ilike = vi.fn(
      (col: string, v: string) => (addFilter(col, (x) => String(x).toLowerCase() === v.toLowerCase()), builder),
    );
    builder.gte = vi.fn((col: string, v: unknown) => (addFilter(col, (x) => x !== undefined && compare(x, v) >= 0), builder));
    builder.gt = vi.fn((col: string, v: unknown) => (addFilter(col, (x) => compare(x, v) > 0), builder));
    builder.lte = vi.fn((col: string, v: unknown) => (addFilter(col, (x) => compare(x, v) <= 0), builder));
    builder.in = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn((n: number) => {
      limitN = n;
      return builder;
    });
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      let data = rows.filter((r) => filters.every((f) => f(r)));
      if (limitN !== null) data = data.slice(0, limitN);
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    };
    return builder;
  };
}

// 作成: 2026-10-15 03:00Z (JST 12:00)
const CREATED_AT = "2026-10-15T03:00:00.000Z";
const BEFORE_CREATION = "2026-10-15T01:00:00.000Z";
const AFTER_CREATION = "2026-10-15T05:00:00.000Z";

function milestone(type: Milestone["type"], params: Record<string, unknown>, over: Partial<Milestone> = {}): Milestone {
  return {
    id: "ms-1",
    goal_id: "goal-1",
    title: "T",
    type,
    params,
    deadline: null,
    status: "not_started",
    achieved_at: null,
    reflection_done: false,
    reflection_note: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...over,
  } as unknown as Milestone;
}

const TIME_PARAMS = { distance: 50, target_time: 26.99, style: "Fr", swim_category: "Swim" };
// 何セット満たせば達成かは未決 (今は1セット分の平均で判定) なので、1セットの目標だけを扱う
const REPS_PARAMS = {
  distance: 50, reps: 6, sets: 1, target_average_time: 28.81, style: "Fr", swim_category: "Swim", circle: 90,
};
const SET_PARAMS = { distance: 50, reps: 6, sets: 1, circle: 40, style: "Fr", swim_category: "Swim" };

function practiceLog(id: string, date: string, createdAt: string, times: number[], over: Row = {}): Row {
  return {
    id, user_id: "user-1", distance: 50, style: "Fr", swim_category: "Swim", rep_count: times.length || 6, set_count: 1,
    created_at: createdAt,
    practices: { date },
    practice_times: times.map((time, i) => ({ id: `${id}-t${i}`, time, set_number: 1, rep_number: i + 1 })),
    ...over,
  };
}

function record(id: string, time: number, competitionDate: string, createdAt: string): Row {
  return {
    id, user_id: "user-1", time, style_id: 1, is_relaying: false, created_at: createdAt,
    styles: { distance: 50, style: "Fr" },
    competitions: { date: competitionDate },
  };
}

// 開発機 (日本時間) で走らせると「実行環境のローカル日付」と「日本時間の日付」が常に一致し、
// 作成日を実行環境の日付で出す実装に戻っても赤くならない。このファイルの間だけ日本と日付がずれる
// タイムゾーンにする (Node は process.env.TZ の変更を実行中に反映する。vitest の既定の forks プールが前提で、
// threads プールでは worker の process.env がコピーになり時刻の計算に効かない)
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
});
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

let practiceRows: Row[];
let recordRows: Row[];
let api: GoalAPI;

beforeEach(() => {
  practiceRows = [];
  recordRows = [];
  const supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    from: vi.fn((table: string) => {
      if (table === "practice_logs") return makeFilteringTable(practiceRows)();
      if (table === "records") return makeFilteringTable(recordRows)();
      throw new Error(`unexpected table: ${table}`);
    }),
  };
  api = new GoalAPI(supabase as never);
});

const check = (type: Milestone["type"], params: Record<string, unknown>, over: Partial<Milestone> = {}) =>
  api.checkMilestoneAchievement(milestone(type, params, over));

describe("time 型: マイルストーンを作った後に登録した記録だけで達成になる", () => {
  it("[ユーザー報告の再現] 作る前に登録済みの大会記録 (24.32) と前日の練習 (26.50) では達成にならない", async () => {
    recordRows.push(record("r-old", 24.32, "2026-08-29", "2026-08-25T14:40:47.000Z"));
    practiceRows.push(practiceLog("p-old", "2026-10-14", "2026-10-14T10:00:00.000Z", [26.5]));
    expect((await check("time", TIME_PARAMS)).achieved).toBe(false);
  });

  it("作った日でも、作る前に登録した練習 (朝の練習を入れてから目標を作った) では達成にならない", async () => {
    practiceRows.push(practiceLog("p-morning", "2026-10-15", BEFORE_CREATION, [25.0]));
    expect((await check("time", TIME_PARAMS)).achieved).toBe(false);
  });

  it("作った後に登録した当日の練習で目標タイム以下なら達成", async () => {
    practiceRows.push(
      practiceLog("p-morning", "2026-10-15", BEFORE_CREATION, [25.0]),
      practiceLog("p-new", "2026-10-15", AFTER_CREATION, [26.9]),
    );
    expect(await check("time", TIME_PARAMS)).toMatchObject({ achieved: true, achievementData: { practiceLogId: "p-new" } });
  });

  it("作った日の大会でも、作る前に登録した大会記録では達成にならない", async () => {
    recordRows.push(record("r-morning", 24.0, "2026-10-15", BEFORE_CREATION));
    expect((await check("time", TIME_PARAMS)).achieved).toBe(false);
  });

  it("作った後の大会記録で目標タイム以下なら達成", async () => {
    recordRows.push(
      record("r-old", 24.32, "2026-08-29", "2026-08-25T14:40:47.000Z"),
      record("r-new", 26.5, "2026-10-20", "2026-10-20T09:00:00.000Z"),
    );
    expect(await check("time", TIME_PARAMS)).toMatchObject({ achieved: true, achievementData: { recordId: "r-new" } });
  });

  it("作った後に取り込んだ昔の記録 (練習日・大会日が作成日より前) は数えない", async () => {
    practiceRows.push(practiceLog("p-backfill", "2026-09-01", AFTER_CREATION, [25.0]));
    recordRows.push(record("r-backfill", 24.0, "2026-09-01", AFTER_CREATION));
    expect((await check("time", TIME_PARAMS)).achieved).toBe(false);
  });

  it("0 秒の練習タイム・大会記録では達成にならない", async () => {
    practiceRows.push(practiceLog("p-zero", "2026-10-15", AFTER_CREATION, [0]));
    recordRows.push(record("r-zero", 0, "2026-10-20", AFTER_CREATION));
    expect((await check("time", TIME_PARAMS)).achieved).toBe(false);
  });

  // web の /goals はサーバー (Cloudflare Workers = UTC) でも判定する。日本時間の朝に作ったとき、
  // サーバーで日付だけを比べると前日の記録が数えられていた (Reviewer High)
  it("日本時間の朝 (UTC では前日) に作っても、前日に登録済みの記録は数えず、作った後の記録は数える", async () => {
    const jstMorning = { created_at: "2026-10-14T21:30:00.000Z" } as Partial<Milestone>; // = 10/15 06:30 JST
    practiceRows.push(practiceLog("p-yesterday", "2026-10-14", "2026-10-14T10:00:00.000Z", [25.0]));
    recordRows.push(record("r-yesterday", 24.0, "2026-10-14", "2026-10-14T11:00:00.000Z"));
    expect((await check("time", TIME_PARAMS, jstMorning)).achieved).toBe(false);

    practiceRows.push(practiceLog("p-after", "2026-10-15", "2026-10-14T23:00:00.000Z", [26.0]));
    expect(await check("time", TIME_PARAMS, jstMorning)).toMatchObject({
      achieved: true,
      achievementData: { practiceLogId: "p-after" },
    });
  });

  // 日曜の大会のあと、月曜の朝 (UTC では日曜) に次の目標を作り、月曜の夜に日曜の結果を登録する (Reviewer 2周目)
  it("作る前日の大会・練習の結果を、作った後に登録しても数えない (日本時間の作成日で比べる)", async () => {
    const mondayMorning = { created_at: "2026-10-11T22:00:00.000Z" } as Partial<Milestone>; // = 10/12 (月) 07:00 JST
    recordRows.push(record("r-sunday", 24.0, "2026-10-11", "2026-10-12T12:00:00.000Z"));
    practiceRows.push(practiceLog("p-sunday", "2026-10-11", "2026-10-12T12:00:00.000Z", [25.0]));
    expect((await check("time", TIME_PARAMS, mondayMorning)).achieved).toBe(false);
  });
});

describe("reps_time 型 (1セット)", () => {
  const fast = [28, 28, 28, 28, 28, 28];

  it("作る前に登録した練習では達成にならず、作った後に登録した練習で達成になる", async () => {
    practiceRows.push(practiceLog("p-old", "2026-10-14", "2026-10-14T10:00:00.000Z", fast));
    expect((await check("reps_time", REPS_PARAMS)).achieved).toBe(false);

    practiceRows.push(practiceLog("p-new", "2026-10-15", AFTER_CREATION, fast));
    expect(await check("reps_time", REPS_PARAMS)).toMatchObject({
      achieved: true,
      achievementData: { practiceLogId: "p-new" },
    });
  });

  it("作った日の練習でも、作る前に登録したものでは達成にならない", async () => {
    practiceRows.push(practiceLog("p-morning", "2026-10-15", BEFORE_CREATION, fast));
    expect((await check("reps_time", REPS_PARAMS)).achieved).toBe(false);
  });

  it("作った後に登録しても、練習日が作成日より前なら達成にならない", async () => {
    practiceRows.push(practiceLog("p-backfill", "2026-10-14", AFTER_CREATION, fast));
    expect((await check("reps_time", REPS_PARAMS)).achieved).toBe(false);
  });

  it("0 秒の本は平均に入れない (入れると平均 26.67 で達成になってしまう)", async () => {
    practiceRows.push(practiceLog("p-zero", "2026-10-15", AFTER_CREATION, [0, 32, 32, 32, 32, 32]));
    expect((await check("reps_time", REPS_PARAMS)).achieved).toBe(false);
  });
});

describe("set 型", () => {
  it("作った日の練習でも、作る前に登録したものでは達成にならない", async () => {
    practiceRows.push(practiceLog("p-morning", "2026-10-15", BEFORE_CREATION, [], { rep_count: 6, set_count: 1 }));
    expect((await check("set", SET_PARAMS)).achieved).toBe(false);
  });

  it("作った後に登録しても、練習日が作成日より前なら達成にならない", async () => {
    practiceRows.push(practiceLog("p-backfill", "2026-10-14", AFTER_CREATION, [], { rep_count: 6, set_count: 1 }));
    expect((await check("set", SET_PARAMS)).achieved).toBe(false);
  });

  it("作る前に登録した練習では達成にならず、作った後に登録した練習で達成になる", async () => {
    practiceRows.push(practiceLog("p-old", "2026-10-14", "2026-10-14T10:00:00.000Z", [], { rep_count: 6, set_count: 1 }));
    expect((await check("set", SET_PARAMS)).achieved).toBe(false);

    practiceRows.push(practiceLog("p-new", "2026-10-20", "2026-10-20T09:00:00.000Z", [], { rep_count: 6, set_count: 1 }));
    expect(await check("set", SET_PARAMS)).toMatchObject({
      achieved: true,
      achievementData: { practiceLogId: "p-new" },
    });
  });
});

describe("進行中 (in_progress) への遷移も、作った後に登録した記録だけを見る", () => {
  async function runStatusUpdate(m: Milestone) {
    const update = vi.spyOn(api, "updateMilestoneStatus").mockResolvedValue({ ...m, status: "in_progress" });
    // updateAllMilestoneStatuses の取得部分を飛ばし、1件分の処理 (判定 → 進行中) を通す
    const internal = api as unknown as {
      processMilestoneStatusUpdate: (userId: string, milestone: Milestone, today: string) => Promise<void>;
    };
    await internal.processMilestoneStatusUpdate("user-1", m, "2026-10-15");
    return update;
  }
  const old = "2026-10-14T10:00:00.000Z";

  it.each([
    ["time (大会記録だけ)", "time", TIME_PARAMS, () => recordRows.push(record("r-old", 30.0, "2026-10-14", old))],
    ["time (練習だけ)", "time", TIME_PARAMS, () => practiceRows.push(practiceLog("p-old", "2026-10-14", old, [30.0]))],
    ["reps_time", "reps_time", REPS_PARAMS, () => practiceRows.push(practiceLog("p-old", "2026-10-14", old, [35, 35, 35, 35, 35, 35]))],
    ["set", "set", { ...SET_PARAMS, sets: 2 }, () => practiceRows.push(practiceLog("p-old", "2026-10-14", old, [], { rep_count: 6, set_count: 3 }))],
  ] as const)("%s: 作る前に登録した記録しか無ければ not_started のまま", async (_label, type, params, seed) => {
    seed();
    const update = await runStatusUpdate(milestone(type, params));
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ["time (大会記録だけ)", "time", TIME_PARAMS, () => recordRows.push(record("r-bf", 30.0, "2026-10-14", AFTER_CREATION))],
    ["time (練習だけ)", "time", TIME_PARAMS, () => practiceRows.push(practiceLog("p-bf", "2026-10-14", AFTER_CREATION, [30.0]))],
    ["reps_time", "reps_time", REPS_PARAMS, () => practiceRows.push(practiceLog("p-bf", "2026-10-14", AFTER_CREATION, [35, 35, 35, 35, 35, 35]))],
    ["set", "set", { ...SET_PARAMS, sets: 2 }, () => practiceRows.push(practiceLog("p-bf", "2026-10-14", AFTER_CREATION, [], { rep_count: 6, set_count: 3 }))],
  ] as const)("%s: 作った後に登録しても、日付が作成日より前の記録しか無ければ not_started のまま", async (_label, type, params, seed) => {
    seed();
    const update = await runStatusUpdate(milestone(type, params));
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ["time (大会記録だけ)", "time", TIME_PARAMS, () => recordRows.push(record("r-am", 30.0, "2026-10-15", BEFORE_CREATION))],
    ["time (練習だけ)", "time", TIME_PARAMS, () => practiceRows.push(practiceLog("p-am", "2026-10-15", BEFORE_CREATION, [30.0]))],
    ["reps_time", "reps_time", REPS_PARAMS, () => practiceRows.push(practiceLog("p-am", "2026-10-15", BEFORE_CREATION, [35, 35, 35, 35, 35, 35]))],
    ["set", "set", { ...SET_PARAMS, sets: 2 }, () => practiceRows.push(practiceLog("p-am", "2026-10-15", BEFORE_CREATION, [], { rep_count: 6, set_count: 3 }))],
  ] as const)("%s: 作った日でも、作る前に登録した記録しか無ければ not_started のまま", async (_label, type, params, seed) => {
    seed();
    const update = await runStatusUpdate(milestone(type, params));
    expect(update).not.toHaveBeenCalled();
  });

  it("time: 作った後に未達のタイムを登録したら in_progress になる", async () => {
    practiceRows.push(practiceLog("p-new", "2026-10-15", AFTER_CREATION, [30.0]));
    const update = await runStatusUpdate(milestone("time", TIME_PARAMS));
    expect(update).toHaveBeenCalledWith("ms-1", "in_progress");
  });
});

describe("created_at が null の行でも落ちない", () => {
  it("今を基準にするので、過去に登録された記録では達成にならない", async () => {
    recordRows.push(record("r-old", 24.32, "2026-08-29", "2026-08-25T14:40:47.000Z"));
    await expect(check("time", TIME_PARAMS, { created_at: null as unknown as string })).resolves.toMatchObject({
      achieved: false,
    });
  });
});
