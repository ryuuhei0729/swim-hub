import { format } from "date-fns";
import { unixMillisToIso, unixSecondsToIso } from "./format";
import { readOnlyFetch } from "./read-only-fetch";

// 外部サービスが落ちていても画面の残りは出したいので、取得結果は失敗を値として返す
export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

async function load<T>(label: string, run: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    return { ok: false, error: `${label}: ${message}` };
  }
}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  const response = await readOnlyFetch(url, { headers, cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

type StripeList<T> = { data: T[]; has_more: boolean };

type StripeSubscriptionRaw = {
  id: string;
  status: string;
  customer: string;
  created: number;
  cancel_at_period_end: boolean;
  canceled_at: number | null;
  ended_at: number | null;
  metadata: Record<string, string> | null;
  items: {
    data: {
      current_period_end: number | null;
      price: {
        id: string;
        unit_amount: number | null;
        currency: string;
        recurring: { interval: string } | null;
      };
    }[];
  };
};

type StripeInvoiceRaw = {
  id: string;
  created: number;
  status: string | null;
  amount_paid: number;
  amount_due: number;
  currency: string;
};

export type StripeSubscription = {
  id: string;
  status: string;
  customerId: string;
  userId: string | null;
  priceId: string | null;
  interval: string | null;
  amount: number | null;
  currency: string;
  createdAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
};

export type StripeInvoice = {
  id: string;
  createdAt: string | null;
  status: string | null;
  amountPaid: number;
  amountDue: number;
  currency: string;
};

function stripeHeaders(): Record<string, string> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY が読めません");
  return { Authorization: `Bearer ${key}` };
}

async function stripeListAll<T extends { id: string }>(
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const headers = stripeHeaders();
  const rows: T[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const query = new URLSearchParams({ ...params, limit: "100" });
    if (startingAfter) query.set("starting_after", startingAfter);
    const page = await getJson<StripeList<T>>(`https://api.stripe.com/v1/${path}?${query}`, headers);
    if (!page) return rows;
    rows.push(...page.data);
    const last = page.data.at(-1);
    if (!page.has_more || !last) return rows;
    startingAfter = last.id;
  }
}

function toStripeSubscription(raw: StripeSubscriptionRaw): StripeSubscription {
  const item = raw.items.data[0];
  return {
    id: raw.id,
    status: raw.status,
    customerId: raw.customer,
    userId: raw.metadata?.supabase_user_id ?? null,
    priceId: item?.price.id ?? null,
    interval: item?.price.recurring?.interval ?? null,
    amount: item?.price.unit_amount ?? null,
    currency: item?.price.currency ?? "jpy",
    createdAt: unixSecondsToIso(raw.created),
    currentPeriodEnd: unixSecondsToIso(item?.current_period_end),
    cancelAtPeriodEnd: raw.cancel_at_period_end,
    canceledAt: unixSecondsToIso(raw.canceled_at),
    endedAt: unixSecondsToIso(raw.ended_at),
  };
}

export function listStripeSubscriptions(customerId?: string): Promise<Loaded<StripeSubscription[]>> {
  return load("Stripe", async () => {
    const params: Record<string, string> = { status: "all" };
    if (customerId) params.customer = customerId;
    const rows = await stripeListAll<StripeSubscriptionRaw>("subscriptions", params);
    return rows.map(toStripeSubscription);
  });
}

export function listStripeInvoices(customerId: string): Promise<Loaded<StripeInvoice[]>> {
  return load("Stripe の請求", async () => {
    const rows = await stripeListAll<StripeInvoiceRaw>("invoices", { customer: customerId });
    return rows.map((raw) => ({
      id: raw.id,
      createdAt: unixSecondsToIso(raw.created),
      status: raw.status,
      amountPaid: raw.amount_paid,
      amountDue: raw.amount_due,
      currency: raw.currency,
    }));
  });
}

export function isStripePaying(subscription: StripeSubscription): boolean {
  return subscription.status === "active" || subscription.status === "trialing";
}

// 年額は 12 で割って月額に換算する
export function stripeMonthlyAmount(subscription: StripeSubscription): number {
  if (subscription.amount === null) return 0;
  return subscription.interval === "year" ? subscription.amount / 12 : subscription.amount;
}

// ---------------------------------------------------------------------------
// RevenueCat (REST API v2)
// ---------------------------------------------------------------------------

const REVENUECAT_BASE = "https://api.revenuecat.com/v2";

type RcList<T> = { items: T[]; next_page: string | null };

type RcSubscriptionRaw = {
  id: string;
  status: string;
  store: string;
  environment: string;
  product_id: string | null;
  gives_access: boolean;
  auto_renewal_status: string | null;
  starts_at: number | null;
  current_period_ends_at: number | null;
  ends_at: number | null;
  total_revenue_in_usd: { gross: number; proceeds: number } | null;
};

export type RcSubscription = {
  id: string;
  status: string;
  store: string;
  environment: string;
  productName: string;
  appName: string;
  givesAccess: boolean;
  autoRenewalStatus: string | null;
  startsAt: string | null;
  currentPeriodEndsAt: string | null;
  grossUsd: number | null;
  proceedsUsd: number | null;
};

export type RcOverviewMetric = { id: string; name: string; value: number; unit: string; description: string };

function rcHeaders(): Record<string, string> {
  const key = process.env.REVENUECAT_SECRET_KEY;
  if (!key) throw new Error("REVENUECAT_SECRET_KEY が読めません");
  return { Authorization: `Bearer ${key}` };
}

async function rcListAll<T>(url: string): Promise<T[]> {
  const headers = rcHeaders();
  const rows: T[] = [];
  let next: string | null = url;
  while (next) {
    const page: RcList<T> | null = await getJson<RcList<T>>(next, headers);
    if (!page) return rows;
    rows.push(...page.items);
    const nextUrl: URL | null = page.next_page ? new URL(page.next_page, REVENUECAT_BASE) : null;
    // シークレットキーを付けて送るので、次ページの URL が RevenueCat 以外を指していたら辿らない
    next = nextUrl && nextUrl.origin === new URL(REVENUECAT_BASE).origin ? nextUrl.toString() : null;
  }
  return rows;
}

type RcCatalog = {
  projectId: string;
  products: Map<string, { name: string; appName: string }>;
};

let catalogPromise: Promise<RcCatalog> | undefined;

// プロジェクト ID と商品・アプリの対応はほぼ変わらないので、プロセス内で1回だけ読む
function getRcCatalog(): Promise<RcCatalog> {
  catalogPromise ??= (async () => {
    const projects = await rcListAll<{ id: string }>(`${REVENUECAT_BASE}/projects`);
    const project = projects[0];
    if (!project) throw new Error("RevenueCat のプロジェクトが見つかりません");

    const base = `${REVENUECAT_BASE}/projects/${project.id}`;
    const [apps, products] = await Promise.all([
      rcListAll<{ id: string; name: string }>(`${base}/apps`),
      rcListAll<{ id: string; store_identifier: string; app_id: string | null }>(
        `${base}/products?limit=100`,
      ),
    ]);
    const appNames = new Map(apps.map((app) => [app.id, app.name]));
    return {
      projectId: project.id,
      products: new Map(
        products.map((product) => [
          product.id,
          {
            name: product.store_identifier,
            appName: (product.app_id && appNames.get(product.app_id)) || "-",
          },
        ]),
      ),
    };
  })().catch((error: unknown) => {
    catalogPromise = undefined;
    throw error;
  });
  return catalogPromise;
}

export function listRcSubscriptions(userId: string): Promise<Loaded<RcSubscription[]>> {
  return load("RevenueCat", async () => {
    const catalog = await getRcCatalog();
    const rows = await rcListAll<RcSubscriptionRaw>(
      `${REVENUECAT_BASE}/projects/${catalog.projectId}/customers/${encodeURIComponent(userId)}/subscriptions`,
    );
    return rows.map((raw) => {
      const product = raw.product_id ? catalog.products.get(raw.product_id) : undefined;
      return {
        id: raw.id,
        status: raw.status,
        store: raw.store,
        environment: raw.environment,
        productName: product?.name ?? raw.product_id ?? "-",
        appName: product?.appName ?? "-",
        givesAccess: raw.gives_access,
        autoRenewalStatus: raw.auto_renewal_status,
        startsAt: unixMillisToIso(raw.starts_at),
        currentPeriodEndsAt: unixMillisToIso(raw.current_period_ends_at ?? raw.ends_at),
        grossUsd: raw.total_revenue_in_usd?.gross ?? null,
        proceedsUsd: raw.total_revenue_in_usd?.proceeds ?? null,
      };
    });
  });
}

export function getRcOverview(): Promise<Loaded<RcOverviewMetric[]>> {
  return load("RevenueCat の概況", async () => {
    const catalog = await getRcCatalog();
    const overview = await getJson<{ metrics: RcOverviewMetric[] }>(
      `${REVENUECAT_BASE}/projects/${catalog.projectId}/metrics/overview`,
      rcHeaders(),
    );
    return overview?.metrics ?? [];
  });
}

// ---------------------------------------------------------------------------
// 売上 (これまでの合計と月ごとの推移)
// ---------------------------------------------------------------------------

export type RevenueSeries = {
  // 売上 (返金を引いた後、手数料を引く前)
  gross: number;
  // 手取り (決済手数料・ストア手数料を引いた後)
  net: number;
  // "yyyy-MM" → その月の売上
  grossByMonth: Map<string, number>;
};

type StripeBalanceTransactionRaw = {
  id: string;
  created: number;
  currency: string;
  amount: number;
  net: number;
  reporting_category: string;
};

// 売上として数える取引。入出金 (payout) や残高の移動は売上ではないので除く
const STRIPE_SALES_CATEGORIES = new Set(["charge", "refund", "dispute", "dispute_reversal"]);
const STRIPE_NON_REVENUE_CATEGORIES = new Set(["payout", "payout_reversal", "transfer", "topup"]);

export function getStripeRevenue(): Promise<Loaded<RevenueSeries & { otherCurrencies: string[] }>> {
  return load("Stripe の売上", async () => {
    const rows = await stripeListAll<StripeBalanceTransactionRaw>("balance_transactions", {});
    const series: RevenueSeries = { gross: 0, net: 0, grossByMonth: new Map() };
    const otherCurrencies = new Set<string>();
    for (const row of rows) {
      if (STRIPE_NON_REVENUE_CATEGORIES.has(row.reporting_category)) continue;
      // 円以外は足し合わせられないので、合計に入れずに通貨名だけ返す
      if (row.currency !== "jpy") {
        otherCurrencies.add(row.currency.toUpperCase());
        continue;
      }
      series.net += row.net;
      if (!STRIPE_SALES_CATEGORIES.has(row.reporting_category)) continue;
      series.gross += row.amount;
      const month = format(new Date(row.created * 1000), "yyyy-MM");
      series.grossByMonth.set(month, (series.grossByMonth.get(month) ?? 0) + row.amount);
    }
    return { ...series, otherCurrencies: [...otherCurrencies] };
  });
}

type RcChart = { values: { cohort: number; measure: number; value: number; incomplete: boolean }[] };

async function getRcChart(name: string, params: Record<string, string>): Promise<RcChart> {
  const catalog = await getRcCatalog();
  const query = new URLSearchParams({ currency: "JPY", ...params });
  const chart = await getJson<RcChart>(
    `${REVENUECAT_BASE}/projects/${catalog.projectId}/charts/${name}?${query}`,
    rcHeaders(),
  );
  if (!chart) throw new Error("チャートが見つかりません");
  return chart;
}

// RevenueCat のチャートは先頭の measure が金額。円に換算した値を返させている
function primaryValues(chart: RcChart) {
  return chart.values.filter((value) => value.measure === 0);
}

const RC_FIRST_DAY = "2020-01-01";

export function getRcRevenue(): Promise<Loaded<RevenueSeries>> {
  return load("RevenueCat の売上", async () => {
    const range = {
      start_date: RC_FIRST_DAY,
      end_date: format(new Date(), "yyyy-MM-dd"),
      resolution: "month",
    };
    const [revenue, proceeds] = await Promise.all([
      getRcChart("revenue", range),
      getRcChart("revenue", { ...range, selectors: JSON.stringify({ revenue_type: "proceeds" }) }),
    ]);
    const grossByMonth = new Map<string, number>();
    let gross = 0;
    for (const value of primaryValues(revenue)) {
      gross += value.value;
      if (value.value !== 0) {
        grossByMonth.set(format(new Date(value.cohort * 1000), "yyyy-MM"), value.value);
      }
    }
    const net = primaryValues(proceeds).reduce((sum, value) => sum + value.value, 0);
    return { gross, net, grossByMonth };
  });
}

// いまの MRR (年額は 12 で割って月額に直した値)。RevenueCat が計算した最新日の値を使う
export function getRcMonthlyRecurring(): Promise<Loaded<number>> {
  return load("RevenueCat の月額", async () => {
    const today = new Date();
    const chart = await getRcChart("mrr", {
      start_date: format(new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
      end_date: format(today, "yyyy-MM-dd"),
      resolution: "day",
    });
    const latest = primaryValues(chart).at(-1);
    if (!latest) throw new Error("MRR の値がありません");
    return latest.value;
  });
}
