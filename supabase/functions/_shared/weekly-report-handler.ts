import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formatWeeklyReport, type WeeklyReportPayload } from "./weekly-report-format.ts";

// 仕様: docs/specs/weekly-usage-report.md の「Edge Function の入出力」。
// pg_cron (invoke_weekly_usage_report) から POST される。env の読み取りと Supabase クライアントの
// 作成はリクエストごとに行う。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// 長さの違いや先頭一致で処理時間が変わらないよう、SHA-256 のダイジェスト同士を全バイト比較する
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i]! ^ vb[i]!;
  return diff === 0;
}

function formatDate(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** week_start を検証する。問題があればエラーメッセージ、なければ null */
function validateWeekStart(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "week_start must be a string in YYYY-MM-DD format";
  }
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const ms = Date.UTC(y, m - 1, d);
  // 2025-02-29 のような存在しない日付は Date が繰り上げるので、往復で一致するか確かめる
  if (formatDate(ms) !== value) return "week_start is not a valid date";
  if (new Date(ms).getUTCDay() !== 6) return "week_start must be a Saturday";
  // 週が終わっているか: week_start + 7日 <= JST の今日
  const todayJst = formatDate(Date.now() + JST_OFFSET_MS);
  if (formatDate(ms + 7 * DAY_MS) > todayJst) return "week has not ended yet";
  return null;
}

async function sendEmail(
  apiKey: string,
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: "SwimHub <noreply@swim-hub.app>", to, subject, text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`weekly-report: Resend responded ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("weekly-report: Resend request failed:", err);
    return false;
  }
}

export function createWeeklyReportHandler(): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const cronSecret = Deno.env.get("WEEKLY_REPORT_CRON_SECRET");
    if (!cronSecret) {
      console.error("weekly-report: WEEKLY_REPORT_CRON_SECRET is not set");
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }
    const authorized = await timingSafeEqual(req.headers.get("authorization") ?? "", `Bearer ${cronSecret}`);
    if (!authorized) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let body: Record<string, unknown> = {};
    const rawBody = await req.text();
    if (rawBody.trim() !== "") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return jsonResponse({ error: "Invalid JSON" }, 400);
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return jsonResponse({ error: "Body must be a JSON object" }, 400);
      }
      body = parsed as Record<string, unknown>;
    }

    let weekStart: string | null = null;
    if ("week_start" in body) {
      const problem = validateWeekStart(body.week_start);
      if (problem !== null) return jsonResponse({ error: problem }, 400);
      weekStart = body.week_start as string;
    }
    if ("force" in body && typeof body.force !== "boolean") {
      return jsonResponse({ error: "force must be a boolean" }, 400);
    }
    const force = body.force === true;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("weekly-report: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not set");
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    try {
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const { data, error } = await supabase.rpc("generate_weekly_usage_report", { p_week_start: weekStart });
      if (error || !data || typeof (data as WeeklyReportPayload).week_start !== "string") {
        console.error("weekly-report: generate_weekly_usage_report failed:", error ?? "empty result");
        return jsonResponse({ error: "Failed to generate report" }, 500);
      }
      const report = data as WeeklyReportPayload;
      const reportWeek = report.week_start;

      if (report.email_sent_at !== null && !force) {
        return jsonResponse({ week_start: reportWeek, sent: false, reason: "already_sent" }, 200);
      }

      const apiKey = Deno.env.get("RESEND_API_KEY");
      const to = Deno.env.get("WEEKLY_REPORT_EMAIL") || Deno.env.get("BILLING_NOTIFY_EMAIL");
      if (!apiKey || !to) {
        return jsonResponse({ week_start: reportWeek, sent: false, reason: "not_configured" }, 200);
      }

      const { subject, text } = formatWeeklyReport(report);
      const sent = await sendEmail(apiKey, to, subject, text);
      if (!sent) {
        return jsonResponse({ week_start: reportWeek, sent: false, reason: "send_failed" }, 502);
      }

      const { error: markError } = await supabase.rpc("mark_weekly_usage_report_sent", {
        p_week_start: reportWeek,
      });
      if (markError) {
        // 送信は済んでいるので、再実行すると二重送信になる (仕様で受け入れた制限)
        console.error("weekly-report: mark_weekly_usage_report_sent failed after sending:", markError);
        return jsonResponse({ error: "Failed to record sent time" }, 500);
      }

      return jsonResponse({ week_start: reportWeek, sent: true }, 200);
    } catch (err) {
      console.error("weekly-report: unexpected error:", err);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  };
}
