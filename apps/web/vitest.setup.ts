import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// React 19 のテスト環境フラグ
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// テスト環境変数の設定
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

// 各テスト後にクリーンアップ (モックの呼び出し履歴は vitest.config の clearMocks が各テスト前に消す)
afterEach(() => {
  cleanup();
});

// グローバルなモック設定
global.ResizeObserver = vi.fn().mockImplementation(function () {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  };
});

// IntersectionObserver のモック
global.IntersectionObserver = vi.fn().mockImplementation(function () {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  };
});

// .ts のテストは node 環境で動くため window が無い (vitest.config.ts の projects)
if (typeof window !== "undefined") {
  // matchMedia のモック
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // scrollTo のモック
  Object.defineProperty(window, "scrollTo", {
    writable: true,
    value: vi.fn(),
  });
}
