"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts";
import { RecordAPI } from "@apps/shared/api/records";
import { getShareBadgeState, type ShareBadgeState } from "@/components/share/utils";
import { BestBadge } from "@/components/share/BestBadge";

interface RecordBestBadgeProps {
  recordId: string;
  styleId?: number;
  poolType?: number | null;
  currentTime: number;
  isRelaying?: boolean;
  recordDate?: string | null;
}

/**
 * 大会記録詳細画面のタイム横に表示する自己ベスト3状態バッジ。
 * シェアカードと同じ配色・意味で表示する。
 * - 初記録: 「初」(amber)
 * - 自己ベスト更新 (±0含む): 差分 (blue)
 * - ベストより遅い: 差分 (red)
 * - 判定不能 (styleId なし / time 0 / エラー): 非表示
 */
export default function RecordBestBadge({
  recordId,
  styleId,
  poolType,
  currentTime,
  isRelaying,
  recordDate,
}: RecordBestBadgeProps) {
  const { supabase } = useAuth();
  const [state, setState] = useState<ShareBadgeState>({ kind: "none" });

  useEffect(() => {
    let active = true;
    (async () => {
      // recordDate が無ければ「初」の誤表示防止のため非表示にする
      if (styleId == null || Number.isNaN(styleId) || !recordId || !currentTime || !recordDate) {
        if (active) setState({ kind: "none" });
        return;
      }
      try {
        const prev = await new RecordAPI(supabase).getPreviousBestTime(
          styleId,
          poolType ?? 0,
          recordId,
          isRelaying ?? false,
          recordDate,
        );
        const next = getShareBadgeState(
          currentTime,
          prev === null ? undefined : prev,
          prev === null,
        );
        if (active) setState(next);
      } catch {
        // 取得失敗時は非表示（初の誤表示防止）
        if (active) setState({ kind: "none" });
      }
    })();
    return () => {
      active = false;
    };
  }, [recordId, styleId, poolType, currentTime, isRelaying, recordDate, supabase]);

  return <BestBadge state={state} />;
}
