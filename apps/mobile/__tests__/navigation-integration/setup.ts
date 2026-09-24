// ナビゲーション統合テスト用セットアップ。
// jsdom に無い API を最小限だけ補う (実挙動を緩めないこと)。
// ⚠️ `@testing-library/jest-dom` は **import しない**。
// apps/mobile では宣言しておらず (apps/web の devDependency)、
// 現状 `node-linker=hoisted` のおかげでたまたま解決できているだけ。
// このスイートは vitest 組み込みマッチャー (toBe/toEqual/toContain/toBeNull) しか
// 使わないので依存を持たせない。将来 linker 設定が変わっても CI が落ちない。

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

if (!globalThis.matchMedia) {
  (globalThis as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  });
}
