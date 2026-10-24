// =============================================================================
// 理想LAP React Queryフック - Swim Hub共通パッケージ
// =============================================================================
// race_pace_models は全ユーザー共通の参照データで更新頻度が極端に低い
// (バッチ再生成のときだけ変わる) ため、長めにキャッシュする。
// =============================================================================

"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";
import { RacePaceModelAPI, type RacePaceQuery } from "../../api/racePaceModels";
import { resolveTargetLaps, type RacePaceModel, type ResolveResult } from "../../utils/racePace";
import { racePaceKeys } from "./keys";

/** マスタ相当なので長めに持つ */
const STALE_TIME_MS = 24 * 60 * 60 * 1000;

function keyFilters(query: RacePaceQuery) {
  return {
    gender: query.gender,
    poolType: query.poolType,
    stroke: query.stroke,
    distance: query.distance,
    ageCategory: query.ageCategory ?? "all",
  };
}

/**
 * 条件に合うモデルを bucket 全件取得する。
 * 目標タイムを変えるたびに再取得しないよう、取得と解決を分けている。
 */
export function useRacePaceModelsQuery(
  supabase: SupabaseClient,
  query: RacePaceQuery | null,
): UseQueryResult<RacePaceModel[]> {
  const api = useMemo(() => new RacePaceModelAPI(supabase), [supabase]);

  return useQuery({
    queryKey: query ? racePaceKeys.models(keyFilters(query)) : racePaceKeys.all,
    queryFn: () => api.getModels(query as RacePaceQuery),
    enabled: query !== null,
    staleTime: STALE_TIME_MS,
    gcTime: STALE_TIME_MS,
  });
}

export interface UseTargetLapsResult {
  /** 解決できなければ null (該当データなし) */
  data: ResolveResult | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** モデルは取れたが目標タイムに対して解決できなかった */
  hasModels: boolean;
}

/**
 * 目標タイムから理想LAPを返す。
 * モデル取得は React Query がキャッシュし、目標タイムの変更は
 * ネットワークを介さずクライアント側で再計算される。
 */
export function useTargetLaps(
  supabase: SupabaseClient,
  query: RacePaceQuery | null,
  targetTimeMs: number | null,
): UseTargetLapsResult {
  const modelsQuery = useRacePaceModelsQuery(supabase, query);
  const models = modelsQuery.data;

  const data = useMemo(() => {
    if (!models || models.length === 0 || !targetTimeMs || targetTimeMs <= 0) return null;
    return resolveTargetLaps({ models, targetTimeMs });
  }, [models, targetTimeMs]);

  return {
    data,
    isLoading: modelsQuery.isLoading,
    isError: modelsQuery.isError,
    error: modelsQuery.error,
    hasModels: (models?.length ?? 0) > 0,
  };
}

/**
 * その条件で理想LAPを出せるタイム範囲。
 * 「まだデータがありません」「51.00〜1:12.00 に対応」等の案内に使う。
 */
export function useRacePaceCoverageQuery(supabase: SupabaseClient, query: RacePaceQuery | null) {
  const api = useMemo(() => new RacePaceModelAPI(supabase), [supabase]);

  return useQuery({
    queryKey: query ? racePaceKeys.coverage(keyFilters(query)) : racePaceKeys.all,
    queryFn: () => api.getCoverage(query as RacePaceQuery),
    enabled: query !== null,
    staleTime: STALE_TIME_MS,
    gcTime: STALE_TIME_MS,
  });
}
