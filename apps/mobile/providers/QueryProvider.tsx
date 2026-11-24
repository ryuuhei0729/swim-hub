// =============================================================================
// QueryProvider - React Queryのプロバイダーコンポーネント
// =============================================================================

import React from "react";
import { AppState, Platform } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  QueryClientProvider,
  QueryClient,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  QUERY_CACHE_MAX_AGE,
  queryCacheBuster,
  queryPersistence,
} from "@/lib/queryPersistence";
import { isNetworkError } from "@apps/shared/utils/networkError";
import { isNetInfoOnline } from "@/hooks/useNetworkStatus";

// React Query公式推奨: AppStateでfocusManagerを連動させる
// https://tanstack.com/query/latest/docs/framework/react/react-native
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener("change", (state) => {
    if (Platform.OS !== "web") {
      handleFocus(state === "active");
    }
  });
  return () => subscription.remove();
});

// React Query公式推奨: NetInfo で onlineManager を連動させる
// https://tanstack.com/query/latest/docs/framework/react/react-native#online-status-management
// React Native にはブラウザの online/offline イベントが無いため、これが無いと React Query は
// 常に「オンライン」と判断し、圏外でも再取得を走らせ、復帰時の自動再取得 (refetchOnReconnect)
// も発火しない。
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(isNetInfoOnline(state));
  });
});

/** 通信エラー以外 (サーバーが返したエラー等) のリトライ上限 */
const MAX_QUERY_RETRIES = 3;

/**
 * クエリのリトライ判定。
 *
 * 通信起因の失敗 (圏外・タイムアウト・接続断) はリトライしない。リトライすると
 * 1秒/2秒/4秒の待ちが積み重なり、エラー表示まで7秒以上 (タイムアウトなら1分以上)
 * 待たされるため。すぐにエラーを出し、利用者が「再試行」を押せるようにする。
 * 電波が戻ったときは onlineManager 経由の refetchOnReconnect で自動的に取り直す。
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (!onlineManager.isOnline()) return false;
  if (isNetworkError(error)) return false;
  return failureCount < MAX_QUERY_RETRIES;
}

/**
 * 圏外のときに、手元にあるキャッシュを捨ててまで再取得しないための判定。
 * (画面表示時・アプリ復帰時の再取得が圏外で失敗すると、見えていた一覧がエラー画面に
 * 置き換わってしまう。データが無いときの初回取得はこの設定に関係なく行われる)
 */
const refetchOnlyWhenOnline = () => onlineManager.isOnline();

let queryClient: QueryClient | undefined = undefined;

/**
 * モバイル用のQueryClientを作成
 * オフライン対応のための最適化設定を追加
 */
function createMobileQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 10, // 10分
        // 7日間。端末にも保存し、次回起動時に復元する (lib/queryPersistence.ts)。
        // 復元できる最長期間 (QUERY_CACHE_MAX_AGE) より短くしないこと
        gcTime: QUERY_CACHE_MAX_AGE,
        refetchOnWindowFocus: refetchOnlyWhenOnline, // AppState連動でバックグラウンド復帰時に再取得
        refetchOnMount: refetchOnlyWhenOnline,
        refetchOnReconnect: true, // オンライン復帰時に自動再取得 (onlineManager 連動)
        retry: shouldRetryQuery,
        // "online" (既定) だと圏外ではクエリが一時停止 (paused) し、データが無い画面では
        // 読み込み表示もエラー表示も出ないまま空の画面になる。"always" にして即座に失敗させ、
        // エラー表示と再試行ボタンを出す。圏外での不要な再取得は refetchOnlyWhenOnline で抑える。
        networkMode: "always",
      },
      mutations: {
        retry: 0, // ミューテーションはリトライしない (重複登録を避けるため)
        // "online" だと圏外では保存が一時停止し、電波が戻るまで保存ボタンが回り続ける
        // (しかもアプリを閉じると保存内容は失われる)。即座に失敗させて通信エラーを伝える。
        networkMode: "always",
      },
    },
  });
}

/**
 * QueryClientを取得する関数
 * React Nativeではシングルトンインスタンスを返す
 */
export function getQueryClient() {
  if (!queryClient) {
    queryClient = createMobileQueryClient();
  }
  return queryClient;
}

/**
 * ログアウト時に、メモリ上と端末に保存したキャッシュの両方を消す
 * (次にログインする別のユーザーへ前のユーザーのデータを見せないため)
 */
export function clearQueryCache(): void {
  getQueryClient().clear();
  queryPersistence.clearPersisted();
}

/**
 * ログインしたユーザーが、保存済みキャッシュの持ち主と違えばキャッシュを捨てる
 * (セッション切れなど、ログアウト処理を通らずにユーザーが替わった場合の備え)
 */
export function bindQueryCacheOwner(userId: string): void {
  void queryPersistence.bindToUser(userId, () => getQueryClient().clear());
}

interface QueryProviderProps {
  children: React.ReactNode;
}

/**
 * React Queryのプロバイダーコンポーネント
 *
 * 保存先 (暗号化 MMKV) が使える端末では、キャッシュを端末に保存して次回起動時に復元する。
 * 復元が終わるまでクエリは走らないので、復元したデータがあればそれを先に表示し、
 * 古ければ (staleTime 超過) その後に裏で取り直す。
 */
export default function QueryProvider({ children }: QueryProviderProps) {
  const queryClient = getQueryClient();

  const { persister } = queryPersistence;
  if (!persister) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: QUERY_CACHE_MAX_AGE,
        buster: queryCacheBuster,
      }}
      onSuccess={queryPersistence.markRestored}
      onError={queryPersistence.markRestored}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
