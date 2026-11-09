// 週次利用レポートの Edge Function ハンドラのテスト。
//
// 仕様: docs/specs/weekly-usage-report.md の「Edge Function の入出力」と成功条件 15〜17。
// revenucat-webhook-handler.test.ts と同じく `globalThis.fetch` を差し替えて、
// Supabase (PostgREST の RPC) と Resend の両方を横取りし、ハンドラ全体を通した振る舞いとして検証する。
// ハンドラは env の読み取りと Supabase クライアントの作成をリクエストごとに行う前提
// (テストはモジュールの読み込み後に env を差し替えるため)。
//
// 実行方法:
//   cd swim-hub && DENO_NO_PACKAGE_JSON=1 deno test --allow-env --allow-net --cached-only --frozen \
//     supabase/functions/_shared/weekly-report-handler.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createWeeklyReportHandler } from "./weekly-report-handler.ts";
import { formatWeeklyReport, type WeeklyReportPayload } from "./weekly-report-format.ts";

const CRON_SECRET = "test-weekly-report-cron-secret";
const SERVICE_ROLE_KEY = "test-service-role-key";
const RESEND_URL = "https://api.resend.com/emails";
const GENERATE_PATH = "/rest/v1/rpc/generate_weekly_usage_report";
const MARK_PATH = "/rest/v1/rpc/mark_weekly_usage_report_sent";

const BASE_ENV: Record<string, string | undefined> = {
  WEEKLY_REPORT_CRON_SECRET: CRON_SECRET,
  SUPABASE_URL: "https://example-project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  RESEND_API_KEY: "re_test_key",
  WEEKLY_REPORT_EMAIL: "weekly@example.com",
  BILLING_NOTIFY_EMAIL: "billing@example.com",
};

function withEnv(vars: Record<string, string | undefined>): () => void {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    previous[key] = Deno.env.get(key);
  }
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  };
}

function makeReport(overrides: Partial<WeeklyReportPayload> = {}): WeeklyReportPayload {
  return {
    // 週は JST の土曜〜金曜
    week_start: "2026-10-31",
    period_start: "2026-10-30T15:00:00+00:00",
    period_end: "2026-11-06T15:00:00+00:00",
    generated_at: "2026-11-06T22:00:05+00:00",
    metrics: {
      "account.users_new": 12,
      "account.active_users": 30,
      "practice.personal_practices": 5,
      "billing.premium_total.stripe": 2,
      "funnel.cohort_size": 10,
      "funnel.practice": 3,
    },
    uncategorized_tables: [],
    email_sent_at: null,
    previous_metrics: { "account.users_new": 10 },
    previous_email_sent_at: "2026-11-02T00:00:07+00:00",
    ...overrides,
  };
}

interface ResendCall {
  headers: Headers;
  body: { from: string; to: string; subject: string; text: string };
  signal: AbortSignal | null | undefined;
}

interface RpcCall {
  body: Record<string, unknown>;
  headers: Headers;
}

interface FetchMockOptions {
  /** generate の返り値。省略時は makeReport() (week_start は引数があればそれに合わせる) */
  report?: (args: Record<string, unknown>) => WeeklyReportPayload;
  /** generate の応答そのものを差し替える (エラー応答など) */
  onGenerate?: () => Response;
  onMark?: () => Response;
  onResend?: (signal: AbortSignal | null | undefined) => Response | Promise<Response>;
}

function installFetchMock(opts: FetchMockOptions = {}) {
  const original = globalThis.fetch;
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  const state = {
    generateCalls: [] as RpcCall[],
    markCalls: [] as RpcCall[],
    resendCalls: [] as ResendCall[],
    // 呼び出しの順序 ("generate" | "resend" | "mark")
    sequence: [] as string[],
  };

  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);

    if (req.url === RESEND_URL) {
      const signal = init?.signal;
      state.resendCalls.push({ headers: req.headers, body: JSON.parse(await req.text()), signal });
      state.sequence.push("resend");
      if (opts.onResend) return await opts.onResend(signal);
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }

    if (url.pathname === GENERATE_PATH && req.method === "POST") {
      const text = await req.text();
      const body = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
      state.generateCalls.push({ body, headers: req.headers });
      state.sequence.push("generate");
      if (opts.onGenerate) return opts.onGenerate();
      const report = opts.report?.(body) ??
        makeReport(typeof body.p_week_start === "string" ? { week_start: body.p_week_start } : {});
      return new Response(JSON.stringify(report), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === MARK_PATH && req.method === "POST") {
      const text = await req.text();
      state.markCalls.push({ body: (text ? JSON.parse(text) : {}) as Record<string, unknown>, headers: req.headers });
      state.sequence.push("mark");
      return opts.onMark?.() ?? new Response(null, { status: 204 });
    }

    throw new Error(`Unexpected fetch: ${req.method} ${req.url}`);
  }) as typeof fetch;

  return {
    ...state,
    restore: () => {
      globalThis.fetch = original;
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

function makeRequest(opts: { method?: string; auth?: string | null; body?: unknown; rawBody?: string } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const auth = opts.auth === undefined ? `Bearer ${CRON_SECRET}` : opts.auth;
  if (auth !== null) headers.authorization = auth;
  const method = opts.method ?? "POST";
  const body = opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
  return new Request("https://example-project.supabase.co/functions/v1/weekly-report", {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : body,
  });
}

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ code, message: `error ${code}`, details: null, hint: null }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const handler = createWeeklyReportHandler();

// 現在時刻を固定する (std の FakeTime は deno.lock に無いので使わない)。
// 引数なしの new Date() と Date.now() だけを固定し、引数ありの new Date(x) はそのまま通す
function withFixedNow(iso: string): () => void {
  const RealDate = Date;
  const fixed = new RealDate(iso).getTime();
  class FixedDate extends RealDate {
    constructor(value?: number | string | Date) {
      if (value === undefined) super(fixed);
      else super(value);
    }
    static override now(): number {
      return fixed;
    }
  }
  globalThis.Date = FixedDate as DateConstructor;
  return () => {
    globalThis.Date = RealDate;
  };
}

// 土曜 07:00 JST (= 金曜 22:00 UTC。cron の実行時刻)。JST の今日は 2026-11-07 (土)、UTC の日付はまだ 11-06
const SAT_0700_JST = "2026-11-06T22:00:00Z";
// 金曜 23:59:59 JST。JST の今日は 2026-11-06 (金) で、10-31 の週はまだ終わっていない
const FRI_2359_JST = "2026-11-06T14:59:59Z";

async function run(
  req: Request,
  env: Record<string, string | undefined> = BASE_ENV,
  opts: FetchMockOptions = {},
) {
  const restoreEnv = withEnv(env);
  const mock = installFetchMock(opts);
  try {
    const res = await handler(req);
    const text = await res.text();
    let json: unknown = undefined;
    try {
      json = JSON.parse(text);
    } catch {
      // 400/401/405 の body の形は仕様に無い
    }
    return { res, json, mock };
  } finally {
    mock.restore();
    restoreEnv();
  }
}

// --- メソッドと認証 (成功条件 15) ---

for (const method of ["GET", "PUT", "DELETE", "OPTIONS"]) {
  Deno.test(`${method} は認証が正しくても 405 で、RPC も Resend も呼ばない`, async () => {
    const { res, mock } = await run(makeRequest({ method }));
    assertEquals(res.status, 405);
    assertEquals(mock.generateCalls.length, 0);
    assertEquals(mock.resendCalls.length, 0);
  });
}

const BAD_AUTH: ReadonlyArray<readonly [string, string | null]> = [
  ["Authorization ヘッダが無い", null],
  ["secret が違う", "Bearer wrong-secret"],
  ["同じ長さで1文字違う", `Bearer ${CRON_SECRET.slice(0, -1)}X`],
  ["secret の後ろに余計な文字", `Bearer ${CRON_SECRET}x`],
  ["Bearer が無い", CRON_SECRET],
  ["Bearer の後ろが空", "Bearer "],
];

for (const [label, auth] of BAD_AUTH) {
  Deno.test(`認証値が不正 (${label}) なら 401 で、RPC も Resend も呼ばない`, async () => {
    const { res, mock } = await run(makeRequest({ auth, body: { week_start: "2026-10-31" } }));
    assertEquals(res.status, 401);
    assertEquals(mock.generateCalls.length, 0);
    assertEquals(mock.markCalls.length, 0);
    assertEquals(mock.resendCalls.length, 0);
  });
}

for (const auth of ["Bearer ", "Bearer undefined", "Bearer null"]) {
  Deno.test(`WEEKLY_REPORT_CRON_SECRET が未設定なら「${auth}」でも通さず、RPC を呼ばない`, async () => {
    const { res, mock } = await run(makeRequest({ auth }), { ...BASE_ENV, WEEKLY_REPORT_CRON_SECRET: undefined });
    assert(res.status === 401 || res.status === 500, `status=${res.status}`);
    assertEquals(mock.generateCalls.length, 0);
    assertEquals(mock.resendCalls.length, 0);
  });
}

// --- body の検証 (成功条件 15) ---

const BAD_WEEK_STARTS: ReadonlyArray<readonly [string, unknown]> = [
  ["土曜でない (月曜)", "2026-11-02"],
  ["土曜でない (金曜)", "2026-11-06"],
  ["区切りがスラッシュ", "2026/10/31"],
  ["ゼロ埋めなし (2026-10-03 は土曜)", "2026-10-3"],
  ["区切りなし", "20261031"],
  ["存在しない日付 (Date だと 2025-03-01 の土曜に繰り上がる)", "2025-02-29"],
  ["空文字", ""],
  ["数値", 20261031],
  ["未来の土曜", "2099-01-03"],
];

for (const [label, weekStart] of BAD_WEEK_STARTS) {
  Deno.test(`week_start が不正 (${label}) なら 400 で、RPC を呼ばない`, async () => {
    const { res, mock } = await run(makeRequest({ body: { week_start: weekStart } }));
    assertEquals(res.status, 400);
    assertEquals(mock.generateCalls.length, 0);
    assertEquals(mock.resendCalls.length, 0);
  });
}

// 「まだ終わっていない週」は week_start + 7日 > JST の今日。時刻を固定して境界を確かめる
const WEEK_END_CASES: ReadonlyArray<readonly [string, string, string, number]> = [
  ["土曜 07:00 JST に、前日の金曜で終わった週 (week_start + 7日 = 今日)", SAT_0700_JST, "2026-10-31", 200],
  ["土曜 07:00 JST に、今日始まった週 (進行中)", SAT_0700_JST, "2026-11-07", 400],
  ["金曜 23:59 JST に、その日で終わる週 (まだ進行中)", FRI_2359_JST, "2026-10-31", 400],
  ["金曜 23:59 JST に、前の週", FRI_2359_JST, "2026-10-24", 200],
];

for (const [label, now, weekStart, status] of WEEK_END_CASES) {
  Deno.test(`${label}: week_start=${weekStart} は ${status}`, async () => {
    const restoreNow = withFixedNow(now);
    try {
      const { res, mock } = await run(makeRequest({ body: { week_start: weekStart } }));
      assertEquals(res.status, status);
      assertEquals(mock.generateCalls.length, status === 200 ? 1 : 0);
      if (status === 200) assertEquals(mock.generateCalls[0]!.body, { p_week_start: weekStart });
    } finally {
      restoreNow();
    }
  });
}

for (const [label, force] of [["文字列", "true"], ["数値", 1], ["null", null]] as const) {
  Deno.test(`force が boolean でない (${label}) なら 400 で、RPC を呼ばない`, async () => {
    const { res, mock } = await run(makeRequest({ body: { week_start: "2026-10-31", force } }));
    assertEquals(res.status, 400);
    assertEquals(mock.generateCalls.length, 0);
    assertEquals(mock.resendCalls.length, 0);
  });
}

Deno.test("body が JSON として壊れていれば 400 で、RPC を呼ばない", async () => {
  const { res, mock } = await run(makeRequest({ rawBody: "{not json" }));
  assertEquals(res.status, 400);
  assertEquals(mock.generateCalls.length, 0);
});

// --- RPC の呼び方 ---

Deno.test("week_start を指定すると generate に p_week_start として渡し、service_role で呼ぶ", async () => {
  const { res, mock } = await run(makeRequest({ body: { week_start: "2026-10-31" } }));
  assertEquals(res.status, 200);
  assertEquals(mock.generateCalls.length, 1);
  assertEquals(mock.generateCalls[0]!.body, { p_week_start: "2026-10-31" });
  assertEquals(mock.generateCalls[0]!.headers.get("apikey"), SERVICE_ROLE_KEY);
});

for (const [label, body] of [["body なし", undefined], ["空のオブジェクト", {}]] as const) {
  Deno.test(`${label}なら p_week_start は null (既定の週は DB 側で決める)`, async () => {
    const { res, mock } = await run(makeRequest({ body }));
    assertEquals(res.status, 200);
    assertEquals(mock.generateCalls.length, 1);
    assertEquals(mock.generateCalls[0]!.body, { p_week_start: null });
  });
}

Deno.test("既定の週で実行したとき、mark には generate が返した week_start を渡し、応答にも返す", async () => {
  const { res, json, mock } = await run(makeRequest(), BASE_ENV, {
    report: () => makeReport({ week_start: "2026-10-24" }),
  });
  assertEquals(res.status, 200);
  assertEquals(mock.markCalls.length, 1);
  assertEquals(mock.markCalls[0]!.body, { p_week_start: "2026-10-24" });
  assertEquals(json, { week_start: "2026-10-24", sent: true });
});

Deno.test("generate がエラーを返したら 500 で、送らず mark も呼ばない", async () => {
  const { res, mock } = await run(makeRequest({ body: { week_start: "2026-10-31" } }), BASE_ENV, {
    onGenerate: () => jsonError(500, "XX000"),
  });
  assertEquals(res.status, 500);
  assertEquals(mock.resendCalls.length, 0);
  assertEquals(mock.markCalls.length, 0);
});

// --- Resend (成功条件 16) ---

Deno.test("Resend を既存の課金通知と同じ形で1回呼び、成功したら mark を呼んで sent: true を返す", async () => {
  const report = makeReport();
  const { res, json, mock } = await run(makeRequest({ body: { week_start: "2026-10-31" } }), BASE_ENV, {
    report: () => report,
  });
  assertEquals(res.status, 200);
  assertEquals(json, { week_start: "2026-10-31", sent: true });
  assertEquals(mock.resendCalls.length, 1);

  const call = mock.resendCalls[0]!;
  assertEquals(call.headers.get("authorization"), "Bearer re_test_key");
  assert(call.headers.get("content-type")?.startsWith("application/json"), call.headers.get("content-type") ?? "");
  assertEquals(call.body.from, "SwimHub <noreply@swim-hub.app>");
  assertEquals(call.body.to, "weekly@example.com");
  const expected = formatWeeklyReport(report);
  assertEquals(call.body.subject, expected.subject);
  assertEquals(call.body.subject, "【週次レポート】2026/10/31〜11/06 の利用状況");
  assertEquals(call.body.text, expected.text);
  assert(call.signal instanceof AbortSignal, "Resend 呼び出しにタイムアウトが付いていない");

  assertEquals(mock.markCalls.length, 1);
  assertEquals(mock.markCalls[0]!.body, { p_week_start: "2026-10-31" });
  assertEquals(mock.markCalls[0]!.headers.get("apikey"), SERVICE_ROLE_KEY);
  assertEquals(mock.sequence, ["generate", "resend", "mark"]);
});

for (const [label, weekly] of [["未設定", undefined], ["空文字", ""]] as const) {
  Deno.test(`WEEKLY_REPORT_EMAIL が${label}なら BILLING_NOTIFY_EMAIL に送る`, async () => {
    const { res, mock } = await run(makeRequest(), { ...BASE_ENV, WEEKLY_REPORT_EMAIL: weekly });
    assertEquals(res.status, 200);
    assertEquals(mock.resendCalls.length, 1);
    assertEquals(mock.resendCalls[0]!.body.to, "billing@example.com");
    assertEquals(mock.markCalls.length, 1);
  });
}

const NOT_CONFIGURED: ReadonlyArray<readonly [string, Record<string, string | undefined>]> = [
  ["宛先が2つとも未設定", { WEEKLY_REPORT_EMAIL: undefined, BILLING_NOTIFY_EMAIL: undefined }],
  ["RESEND_API_KEY が未設定", { RESEND_API_KEY: undefined }],
];

for (const [label, override] of NOT_CONFIGURED) {
  Deno.test(`${label}なら、集計 (保存) だけして送らず、mark も呼ばない`, async () => {
    const { res, json, mock } = await run(makeRequest({ body: { week_start: "2026-10-31" } }), {
      ...BASE_ENV,
      ...override,
    });
    assertEquals(res.status, 200);
    assertEquals(mock.generateCalls.length, 1);
    assertEquals(mock.resendCalls.length, 0);
    assertEquals(mock.markCalls.length, 0);
    assertEquals(json, { week_start: "2026-10-31", sent: false, reason: "not_configured" });
  });
}

// --- 送信失敗と再送 (成功条件 17) ---

for (const status of [400, 429, 500]) {
  Deno.test(`Resend が ${status} を返したら mark を呼ばず、sent: false で 502 を返す`, async () => {
    const { res, json, mock } = await run(makeRequest({ body: { week_start: "2026-10-31" } }), BASE_ENV, {
      onResend: () => new Response("error", { status }),
    });
    assertEquals(res.status, 502);
    assertEquals(mock.resendCalls.length, 1);
    assertEquals(mock.markCalls.length, 0);
    assertEquals(json, { week_start: "2026-10-31", sent: false, reason: "send_failed" });
  });
}

Deno.test("Resend への fetch が例外を投げたら mark を呼ばず、sent: false で 502 を返す", async () => {
  const { res, json, mock } = await run(makeRequest({ body: { week_start: "2026-10-31" } }), BASE_ENV, {
    onResend: () => {
      throw new TypeError("network down");
    },
  });
  assertEquals(res.status, 502);
  assertEquals(mock.markCalls.length, 0);
  assertEquals(json, { week_start: "2026-10-31", sent: false, reason: "send_failed" });
});

Deno.test("Resend が応答しなければ約5秒で打ち切り、mark を呼ばない", async () => {
  // signal が abort されたら reject する。signal が無い (タイムアウト未設定) 実装でもテストが
  // 止まらないよう、9秒で自分から reject する
  const started = Date.now();
  const { res, json, mock } = await run(makeRequest({ body: { week_start: "2026-10-31" } }), BASE_ENV, {
    onResend: (signal) =>
      new Promise<Response>((_resolve, reject) => {
        const guard = setTimeout(() => reject(new Error("no timeout on Resend call")), 9000);
        signal?.addEventListener("abort", () => {
          clearTimeout(guard);
          reject(signal.reason);
        });
      }),
  });
  const elapsed = Date.now() - started;
  assertEquals(res.status, 502);
  assertEquals(mock.markCalls.length, 0);
  assertEquals(json, { week_start: "2026-10-31", sent: false, reason: "send_failed" });
  assert(elapsed >= 4500 && elapsed < 8000, `打ち切りまで ${elapsed}ms (5秒の AbortSignal.timeout を期待)`);
});

Deno.test("送信には成功して mark が失敗したら 500 を返す (送信は1回だけ)", async () => {
  const { res, mock } = await run(makeRequest({ body: { week_start: "2026-10-31" } }), BASE_ENV, {
    onMark: () => jsonError(500, "XX000"),
  });
  assertEquals(res.status, 500);
  assertEquals(mock.resendCalls.length, 1);
  assertEquals(mock.markCalls.length, 1);
});

Deno.test("送信済みの週は、force が無ければ集計だけして再送しない", async () => {
  const { res, json, mock } = await run(makeRequest({ body: { week_start: "2026-10-31" } }), BASE_ENV, {
    report: () => makeReport({ email_sent_at: "2026-11-09T00:00:06+00:00" }),
  });
  assertEquals(res.status, 200);
  assertEquals(mock.generateCalls.length, 1);
  assertEquals(mock.resendCalls.length, 0);
  assertEquals(mock.markCalls.length, 0);
  assertEquals(json, { week_start: "2026-10-31", sent: false, reason: "already_sent" });
});

Deno.test("送信済みの週でも force: false なら再送しない", async () => {
  const { json, mock } = await run(makeRequest({ body: { week_start: "2026-10-31", force: false } }), BASE_ENV, {
    report: () => makeReport({ email_sent_at: "2026-11-09T00:00:06+00:00" }),
  });
  assertEquals(mock.resendCalls.length, 0);
  assertEquals(json, { week_start: "2026-10-31", sent: false, reason: "already_sent" });
});

Deno.test("送信済みの週でも force: true なら再送し、mark を呼ぶ", async () => {
  const { res, json, mock } = await run(makeRequest({ body: { week_start: "2026-10-31", force: true } }), BASE_ENV, {
    report: () => makeReport({ email_sent_at: "2026-11-09T00:00:06+00:00" }),
  });
  assertEquals(res.status, 200);
  assertEquals(mock.resendCalls.length, 1);
  assertEquals(mock.markCalls.length, 1);
  assertEquals(json, { week_start: "2026-10-31", sent: true });
});
