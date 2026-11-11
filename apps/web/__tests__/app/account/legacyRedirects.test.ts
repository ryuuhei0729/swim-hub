/**
 * 旧マイページ・旧設定画面 → アカウント画面 (/account) へのリダイレクト
 *
 * 2026-11 にマイページと設定を 1 画面に統合した。Stripe の戻り (session_id)・
 * Google カレンダー連携の戻り (calendar_connected)・PremiumBadge の旧リンク
 * (?tab=subscription)・ブックマークで旧 URL に来ても、対応する詳細タブを開くこと。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

import MyPageRedirect from "@/app/[locale]/(authenticated)/mypage/page";
import SettingsRedirect from "@/app/[locale]/(authenticated)/settings/page";
import PracticeLogTemplatesRedirect from "@/app/[locale]/(authenticated)/settings/practice-log-templates/page";
import {
  accountPath,
  parseAccountTab,
} from "@/app/[locale]/(authenticated)/account/_components/accountTabs";

async function redirectedTo(run: () => Promise<unknown>): Promise<string> {
  await expect(run()).rejects.toThrow(/NEXT_REDIRECT/);
  return redirectMock.mock.calls.at(-1)![0];
}

function settings(query: Record<string, string | string[]>, locale = "ja") {
  return () =>
    SettingsRedirect({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(query) });
}

beforeEach(() => {
  redirectMock.mockClear();
});

describe("/mypage", () => {
  it("/{locale}/account へ送る", async () => {
    expect(await redirectedTo(() => MyPageRedirect({ params: Promise.resolve({ locale: "en" }) }))).toBe(
      "/en/account",
    );
  });
});

describe("/settings", () => {
  it("クエリなし → /account (タブは開かない)", async () => {
    expect(await redirectedTo(settings({}))).toBe("/ja/account");
  });

  it("Stripe の戻り (session_id) → プランを開き session_id を引き継ぐ", async () => {
    expect(await redirectedTo(settings({ session_id: "cs_test_123" }))).toBe(
      "/ja/account?session_id=cs_test_123&tab=plan",
    );
  });

  it("PremiumBadge の旧リンク (?tab=subscription) → プラン", async () => {
    expect(await redirectedTo(settings({ tab: "subscription" }, "ko"))).toBe(
      "/ko/account?tab=plan",
    );
  });

  it("Google カレンダー連携の戻り (calendar_connected) → カレンダー", async () => {
    expect(await redirectedTo(settings({ calendar_connected: "true" }))).toBe(
      "/ja/account?calendar_connected=true&tab=calendar",
    );
  });

  it("知らない tab は捨てる", async () => {
    expect(await redirectedTo(settings({ tab: "unknown" }))).toBe("/ja/account");
  });
});

describe("/settings/practice-log-templates", () => {
  it("→ 練習ログテンプレート", async () => {
    expect(
      await redirectedTo(() => PracticeLogTemplatesRedirect({ params: Promise.resolve({ locale: "ja" }) })),
    ).toBe("/ja/account?tab=templates");
  });
});

describe("accountTabs", () => {
  it("parseAccountTab は既知のタブだけを通す", () => {
    expect(parseAccountTab("plan")).toBe("plan");
    expect(parseAccountTab("security")).toBe("security");
    expect(parseAccountTab("subscription")).toBeNull();
    expect(parseAccountTab(null)).toBeNull();
  });

  it("accountPath", () => {
    expect(accountPath()).toBe("/account");
    expect(accountPath("calendar")).toBe("/account?tab=calendar");
  });
});
