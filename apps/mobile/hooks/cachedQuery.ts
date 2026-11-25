"use client";

// =============================================================================
// 「前回のデータをすぐ見せて、裏で取り直す」画面のための共通部品（モバイル版）
// =============================================================================

import { useEffect, useRef } from "react";
import { hashKey, useQueryClient, type QueryKey } from "@tanstack/react-query";

/**
 * 「開くたびに取り直すが、取り直している間は前回のデータを見せる」ための staleTime。
 *
 * これらの画面はもともと開くたびに最新を取得していた。他の端末・他のメンバーの操作で
 * 変わるデータ (エントリー・記録・グループの所属) なので、鮮度は従来どおりに保ち、
 * 変えるのは「待っている間に何を見せるか」だけにする。
 */
export const ALWAYS_REVALIDATE = 0;

/**
 * 「キャッシュがあればそれを見せる」画面のための読み込み中・失敗の判定。
 *
 * React Query の isPending / isError をそのまま使うと、取り直し中や取り直しの失敗でも
 * スピナーやエラー表示に切り替わり、せっかく手元にあるデータが隠れてしまう。
 * 手元にデータが無いときだけ読み込み中・失敗として扱う。
 */
export function getCachedQueryStatus(query: {
  data: unknown;
  isFetching: boolean;
  isError: boolean;
}): { isLoading: boolean; isFailed: boolean } {
  const hasData = query.data !== undefined;
  return {
    isLoading: !hasData && query.isFetching,
    isFailed: !hasData && query.isError && !query.isFetching,
  };
}

/**
 * 書き込みで無効化されたキャッシュを、取り直しが終わるまで「読み込み中」として扱うための判定。
 *
 * 前回のデータをすぐ見せるのは「開き直しただけ」のときに限りたい。記録を保存・削除した直後に
 * 古い内容が一瞬でも出ると「保存されなかった」ように見えるため、invalidateQueries で
 * 無効化されたものは取り直しが済むまで見せない。取り直しに失敗した場合 (圏外など) は
 * 手元の内容に戻す。
 */
export function useIsAwaitingFreshData(queryKey: QueryKey, isFetching: boolean): boolean {
  const queryClient = useQueryClient();
  return isFetching && queryClient.getQueryState(queryKey)?.isInvalidated === true;
}

/**
 * 親から渡された値 (カレンダーの項目など) が差し替わったら、そのクエリを無効化して取り直す。
 *
 * 日別の詳細は、カレンダーの一覧とは別に詳細データを取得している。記録を編集・削除して
 * 一覧が更新されたとき、詳細側も取り直さないと古い内容が残る。初回は useQuery 自身が
 * 取得するので何もしない。
 */
export function useInvalidateWhenChanged(value: unknown, queryKey: QueryKey): void {
  const queryClient = useQueryClient();
  const previous = useRef(value);
  // キーは毎レンダー新しい配列になるので、中身 (ハッシュ) が変わったときだけ追従する
  const queryKeyHash = hashKey(queryKey);
  const queryKeyRef = useRef(queryKey);
  useEffect(() => {
    queryKeyRef.current = queryKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey は中身 (queryKeyHash) で比較する
  }, [queryKeyHash]);
  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    void queryClient.invalidateQueries({ queryKey: queryKeyRef.current, exact: true });
  }, [value, queryClient]);
}
