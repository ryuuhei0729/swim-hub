import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@swim-hub/shared/types";
import { env } from "@/lib/env";

const supabaseUrl = env.supabaseUrl;
const supabaseAnonKey = env.supabaseAnonKey;

if (__DEV__) {
  console.log("Supabase環境変数の確認:");
  console.log("supabaseUrl:", supabaseUrl ? `${supabaseUrl.substring(0, 50)}...` : "未設定");
  console.log("supabaseAnonKey:", supabaseAnonKey ? "設定済み" : "未設定");
}

// TODO: このファイルは swimhub-scanner/apps/mobile/lib/supabase.ts と実質同一 (正本は
// swimhub-timer/apps/mobile/lib/supabase.ts)。@ryuuhei0729/swimhub-oauth と違って今回は
// 共有パッケージ化のスコープ外 (scanner/timer が oauth パッケージを 0.1.2 固定運用している
// 事情があり、今それに触ると別の事故になるため)。将来、3アプリ分の重複を解消すべき。

// 暗号化 auth ストアの id。平文の legacy な "supabase-auth" ストアとは別 id にすることで、
// 暗号化に切り替えた際に鍵不一致で MMKV が壊れたデータを開こうとしてクラッシュするのを防ぐ
// (getAuthEncryptionKey が undefined を返す場合は平文ストアへフォールバックする)。
const AUTH_STORE_ID = "supabase-auth-enc";
const AUTH_ENCRYPTION_KEY_NAME = "supabase-auth-mmkv-key";
// AsyncStorage → MMKV への一度限りの移行が完了したことを示すフラグ。移行先の MMKV
// ストア自身に持たせることで、そのストアがどちらのフォールバック経路で作られたかと
// 紐付けて冪等性を管理できる（ストアを跨いで別途フラグを持つと不整合の余地が生まれる）。
const MIGRATION_DONE_KEY = "async-storage-migration-v1-done";

/**
 * Fetch (or lazily create) the MMKV encryption key from the device Keychain /
 * Keystore via expo-secure-store, so Supabase refresh/access tokens are never
 * written to disk in plaintext. Returns undefined when SecureStore isn't
 * available (e.g. Expo Go) — the caller then falls back to an unencrypted store.
 */
function getAuthEncryptionKey(): string | undefined {
  try {
    const SecureStore = require("expo-secure-store");
    const existing = SecureStore.getItem(AUTH_ENCRYPTION_KEY_NAME);
    if (typeof existing === "string" && existing.length > 0) return existing;

    const Crypto = require("expo-crypto");
    const bytes: Uint8Array = Crypto.getRandomBytes(32);
    const key = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    SecureStore.setItem(AUTH_ENCRYPTION_KEY_NAME, key);
    return key;
  } catch {
    return undefined;
  }
}

// 恒久的に失敗し続ける端末で毎起動ごとに AsyncStorage.getAllKeys() を走査し続けるのを防ぐための
// 上限。この上限に達したら、平文キーが残るリスクよりも起動コストの回避を優先してフラグを立てる
// (=諦める)。参照: MAX_MIGRATION_ATTEMPTS を使う箇所のコメント。
const MAX_MIGRATION_ATTEMPTS = 5;
const MIGRATION_ATTEMPTS_KEY = "async-storage-migration-v1-attempts";

/**
 * AsyncStorage に残っている既存ログインユーザーのセッション (refresh/access token) を
 * 暗号化 MMKV へ一度だけ移行する。
 *
 * なぜ必要か: これまで `createClient` には `storageKey` を明示指定していなかったため、
 * supabase-js の既定キー (`sb-<projectRefの先頭ラベル>-auth-token`) で AsyncStorage に
 * 保存されている。この既定キーの導出ロジックは supabase-js の内部実装であり、ここで
 * 再実装して依存すると将来のライブラリ更新で静かに壊れる恐れがある。そのため導出方法を
 * 真似るのではなく、AsyncStorage の実際のキー一覧を `sb-` prefix / `-auth-token` suffix
 * で走査し、実物のキー名をそのまま使って MMKV 側にも同じキー名で複製する
 * (`storageKey` を上書きしていないので supabase-js は起動後も同じキー名で読みに来る)。
 *
 * 複数マッチした場合の方針 (project ref 変更・複数 Supabase インスタンスの履歴が端末に
 * 残っているケース): 現行の `EXPO_PUBLIC_SUPABASE_URL` から導出される project ref に一致する
 * キーだけを「現行セッション」として復元対象にする。それ以外の古いキーは別 project の
 * 無効なセッションであり復元する価値が無く、平文で残す理由もないため削除のみ行う
 * (M-3 の趣旨=平文根絶に合わせる)。一致するキーが無い場合は先頭のキーを暫定的に現行扱いにする
 * (どのプロジェクトのものか分からなくても、1つは復元を試みた方がユーザー影響が小さいため)。
 * なお、この URL 由来の ref 計算はあくまで複数キーの優先順位付けの補助であり、キーの発見
 * 自体は上記のスキャン方式に委ねているため、supabase-js の内部実装が変わっても壊れない。
 *
 * 冪等性 / 失敗時の挙動: MMKV 側に立てる `MIGRATION_DONE_KEY` フラグで管理する。
 * - `AsyncStorage.getAllKeys()` 自体が失敗した場合は、何が保存されているか分からず
 *   再試行しても解決する見込みが薄いため、直ちにフラグを立てて諦める (起動を継続する方を
 *   優先する)。
 * - 現行キーの MMKV への書き込み (`mmkv.set`) が失敗した場合は、**フラグを立てず** AsyncStorage
 *   側の平文キーも削除しない。次回起動で再試行することで、セッションを失わずに済む。
 *   (書き込みに失敗したのに旧キーを消すとセッションそのものを失うため、書き込み成功が
 *   確認できるまで削除しない。)
 * - 書き込みには成功したが `AsyncStorage.removeItem` (平文キーの削除) が失敗した場合も、
 *   フラグを立てず次回起動で削除を再試行する。再試行時に MMKV 側の値を上書きしないよう
 *   (既にコピー済みなら) 書き込みはスキップし、削除だけ再試行する。
 * - 上記の再試行は `MAX_MIGRATION_ATTEMPTS` 回で打ち切る。恒久的に書き込み/削除が失敗する
 *   壊れた端末で毎起動ごとに走査コストがかかり続けるのを避けるためのトレードオフであり、
 *   上限到達後は平文キー残存のリスクよりも起動コスト回避を優先する。
 */
async function migrateLegacySessionOnce(mmkv: {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
}): Promise<void> {
  if (mmkv.getString(MIGRATION_DONE_KEY) === "1") return;

  let keys: readonly string[];
  try {
    keys = await AsyncStorage.getAllKeys();
  } catch (err) {
    console.error(
      "AsyncStorage の走査に失敗したため移行を諦めます (再ログインで継続します):",
      err,
    );
    try {
      mmkv.set(MIGRATION_DONE_KEY, "1");
    } catch {
      // フラグ書き込みも失敗した場合は次回起動時に再試行されるだけで実害はない
    }
    return;
  }

  const legacyKeys = keys.filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
  if (legacyKeys.length === 0) {
    try {
      mmkv.set(MIGRATION_DONE_KEY, "1");
    } catch {
      // 無視 (次回起動でまた「該当キー無し」と判定されるだけで実害はない)
    }
    return;
  }

  let currentProjectKey: string | undefined;
  try {
    const currentProjectRef = new URL(supabaseUrl ?? "").hostname.split(".")[0];
    currentProjectKey = `sb-${currentProjectRef}-auth-token`;
  } catch {
    // supabaseUrl が不正な場合でも複数マッチ時の優先順位付けが崩れるだけで、
    // 発見・移行自体は継続できるので無視する
  }
  // legacyKeys.length === 0 は上で早期 return 済みなので legacyKeys[0] は必ず存在する
  // (noUncheckedIndexedAccess 環境向けにアサーションで明示)
  const primaryKey = legacyKeys.includes(currentProjectKey ?? "")
    ? (currentProjectKey as string)
    : (legacyKeys[0] as string);

  let primaryDone = false;
  try {
    // 前回の起動で書き込みまでは成功していた (が削除やフラグ書き込みで失敗した) 場合、
    // ここで再度上書きすると MMKV 側で既に進んでいる (自動リフレッシュ済みの) セッションを
    // 古い AsyncStorage の値で巻き戻してしまう。MMKV に既に値があるならコピーはスキップする。
    if (mmkv.getString(primaryKey) === undefined) {
      const value = await AsyncStorage.getItem(primaryKey);
      if (value) {
        mmkv.set(primaryKey, value);
      }
    }
    await AsyncStorage.removeItem(primaryKey);
    primaryDone = true;
  } catch (err) {
    console.error(
      "AsyncStorage→MMKV セッション移行 (書き込み/削除) に失敗しました。平文キーは残し、次回起動で再試行します:",
      err,
    );
  }

  // 現行 project 以外の古いキーは復元せず削除のみ試みる (無効なセッションなので復元価値が無い)
  let staleCleanupDone = true;
  for (const key of legacyKeys) {
    if (key === primaryKey) continue;
    try {
      await AsyncStorage.removeItem(key);
    } catch (err) {
      console.error(`古いセッションキー "${key}" の削除に失敗しました。次回起動で再試行します:`, err);
      staleCleanupDone = false;
    }
  }

  if (primaryDone && staleCleanupDone) {
    try {
      mmkv.set(MIGRATION_DONE_KEY, "1");
    } catch {
      // フラグ書き込みも失敗した場合は次回起動時に再試行されるだけで実害はない (冪等)
    }
    return;
  }

  // 一部でも未完了 → フラグは立てず次回起動で再試行する。ただし恒久的に失敗する端末で
  // 毎起動走査し続けるのを避けるため、試行回数の上限で打ち切る。
  try {
    const attempts = Number(mmkv.getString(MIGRATION_ATTEMPTS_KEY) ?? "0") + 1;
    if (attempts >= MAX_MIGRATION_ATTEMPTS) {
      mmkv.set(MIGRATION_DONE_KEY, "1");
    } else {
      mmkv.set(MIGRATION_ATTEMPTS_KEY, String(attempts));
    }
  } catch {
    // カウンタ/フラグの書き込み自体が失敗する = MMKV への書き込みが全般的に効かない環境。
    // この場合は毎回リトライしてしまうが、getAllKeys() 自体は軽量な読み取りのみなので
    // 起動が壊滅的に遅くなるわけではなく、セッション保護を優先する。
  }
}

// MMKV-based storage adapter for Supabase auth (encrypted at rest)
function createMmkvStorage() {
  try {
    const { createMMKV } = require("react-native-mmkv");
    const encryptionKey = getAuthEncryptionKey();

    // 残存リスク (対応不要と判断・記録): SecureStore が使えない端末では平文 MMKV に
    // フォールバックし、移行後もこのトークンは暗号化されない。ここでアプリを起動不能にする
    // (= ログイン機能自体を止める) 方が、平文で保存され続けるより明確にユーザー影響が大きいため、
    // 「暗号化できないなら平文でも動かす」を選んでいる (timer の正本と同じ判断)。
    const mmkv = encryptionKey
      ? createMMKV({ id: AUTH_STORE_ID, encryptionKey })
      : createMMKV({ id: "supabase-auth" }); // SecureStore unavailable → 平文フォールバック

    // 移行は初回の getItem 呼び出し (= supabase-js がクライアント初期化時にセッションを
    // 読みに来るタイミング) まで遅延させる。同じ Promise を全呼び出しで共有し、並行して
    // 複数回呼ばれても AsyncStorage を二重に読みに行かないようにする。
    let migrationPromise: Promise<void> | null = null;
    const ensureMigrated = (): Promise<void> => {
      if (!migrationPromise) {
        migrationPromise = migrateLegacySessionOnce(mmkv);
      }
      return migrationPromise;
    };

    return {
      getItem: async (key: string): Promise<string | null> => {
        await ensureMigrated();
        return mmkv.getString(key) ?? null;
      },
      setItem: async (key: string, value: string): Promise<void> => {
        mmkv.set(key, value);
      },
      removeItem: async (key: string): Promise<void> => {
        mmkv.remove(key);
      },
    };
  } catch {
    // Fallback for Expo Go: in-memory storage (プロセス終了で消えるが、クラッシュさせない
    // ことを優先する)。残存リスク (対応不要と判断・記録): この経路でも AsyncStorage からの
    // 移行は行わない (react-native-mmkv 自体が使えないため永続化先が無く、移行しても
    // プロセス終了で失われるだけで意味が無い)。この場合は起動不能にするよりも、旧セッションを
    // 復元できない=再ログインしてもらう方を選んでいる。
    const store = new Map<string, string>();
    return {
      getItem: async (key: string): Promise<string | null> => store.get(key) ?? null,
      setItem: async (key: string, value: string): Promise<void> => {
        store.set(key, value);
      },
      removeItem: async (key: string): Promise<void> => {
        store.delete(key);
      },
    };
  }
}

const mmkvStorage = createMmkvStorage();

export function clearMmkvCaches(): void {
  try {
    const { createMMKV } = require("react-native-mmkv");
    const encryptionKey = getAuthEncryptionKey();
    const authStorage = encryptionKey
      ? createMMKV({ id: AUTH_STORE_ID, encryptionKey })
      : createMMKV({ id: "supabase-auth" });
    authStorage.clearAll();
    try {
      createMMKV({ id: "supabase-auth" }).clearAll();
    } catch {
      // ignore
    }
  } catch {
    // Expo Go fallback: no MMKV available
  }
}

// 環境変数の検証（エラーをthrowせず、nullを返す）
let supabase: ReturnType<typeof createClient<Database>> | null = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    // React Native用Supabaseクライアント
    // storage には暗号化 MMKV (mmkvStorage) を使う。MMKV は同期 API でハングし得ないため、
    // 旧来の safeStorage (AsyncStorage を Promise.race でタイムアウトさせるラッパー) は
    // 不要になった (撤去済み)。破損データへの対処も MMKV 側の getString が undefined を
    // 返すだけで済み、AsyncStorage.removeItem のような明示的なクリーンアップは不要。
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: mmkvStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // OAuth (Google) の deep link を PKCE の `code` クエリで受け取り、
        // exchangeCodeForSession で交換する（アクセストークンを URL 直渡ししない）。
        // 既定の "implicit" のままだと同一スキームを主張する悪意あるアプリに
        // コールバックを横取りされ、code_verifier 不要でセッションを奪取されうる。
        flowType: "pkce",
      },
    });
  } catch (error) {
    console.error("Supabaseクライアントの初期化に失敗しました:", error);
  }
} else {
  console.error(
    "Supabase環境変数が設定されていません。\n" +
      "EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY を設定してください。\n" +
      `現在の設定状態:\n` +
      `EXPO_PUBLIC_SUPABASE_URL: ${supabaseUrl ? "set" : "unset"}\n` +
      `EXPO_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? "set" : "unset"}`,
  );
}

// バックグラウンド復帰時にトークン自動リフレッシュを再開する
// Supabase公式推奨パターン: https://supabase.com/docs/reference/javascript/auth-startautorefresh
if (supabase) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase!.auth.startAutoRefresh();
    } else {
      supabase!.auth.stopAutoRefresh();
    }
  });
}

export { supabase };
