/**
 * app/[locale]/(authenticated)/onboarding/page.tsx
 * — 項目3 (Sprint Contract, Phase A 積み残しの解消): サーバー redirect() の locale 対応
 *
 * 対象:
 *   - onboarding/page.tsx:9  redirect("/login")     → locale prefix 付き
 *   - onboarding/page.tsx:15 redirect("/dashboard")  → locale prefix 付き
 *   - getLocale() は新規追加が必要 (RecordDataLoader/EntriesDataLoader と異なり
 *     このファイルには元々 getLocale() が無い)
 *
 * 手本: __tests__/app/teams/recordAdminGuard.test.ts /
 *       __tests__/app/teams/entryBulkAdminGuard.test.ts /
 *       __tests__/app/teams/practiceLogAdminGuard.test.ts
 * と同型のパターン (server component を直接 await 呼び出しし、redirect を
 * 「呼ばれたら例外を投げて描画を中断する」制御フロー関数として扱う)。
 *
 * 🔴 手本3本との違い (実装過程で判明。当初は "next/navigation" の redirect を
 * vi.mock で丸ごと差し替える設計にしていたが、それでは通用しなかった):
 *   onboarding/page.tsx は既に (Web Developer が並行実装済みのため) `redirect` を
 *   `@/i18n/navigation` から import しており、この関数は最終的に Next.js 本体の
 *   `redirect()` (next/dist/client/components/redirect.js) を呼ぶ。この本体の
 *   redirect() は "next/navigation" という specifier 経由ではなく、next-intl の
 *   react-server 条件付き export 解決を通して別の内部パスから読み込まれるため、
 *   `vi.mock("next/navigation", ...)` では intercept できなかった
 *   (実測: モックした redirect ではなく、本物の Next.js redirect が投げる
 *   `Error { message: "NEXT_REDIRECT", digest: "NEXT_REDIRECT;replace;/ja/login;307;" }`
 *   が実際に観測された)。
 *
 *   そこで本テストでは "next/navigation" を一切モックせず、本物の redirect() が
 *   投げるエラーを捕捉し、Next.js が公式に提供するテスト用ヘルパー
 *   `getURLFromRedirectError` (next/dist/client/components/redirect) で
 *   埋め込まれた遷移先 URL を抽出して完全一致で検証する。これは「呼ばれたと
 *   主張するモック」ではなく「本物の redirect() が実際に何を投げたか」を見る、
 *   より実体に即した検証になっている。
 *
 * V-5 の教訓 (practiceLogAdminGuard.test.ts で実証済み): getLocale() が新規追加される
 * ファイルに対して "next-intl/server" のモックを最初から入れておかないと、実物の
 * getLocale() が呼ばれて「`getLocale` is not supported in Client Components.」という
 * 原因不明のエラーで全件が落ちる。本ファイルは最初からモックを入れている。
 *
 * 実測結果 (2026-08-30時点): Web Developer が並行して項目3を実装済みだったため、
 * 本ファイルは GREEN になった (積み残しの解消であり、実装前のRED演出ではなく
 * 実測結果をそのまま報告する)。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";

const mockGetServerUser = vi.fn();
const mockGetServerUserProfile = vi.fn();
// beforeEach で "ja" に戻す。locale を可変にすることで getLocale() の戻り値が
// そのまま redirect() に反映されることを検証できる (locale決め打ち実装の検出用)。
const mockGetLocale = vi.fn().mockResolvedValue("ja");

vi.mock("@/lib/supabase-server-auth", () => ({
  getServerUser: mockGetServerUser,
  getServerUserProfile: mockGetServerUserProfile,
}));

vi.mock("next-intl/server", () => ({
  getLocale: mockGetLocale,
}));

// OnboardingWizard (client component) は本テストの対象外。
// 正常系 (未完了) では「呼ばれたことそのもの」だけ確認できればよい。
vi.mock(
  "../../../app/[locale]/(authenticated)/onboarding/_client/OnboardingWizard",
  () => ({
    default: (props: unknown) => ({ type: "OnboardingWizardMock", props }),
  }),
);

async function loadOnboardingPage() {
  const mod = await import("../../../app/[locale]/(authenticated)/onboarding/page");
  return mod.default;
}

/** 本物の redirect() が投げたエラーから遷移先 URL を抽出する (Next.js公式ヘルパー経由) */
async function captureRedirectUrl(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (!isRedirectError(error)) {
      throw error;
    }
    const url = getURLFromRedirectError(error);
    if (url === null) {
      throw new Error("getURLFromRedirectError returned null (not a redirect error?)");
    }
    return url;
  }
  throw new Error("redirect() が呼ばれず、正常にコンポーネントが返った (期待に反する)");
}

describe("onboarding/page.tsx — redirect() の locale 対応 (項目3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLocale.mockResolvedValue("ja");
  });

  it("[V-3-05a] 未認証 (user: null) の場合、redirect 先は完全一致で /ja/login", async () => {
    mockGetServerUser.mockResolvedValue(null);

    const OnboardingPage = await loadOnboardingPage();
    const url = await captureRedirectUrl(() => OnboardingPage());

    expect(url).toBe("/ja/login");
    expect(url).not.toBe("/login");
    expect(url).not.toBe("/ja/dashboard");
  });

  it("[V-3-05b] 未認証・locale='en' の場合、redirect 先は完全一致で /en/login (locale決め打ちでないことの確認)", async () => {
    mockGetServerUser.mockResolvedValue(null);
    mockGetLocale.mockResolvedValue("en");

    const OnboardingPage = await loadOnboardingPage();
    const url = await captureRedirectUrl(() => OnboardingPage());

    expect(url).toBe("/en/login");
    expect(url).not.toBe("/ja/login");
    // 二重 prefix ("/en/en/login") になっていないことの明示的な否定
    expect(url).not.toBe("/en/en/login");
  });

  it("[V-3-05c] 認証済み・オンボーディング完了済みの場合、redirect 先は完全一致で /ja/dashboard", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockGetServerUserProfile.mockResolvedValue({ onboarding_completed: true });

    const OnboardingPage = await loadOnboardingPage();
    const url = await captureRedirectUrl(() => OnboardingPage());

    expect(url).toBe("/ja/dashboard");
    expect(url).not.toBe("/dashboard");
    expect(url).not.toBe("/ja/login");
  });

  it("[V-3-05d] 認証済み・完了済み・locale='en' の場合、redirect 先は完全一致で /en/dashboard (locale決め打ちでないことの確認)", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockGetServerUserProfile.mockResolvedValue({ onboarding_completed: true });
    mockGetLocale.mockResolvedValue("en");

    const OnboardingPage = await loadOnboardingPage();
    const url = await captureRedirectUrl(() => OnboardingPage());

    expect(url).toBe("/en/dashboard");
    expect(url).not.toBe("/ja/dashboard");
    expect(url).not.toBe("/en/en/dashboard");
  });

  it("[非退行] 認証済み・オンボーディング未完了の場合、redirect されず OnboardingWizard に処理が渡る", async () => {
    mockGetServerUser.mockResolvedValue({ id: "user-1" });
    mockGetServerUserProfile.mockResolvedValue({ onboarding_completed: false });

    const OnboardingPage = await loadOnboardingPage();
    const result = await OnboardingPage();

    expect(result).toBeTruthy();
  });
});
