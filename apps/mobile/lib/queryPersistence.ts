// =============================================================================
// React Query キャッシュの永続化 (MMKV)
// =============================================================================
//
// React Query のキャッシュはメモリ上にしか無く、アプリを終了すると全て消えていた。
// そのため起動のたびに全画面が「初回読み込み」になり、通信が遅い場所では毎回スピナーを
// 待つことになる。ここでキャッシュを端末に保存し、次回起動時に復元することで、
// 起動直後に前回のデータを表示し、裏で最新に取り直せるようにする。
//
// 保存先は暗号化 MMKV。キャッシュには本人やチームメンバーの記録・氏名が含まれるため、
// 鍵が用意できない端末 (Expo Go など SecureStore が使えない環境) では保存しない
// (= これまでどおりメモリ上のみで動く)。

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Persister } from "@tanstack/react-query-persist-client";

const CACHE_STORE_ID = "react-query-cache-enc";
const CACHE_ENCRYPTION_KEY_NAME = "react-query-cache-mmkv-key";
const CACHE_STORAGE_KEY = "react-query-cache";
// このキャッシュがどのユーザーのものかを示す。別のユーザーがログインしたときに
// 前のユーザーのデータを見せないための照合に使う (bindQueryCacheToUser 参照)。
const CACHE_OWNER_KEY = "react-query-cache-owner";

/**
 * 保存したキャッシュを復元してよい最長期間。QueryClient の gcTime (7日) と揃える
 * (gcTime の方が短いと、復元した直後にキャッシュが捨てられてしまう)。
 */
export const QUERY_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

/**
 * キャッシュの形式が変わったときに手で上げる番号。
 * アプリのバージョンが変わると buster も変わるので通常は触らなくてよい。
 * 同じバージョンのまま (開発中など) 保存済みキャッシュを捨てたいときにだけ上げる。
 */
const CACHE_SCHEMA_VERSION = 1;

export interface CacheStore {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
}

function getCacheEncryptionKey(): string | undefined {
  try {
    const SecureStore = require("expo-secure-store");
    const existing = SecureStore.getItem(CACHE_ENCRYPTION_KEY_NAME);
    if (typeof existing === "string" && existing.length > 0) return existing;

    const Crypto = require("expo-crypto");
    const bytes: Uint8Array = Crypto.getRandomBytes(32);
    const key = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    SecureStore.setItem(CACHE_ENCRYPTION_KEY_NAME, key);
    return key;
  } catch {
    return undefined;
  }
}

function createCacheStore(): CacheStore | null {
  try {
    const encryptionKey = getCacheEncryptionKey();
    if (!encryptionKey) return null;
    const { createMMKV } = require("react-native-mmkv");
    return createMMKV({ id: CACHE_STORE_ID, encryptionKey }) as CacheStore;
  } catch {
    // Expo Go やテスト環境: MMKV が使えないので永続化しない
    return null;
  }
}

/**
 * アプリのバージョンごとにキャッシュを分ける。
 * アップデートで取得データの形が変わると、古い形のキャッシュを新しい画面が読んで
 * 壊れる恐れがあるため、バージョンが変わったら保存済みキャッシュは捨てて取り直す。
 */
function resolveBuster(): string {
  let appVersion = "unknown";
  try {
    const Constants = require("expo-constants").default;
    appVersion = Constants?.expoConfig?.version ?? "unknown";
  } catch {
    // 取得できなくても永続化自体は続ける (手動の番号だけで判定する)
  }
  return `${appVersion}:${CACHE_SCHEMA_VERSION}`;
}

export interface QueryPersistence {
  /** 永続化の設定。保存先が用意できない環境では null (= 永続化しない) */
  persister: Persister | null;
  /** 保存済みキャッシュの復元が終わった (成功・失敗どちらでも) ことを知らせる */
  markRestored: () => void;
  /**
   * 端末に保存したキャッシュを消す (ログアウト時)。
   * メモリ上のキャッシュは呼び出し側で `queryClient.clear()` する。
   */
  clearPersisted: () => void;
  /**
   * 保存済みキャッシュを、いまログインしているユーザーに結び付ける。
   *
   * 通常はログアウト時にキャッシュを消すが、セッション切れのままアプリを閉じた場合などは
   * 消す機会が無いまま別のユーザーがログインし得る。クエリキーにユーザーIDを含まないもの
   * (カレンダーなど) は、そのままだと前のユーザーのデータが一瞬表示されてしまう。
   * 持ち主が違うと分かったら、表示する前にキャッシュを捨てる。
   *
   * @param clearMemoryCache メモリ上のキャッシュを消す関数 (`queryClient.clear()`)
   */
  bindToUser: (userId: string, clearMemoryCache: () => void) => Promise<void>;
}

/** 保存先 (store) を受け取って永続化の一式を組み立てる。store が null なら何もしない実装になる */
export function createQueryPersistence(store: CacheStore | null): QueryPersistence {
  const persister = store
    ? createAsyncStoragePersister({
        key: CACHE_STORAGE_KEY,
        storage: {
          getItem: (key) => store.getString(key) ?? null,
          setItem: (key, value) => store.set(key, value),
          removeItem: (key) => store.remove(key),
        },
        // キャッシュが変わるたびに全体を書き出すので、連続した更新はまとめて1回にする
        throttleTime: 2000,
      })
    : null;

  // 復元が終わる前に「別ユーザーなので消す」を実行すると、消した直後に復元が走って
  // 前のユーザーのデータが戻ってしまう。復元の完了を待てるようにしておく。
  let resolveRestored: () => void = () => {};
  const restored = new Promise<void>((resolve) => {
    resolveRestored = resolve;
  });
  if (!store) resolveRestored();

  return {
    persister,
    markRestored: () => resolveRestored(),
    clearPersisted: () => {
      if (!store) return;
      try {
        store.remove(CACHE_STORAGE_KEY);
        store.remove(CACHE_OWNER_KEY);
      } catch (error) {
        console.error("保存済みキャッシュの削除に失敗しました:", error);
      }
    },
    bindToUser: async (userId, clearMemoryCache) => {
      if (!store) return;
      await restored;
      try {
        const owner = store.getString(CACHE_OWNER_KEY);
        if (owner === userId) return;
        if (owner !== undefined) {
          clearMemoryCache();
          store.remove(CACHE_STORAGE_KEY);
        }
        store.set(CACHE_OWNER_KEY, userId);
      } catch (error) {
        console.error("キャッシュの持ち主の確認に失敗しました:", error);
      }
    },
  };
}

export const queryCacheBuster = resolveBuster();

/** アプリ全体で使う永続化 (暗号化 MMKV が使えない環境では何もしない) */
export const queryPersistence = createQueryPersistence(createCacheStore());
