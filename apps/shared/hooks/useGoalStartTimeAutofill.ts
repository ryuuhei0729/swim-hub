"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { RecordAPI } from "../api/records";
import { pickGoalStartTime } from "../utils/goalStartTime";
import { recordKeys } from "./queries/keys";

export interface UseGoalStartTimeAutofillParams {
  supabase: SupabaseClient;
  /** フォームが開いている間 true。false→true で内部状態をリセットし、取得を始める */
  active: boolean;
  /** 編集時は既存値の流し込み後に true。それまでは自動入力もキー記録もしない */
  isInitialized: boolean;
  isEdit: boolean;
  /** 種目ID (文字列。未選択は "") */
  styleId: string;
  /** 対象大会の水路。大会未選択なら undefined (短水路に倒さない) */
  poolType: number | undefined;
  /** 値が変わると内部状態 (基準・手入力・自動入力済みキー) をリセットする */
  resetSignal: unknown;
  /** 自動入力の結果 (ベスト無しは null) */
  onApply: (startTime: number | null) => void;
}

export interface UseGoalStartTimeAutofillResult {
  /** 初期タイムを手入力したときに呼ぶ。現在の種目 × 水路では自動入力で上書きしない */
  markTouched: () => void;
  /** onApply のたびに増える。初期タイム欄の `key` に渡して再マウントする */
  resetKey: number;
  /** ベスト取得中 (placeholder を loading にする用) */
  isLoadingBest: boolean;
}

/**
 * 目標フォームの初期タイムを「種目 × 対象大会の水路」の自己ベストで自動入力する。
 * 全種目のベストを1回取得して手元で引くため、種目を素早く切り替えても古い応答に上書きされない。
 */
export function useGoalStartTimeAutofill({
  supabase,
  active,
  isInitialized,
  isEdit,
  styleId,
  poolType,
  resetSignal,
  onApply,
}: UseGoalStartTimeAutofillParams): UseGoalStartTimeAutofillResult {
  // 種目 × 水路の自動入力を最後に反映したキー。編集で開いた直後は保存済みの値を守るため基準にだけ使う
  const autofillKeyRef = useRef<string | null>(null);
  // ユーザーが手入力した種目 × 水路のキー。そのキーでは自動入力で上書きしない
  const touchedKeyRef = useRef<string | null>(null);
  // active になった時刻。これより前に取得したデータは使わない
  const activeSinceRef = useRef(0);
  // リセットのたびに増やし、effect を再評価させる
  const epochRef = useRef(0);
  const prevActiveRef = useRef(false);
  const prevSignalRef = useRef<unknown>(resetSignal);
  const [resetKey, setResetKey] = useState(0);

  // リセットは描画中に行う。effect だと、再オープン直後の1回目の描画で
  // 前回のキャッシュを「開いた後のデータ」と誤認するため
  const opened = active && !prevActiveRef.current;
  const signalChanged = !Object.is(prevSignalRef.current, resetSignal);
  if (opened || signalChanged) {
    autofillKeyRef.current = null;
    touchedKeyRef.current = null;
    epochRef.current += 1;
  }
  if (opened) activeSinceRef.current = Date.now();
  prevActiveRef.current = active;
  prevSignalRef.current = resetSignal;

  // 記録画面で更新した直後のベストを使うため、キャッシュを持たず毎回取得し直す
  const query = useQuery({
    queryKey: [...recordKeys.all, "bestTimesForForm"],
    queryFn: () => new RecordAPI(supabase).getBestTimes(),
    gcTime: 0,
    staleTime: 0,
    enabled: active,
  });
  const bestTimes =
    active && query.dataUpdatedAt >= activeSinceRef.current ? query.data : undefined;

  const autofillKey = styleId && poolType !== undefined ? `${styleId}:${poolType}` : null;
  const autofillKeyNowRef = useRef(autofillKey);
  autofillKeyNowRef.current = autofillKey;
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;

  const markTouched = useCallback(() => {
    touchedKeyRef.current = autofillKeyNowRef.current;
  }, []);

  const epoch = epochRef.current;
  useEffect(() => {
    if (!active || !isInitialized || autofillKey === null || poolType === undefined) return;
    if (autofillKey === autofillKeyRef.current) return;
    // 別のキーへ移ったら手入力の記録は破棄する (戻ってきたときは通常どおり自動入力する)
    if (touchedKeyRef.current !== autofillKey) touchedKeyRef.current = null;
    if (isEdit && autofillKeyRef.current === null) {
      autofillKeyRef.current = autofillKey;
      return;
    }
    // 取得中・取得失敗のあいだは値を変えない
    if (!bestTimes) return;
    autofillKeyRef.current = autofillKey;
    // このキーで既に手入力されていれば上書きしない
    if (touchedKeyRef.current === autofillKey) return;
    onApplyRef.current(pickGoalStartTime(bestTimes, parseInt(styleId, 10), poolType));
    setResetKey((k) => k + 1);
  }, [active, isInitialized, isEdit, autofillKey, styleId, poolType, bestTimes, epoch]);

  return {
    markTouched,
    resetKey,
    isLoadingBest: active && autofillKey !== null && !bestTimes && query.isFetching,
  };
}
