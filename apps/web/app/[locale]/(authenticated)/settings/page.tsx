import { redirect } from "next/navigation";
import type { AccountTab } from "../account/_components/accountTabs";

/**
 * 旧設定画面。2026-11 にマイページと統合して /account になったので、そちらへ送る。
 * Stripe の戻り (session_id) や Google カレンダー連携の戻り (calendar_connected)、
 * PremiumBadge の旧リンク (?tab=subscription) で来ることがあるため、
 * クエリはそのまま引き継ぎ、対応する詳細タブを開く。
 */
export default async function SettingsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);

  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "tab") continue;
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      next.append(key, v);
    }
  }

  let tab: AccountTab | null = null;
  if (query.session_id !== undefined || query.tab === "subscription") tab = "plan";
  else if (query.calendar_connected !== undefined) tab = "calendar";
  if (tab) next.set("tab", tab);

  const qs = next.toString();
  redirect(`/${locale}/account${qs ? `?${qs}` : ""}`);
}
