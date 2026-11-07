// RevenueCat webhook の課金通知メール (Resend) と重複判定のキー (event.id) のテスト。
//
// ハンドラ内部の関数は export していないため、`globalThis.fetch` を差し替えて
// Supabase (PostgREST) と Resend の両方を横取りし、ハンドラ全体を通した振る舞いとして検証する。
//
// 実行方法:
//   cd swim-hub && deno test --allow-env --allow-net --allow-read \
//     supabase/functions/_shared/revenucat-webhook-handler.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createRevenueCatWebhookHandler } from "./revenucat-webhook-handler.ts";

const WEBHOOK_AUTH = "test-rc-webhook-auth";
const RESEND_URL = "https://api.resend.com/emails";

const BASE_ENV: Record<string, string> = {
  REVENUCAT_WEBHOOK_AUTH: WEBHOOK_AUTH,
  SUPABASE_URL: "https://example-project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  RESEND_API_KEY: "re_test_key",
  BILLING_NOTIFY_EMAIL: "owner@example.com",
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

interface ResendCall {
  headers: Headers;
  body: { from: string; to: string; subject: string; text: string };
  signal: AbortSignal | null | undefined;
}

interface FetchMockOptions {
  /** processed_webhook_events への INSERT の応答。省略時は event_id の主キー制約を再現する */
  onMarkProcessed?: () => Response;
  /** user_subscriptions の SELECT (.single()) の応答 */
  onSelectSubscription?: () => Response;
  /** user_subscriptions の PATCH の応答 */
  onUpdateSubscription?: () => Response;
  /** Resend の応答 */
  onResend?: () => Response | Promise<Response>;
}

function installFetchMock(opts: FetchMockOptions = {}): {
  resendCalls: ResendCall[];
  updateCalls: number;
  insertedEventIds: string[];
  restore: () => void;
} {
  const original = globalThis.fetch;
  const originalLog = console.log;
  const originalError = console.error;
  // ハンドラは正常系でも console.log、エラー経路では console.error を出すので黙らせる
  console.log = () => {};
  console.error = () => {};
  const state = { resendCalls: [] as ResendCall[], updateCalls: 0, insertedEventIds: [] as string[] };

  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const url = new URL(req.url);

    if (req.url === RESEND_URL) {
      state.resendCalls.push({
        headers: req.headers,
        body: JSON.parse(await req.text()),
        signal: init?.signal,
      });
      return opts.onResend?.() ?? new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
    }

    if (url.pathname === "/rest/v1/processed_webhook_events" && req.method === "POST") {
      const { event_id } = JSON.parse(await req.text()) as { event_id: string };
      if (opts.onMarkProcessed) return opts.onMarkProcessed();
      if (state.insertedEventIds.includes(event_id)) return jsonError(409, "23505");
      state.insertedEventIds.push(event_id);
      return new Response(null, { status: 201 });
    }

    if (url.pathname === "/rest/v1/user_subscriptions" && req.method === "GET") {
      return (
        opts.onSelectSubscription?.() ??
        new Response(JSON.stringify({ provider: "revenucat", status: "expired" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    if (url.pathname === "/rest/v1/user_subscriptions" && req.method === "PATCH") {
      state.updateCalls++;
      return opts.onUpdateSubscription?.() ?? new Response(null, { status: 204 });
    }

    throw new Error(`Unexpected fetch: ${req.method} ${req.url}`);
  }) as typeof fetch;

  return {
    get resendCalls() {
      return state.resendCalls;
    },
    get updateCalls() {
      return state.updateCalls;
    },
    get insertedEventIds() {
      return state.insertedEventIds;
    },
    restore: () => {
      globalThis.fetch = original;
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "evt_1",
    type: "INITIAL_PURCHASE",
    app_user_id: "11111111-2222-3333-4444-555555555555",
    product_id: "swimhub_premium_monthly",
    app_id: "app_rc_test_1",
    entitlement_ids: ["premium"],
    period_type: "NORMAL",
    purchased_at_ms: 1_762_000_000_000,
    expiration_at_ms: 1_764_592_000_000,
    store: "APP_STORE",
    environment: "PRODUCTION",
    original_transaction_id: "txn_original_1",
    transaction_id: "txn_1",
    price_in_purchased_currency: 480,
    currency: "JPY",
    ...overrides,
  };
}

function makeRequest(event: Record<string, unknown>): Request {
  return new Request("https://example-project.supabase.co/functions/v1/revenucat-webhook", {
    method: "POST",
    headers: { authorization: `Bearer ${WEBHOOK_AUTH}`, "content-type": "application/json" },
    body: JSON.stringify({ api_version: "1.0", event }),
  });
}

function jsonError(status: number, code: string): Response {
  return new Response(JSON.stringify({ code, message: `error ${code}`, details: null, hint: null }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const handler = createRevenueCatWebhookHandler("swim-hub");

Deno.test("INITIAL_PURCHASE (本番 / iOS) が DB 更新に成功したら Resend に1通送る", async () => {
  const restoreEnv = withEnv(BASE_ENV);
  const mock = installFetchMock();
  try {
    const res = await handler(makeRequest(makeEvent()));
    assertEquals(res.status, 200);
    assertEquals(mock.updateCalls, 1);
    assertEquals(mock.resendCalls.length, 1);

    const call = mock.resendCalls[0]!;
    assertEquals(call.headers.get("authorization"), "Bearer re_test_key");
    assertEquals(call.body.to, "owner@example.com");
    assertEquals(call.body.from, "SwimHub <noreply@swim-hub.app>");
    assertEquals(call.body.subject, "【課金】[iOS] 新規購入 swimhub_premium_monthly");
    assert(call.body.text.includes("ユーザーID: 11111111-2222-3333-4444-555555555555"));
    assert(call.body.text.includes("金額: 480 JPY"));
    assert(call.body.text.includes("RevenueCat app_id: app_rc_test_1"));
    assert(call.body.text.includes("有効期限 (UTC): 2025-12-01T12:26:40.000Z"));
    assert(call.signal instanceof AbortSignal, "Resend 呼び出しにタイムアウトが付いていない");
  } finally {
    mock.restore();
    restoreEnv();
  }
});

Deno.test("SANDBOX / Android の CANCELLATION は件名に [SANDBOX] と Android が付く", async () => {
  const restoreEnv = withEnv(BASE_ENV);
  const mock = installFetchMock();
  try {
    const res = await handler(
      makeRequest(makeEvent({ type: "CANCELLATION", store: "PLAY_STORE", environment: "SANDBOX" })),
    );
    assertEquals(res.status, 200);
    assertEquals(mock.resendCalls.length, 1);
    assertEquals(mock.resendCalls[0]!.body.subject, "[SANDBOX] 【課金】[Android] 解約 swimhub_premium_monthly");
  } finally {
    mock.restore();
    restoreEnv();
  }
});

Deno.test("金額・app_id が無いイベントは '-' と表示する", async () => {
  const restoreEnv = withEnv(BASE_ENV);
  const mock = installFetchMock();
  try {
    const event = makeEvent({ type: "EXPIRATION" });
    delete event.price_in_purchased_currency;
    delete event.currency;
    delete event.app_id;
    const res = await handler(makeRequest(event));
    assertEquals(res.status, 200);
    assertEquals(mock.resendCalls.length, 1);
    assert(mock.resendCalls[0]!.body.text.includes("金額: -"));
    assert(mock.resendCalls[0]!.body.text.includes("RevenueCat app_id: -"));
  } finally {
    mock.restore();
    restoreEnv();
  }
});

Deno.test("処理済み (23505) のイベントでは送らない", async () => {
  const restoreEnv = withEnv(BASE_ENV);
  const mock = installFetchMock({ onMarkProcessed: () => jsonError(409, "23505") });
  try {
    const res = await handler(makeRequest(makeEvent()));
    assertEquals(res.status, 200);
    assertEquals(mock.updateCalls, 0);
    assertEquals(mock.resendCalls.length, 0);
  } finally {
    mock.restore();
    restoreEnv();
  }
});

Deno.test("Stripe 契約中ユーザーの INITIAL_PURCHASE (409) では送らない", async () => {
  const restoreEnv = withEnv(BASE_ENV);
  const mock = installFetchMock({
    onSelectSubscription: () =>
      new Response(JSON.stringify({ provider: "stripe", status: "active" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });
  try {
    const res = await handler(makeRequest(makeEvent()));
    assertEquals(res.status, 409);
    assertEquals(mock.updateCalls, 0);
    assertEquals(mock.resendCalls.length, 0);
  } finally {
    mock.restore();
    restoreEnv();
  }
});

Deno.test("DB 更新に失敗したら送らない", async () => {
  const restoreEnv = withEnv(BASE_ENV);
  const mock = installFetchMock({ onUpdateSubscription: () => jsonError(500, "XX000") });
  try {
    const res = await handler(makeRequest(makeEvent({ type: "RENEWAL" })));
    assertEquals(res.status, 500);
    assertEquals(mock.updateCalls, 1);
    assertEquals(mock.resendCalls.length, 0);
  } finally {
    mock.restore();
    restoreEnv();
  }
});

Deno.test("未対応のイベント種別では送らない", async () => {
  const restoreEnv = withEnv(BASE_ENV);
  const mock = installFetchMock();
  try {
    const res = await handler(makeRequest(makeEvent({ type: "TRANSFER" })));
    assertEquals(res.status, 200);
    assertEquals(mock.updateCalls, 0);
    assertEquals(mock.resendCalls.length, 0);
  } finally {
    mock.restore();
    restoreEnv();
  }
});

for (const missing of ["BILLING_NOTIFY_EMAIL", "RESEND_API_KEY"]) {
  Deno.test(`${missing} が未設定なら送らずに 200 を返す`, async () => {
    const restoreEnv = withEnv({ ...BASE_ENV, [missing]: undefined });
    const mock = installFetchMock();
    try {
      const res = await handler(makeRequest(makeEvent()));
      assertEquals(res.status, 200);
      assertEquals(mock.updateCalls, 1);
      assertEquals(mock.resendCalls.length, 0);
    } finally {
      mock.restore();
      restoreEnv();
    }
  });
}

Deno.test("Resend がエラー応答を返しても webhook は 200 を返す", async () => {
  const restoreEnv = withEnv(BASE_ENV);
  const mock = installFetchMock({ onResend: () => new Response("rate limited", { status: 429 }) });
  try {
    const res = await handler(makeRequest(makeEvent()));
    assertEquals(res.status, 200);
    assertEquals(mock.resendCalls.length, 1);
  } finally {
    mock.restore();
    restoreEnv();
  }
});

Deno.test("Resend への fetch が例外を投げても webhook は 200 を返す", async () => {
  const restoreEnv = withEnv(BASE_ENV);
  const mock = installFetchMock({
    onResend: () => {
      throw new TypeError("network down");
    },
  });
  try {
    const res = await handler(makeRequest(makeEvent()));
    assertEquals(res.status, 200);
    assertEquals(mock.resendCalls.length, 1);
  } finally {
    mock.restore();
    restoreEnv();
  }
});

// --- 重複判定のキー (event.id) ---

Deno.test("重複判定のキーは rc_ + event.id", async () => {
  const restoreEnv = withEnv(BASE_ENV);
  const mock = installFetchMock();
  try {
    const res = await handler(makeRequest(makeEvent({ id: "evt_abc" })));
    assertEquals(res.status, 200);
    assertEquals(mock.insertedEventIds, ["rc_evt_abc"]);
  } finally {
    mock.restore();
    restoreEnv();
  }
});

Deno.test("transaction_id が同じでも id が違う後続イベント (購入→解約) は両方処理して両方通知する", async () => {
  const restoreEnv = withEnv(BASE_ENV);
  const mock = installFetchMock();
  try {
    const purchase = await handler(makeRequest(makeEvent({ id: "evt_purchase" })));
    const cancel = await handler(
      makeRequest(makeEvent({ id: "evt_cancel", type: "CANCELLATION", price_in_purchased_currency: 0 })),
    );
    assertEquals(purchase.status, 200);
    assertEquals(cancel.status, 200);
    assertEquals(await cancel.json(), { received: true });
    assertEquals(mock.updateCalls, 2);
    assertEquals(
      mock.resendCalls.map((c) => c.body.subject),
      ["【課金】[iOS] 新規購入 swimhub_premium_monthly", "【課金】[iOS] 解約 swimhub_premium_monthly"],
    );
  } finally {
    mock.restore();
    restoreEnv();
  }
});

Deno.test("同じ id の再送は処理済みとして DB 更新も通知もしない", async () => {
  const restoreEnv = withEnv(BASE_ENV);
  const mock = installFetchMock();
  try {
    const first = await handler(makeRequest(makeEvent({ id: "evt_retry" })));
    const retry = await handler(makeRequest(makeEvent({ id: "evt_retry" })));
    assertEquals(first.status, 200);
    assertEquals(retry.status, 200);
    assertEquals(await retry.json(), { received: true, message: "Already processed" });
    assertEquals(mock.updateCalls, 1);
    assertEquals(mock.resendCalls.length, 1);
  } finally {
    mock.restore();
    restoreEnv();
  }
});

for (const [label, id] of [["無い", undefined], ["空文字", ""], ["文字列でない", 123]] as const) {
  Deno.test(`event.id が${label}ときは 400 を返し、DB に何も書かない`, async () => {
    const restoreEnv = withEnv(BASE_ENV);
    const mock = installFetchMock();
    try {
      const event = makeEvent({ id });
      if (id === undefined) delete event.id;
      const res = await handler(makeRequest(event));
      assertEquals(res.status, 400);
      assertEquals(mock.insertedEventIds.length, 0);
      assertEquals(mock.updateCalls, 0);
      assertEquals(mock.resendCalls.length, 0);
    } finally {
      mock.restore();
      restoreEnv();
    }
  });
}
