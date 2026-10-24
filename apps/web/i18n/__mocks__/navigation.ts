// =============================================================================
// @/i18n/navigation の自動モック
// テストファイルで factory 無しの `vi.mock("@/i18n/navigation")` を書くと vitest がこれを使う。
// useRouter() はモジュール内で1つの router を返し続けるので、テストからは
//   const router = useRouter(); expect(router.push).toHaveBeenCalledWith("/teams");
// のように同じオブジェクトを取り出して検証できる (clearMocks で呼び出し履歴はテストごとに消える)。
// =============================================================================

import { createElement, type ReactNode } from "react";
import { vi } from "vitest";

const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

export const useRouter = vi.fn(() => router);
export const usePathname = vi.fn(() => "/");
export const redirect = vi.fn();
export const Link = ({
  href,
  children,
  ...props
}: {
  href: string | { pathname: string };
  children?: ReactNode;
} & Record<string, unknown>) =>
  createElement("a", { href: typeof href === "string" ? href : href.pathname, ...props }, children);
