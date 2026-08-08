/**
 * QA Phase B — Sprint Contract V25/V26/V27 (M-3: mobile refresh token 暗号化 + 移行)
 *
 * 人間の判断の核心: 「既存ログインユーザーを強制ログアウトさせない」移行ロジックを検証する。
 *
 * トートロジー回避方針: lib/supabase.ts の移行関数 (migrateLegacySessionOnce 等) は
 * export されていないため、実装を再実装したり内部関数を直接呼んだりしない。公開されている
 * 唯一のエントリポイント (`supabase.auth.getSession()` / `clearMmkvCaches()`) を通して
 * ユーザーに意味のある性質だけを検証する。
 *
 * ============================================================================
 * 【重要: V26/V27 が実行不能であることの調査記録】
 * ============================================================================
 * lib/supabase.ts の getAuthEncryptionKey() / createMmkvStorage() は
 * `require("react-native-mmkv")` / `require("expo-secure-store")` / `require("expo-crypto")`
 * を関数内部で動的に呼び出し、try/catch で失敗を握っている (Expo Go でネイティブモジュールが
 * リンクされていない環境向けの意図的なフォールバック機構)。
 *
 * これらのパッケージは React Native の Metro バンドラ向けにビルドされており、プラットフォーム
 * サフィックス解決 (.native.js 等) や TypeScript ソースの直接 import (expo-modules-core) を
 * 前提とした構造になっている。Vitest (Node.js + esbuild) 環境でこれらを裸の `require()` で
 * 呼び出すと、モックの有無に関わらず実際に ERR_MODULE_NOT_FOUND / ERR_UNKNOWN_FILE_EXTENSION
 * で必ず失敗することを実測で確認した (下記 3 点、いずれも vi.mock 未使用の生の require() で再現):
 *   - require("react-native-mmkv")  → Cannot find module '.../lib/createMMKV/createMMKV'
 *   - require("expo-secure-store")  → Cannot find module '.../build/ExpoSecureStore'
 *   - require("expo-crypto")        → Unknown file extension ".ts" (expo-modules-core/src/index.ts)
 *
 * これは esbuild/vite-node が ESM ファイル内の `require(...)` を
 * `createRequire(import.meta.url)` 相当のモジュールローカルな束縛として扱うためで、
 * Vite の解決グラフ (vi.mock / resolve.alias) を経由しない。実際に `globalThis.require` は
 * undefined であり、vi.mock("react-native-mmkv", ...) や `import("react-native-mmkv")` で得た
 * モック関数をグローバルに差し込んでも production コード内の `require(...)` 呼び出しには
 * 反映されないことを実験的に確認した (このファイルの調査で複数のアプローチを試したが、
 * テストファイルの変更のみでは production コードの require() を差し替える手段がない)。
 *
 * 結果として、Vitest 環境ではこの3パッケージへの require() が常に失敗し、
 * lib/supabase.ts は常に「MMKV 利用不可 (Expo Go 相当)」のフォールバック分岐を通る。
 * これは V25 (フォールバックが機能すること) をまさに検証できる一方、V26/V27 が対象とする
 * 「暗号化 MMKV への実際の移行」分岐には到達できない。
 *
 * → V26/V27 は静的レビュー (下記コメント参照) で検証し、動的テストは「検証不能」として
 *    QA レポートに明記する。resolve.alias の追加で解決可能だが、それは vitest.config.ts
 *    (テストファイル以外) の変更が必要であり、QA の編集権限外のため対応しない。
 *
 * 【再検証 (修正ループ第1ラウンド後・担当 E の W-2/W-3 再構成後)】
 * migrateLegacySessionOnce() は以下のように再構成された (lib/supabase.ts 実装を読んで確認):
 *   - W-2: mmkv.set() (書き込み) と AsyncStorage.removeItem() (削除) の失敗を区別し、
 *     **両方成功した場合のみ** MIGRATION_DONE_KEY を立てる。書き込み失敗時は旧キーを
 *     消さない (セッション保護)。再試行時、MMKV に既に値がある場合は上書きしない
 *     (自動リフレッシュ済みの新しいセッションを古い値で巻き戻さないため)。
 *     MAX_MIGRATION_ATTEMPTS=5 回で打ち切り、恒久的に失敗する端末では平文キー残存を
 *     受け入れて起動コストを優先する。
 *   - W-3: find() → filter() で全 legacy キーを処理。現行 EXPO_PUBLIC_SUPABASE_URL から
 *     導出した project ref に一致するキーのみ復元対象、それ以外の古いキーは削除のみ
 *     (復元しない)。
 *
 * **これらの新しい分岐 (W-2/W-3) は scanner 側の同一ロジック (Jest で完全に動的検証可能)
 * で全17件 PASS を確認済み** — swim-hub と scanner の migrateLegacySessionOnce() 本体は
 * diff で1バイトも変わらない同一コードであることを都度確認しているため、scanner での
 * 動的検証結果は swim-hub の同一ロジックにもそのまま適用できると判断する。
 * (swimhub-scanner/apps/mobile/lib/__tests__/supabase.mmkv-migration.test.ts 参照)
 *
 * V25 はこのファイルの下部で実際に動的テストする (Vitest 環境で確実に踏める唯一の分岐)。
 * V26/V27 (暗号化 MMKV への実際の移行分岐) は上記の理由により swim-hub 自身の環境では
 * 依然として動的テストが不能 (検証不能) — これは環境制約であり実装の欠陥ではない。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  asyncStorage: new Map<string, string>(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys: vi.fn(async () => Array.from(state.asyncStorage.keys())),
    getItem: vi.fn(async (key: string) => state.asyncStorage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      state.asyncStorage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      state.asyncStorage.delete(key);
    }),
    clear: vi.fn(async () => state.asyncStorage.clear()),
  },
}));

async function importSupabaseModuleFresh() {
  vi.resetModules();
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://testref.supabase.co";
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  return await import("@/lib/supabase");
}

describe("lib/supabase.ts — M-3 Expo Go 相当フォールバック (V25, Vitest 環境で実際に踏める唯一の分岐)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    state.asyncStorage.clear();
    global.fetch = vi.fn().mockRejectedValue(new Error("network disabled in test"));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("V25: react-native-mmkv 等が require() できない環境でも supabase クライアント自体はクラッシュせず作られる", async () => {
    const { supabase } = await importSupabaseModuleFresh();
    expect(supabase).not.toBeNull();
  });

  it("V25: getSession() を呼んでもクラッシュせず、セッション無しとして解決する (再ログイン扱いで継続)", async () => {
    const { supabase } = await importSupabaseModuleFresh();
    const result = await supabase!.auth.getSession();
    expect(result.error).toBeNull();
    expect(result.data.session).toBeNull();
  });

  it("V25: AsyncStorage に旧セッションが残っていても (移行不能な環境のため) クラッシュしない", async () => {
    state.asyncStorage.set("sb-testref-auth-token", JSON.stringify({ fake: "session" }));
    const { supabase } = await importSupabaseModuleFresh();
    await expect(supabase!.auth.getSession()).resolves.toBeDefined();
  });

  it("V25: clearMmkvCaches() を呼んでも例外を投げない (require 失敗時の catch が機能する)", async () => {
    const { clearMmkvCaches } = await importSupabaseModuleFresh();
    expect(() => clearMmkvCaches()).not.toThrow();
  });
});
