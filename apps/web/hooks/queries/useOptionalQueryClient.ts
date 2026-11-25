"use client";

import { useContext } from "react";
import { QueryClientContext, type QueryClient } from "@tanstack/react-query";

/**
 * QueryClientProvider が無ければ null を返す useQueryClient。
 *
 * ミューテーション後の invalidate だけを行う画面 (記録入力・練習ログ入力・
 * チーム画面の外枠など) で使う。本番ではアプリ全体が QueryProvider の内側にあるので
 * 常に QueryClient が返る。Provider 無しで描画する既存テストでも落ちないよう、
 * 読み取り専用のキャッシュを持たない経路はこれで取得する
 * (shared の useInvalidateTeamRankings と同じ考え方)。
 */
export function useOptionalQueryClient(): QueryClient | null {
  return useContext(QueryClientContext) ?? null;
}
