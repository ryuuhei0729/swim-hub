"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import { StyleAPI } from "@apps/shared/api/styles";
import { styleKeys } from "@apps/shared/hooks/queries/keys";
import { useUnreadRecordFeedbacksQuery } from "@apps/shared/hooks/queries/recordFeedbacks";
import type { UnreadRecordFeedback } from "@swim-hub/shared/types";
import type { MainStackParamList } from "@/navigation/types";
import type { StyleLike } from "@/utils/styleName";
import { RecordFeedbackArrivalPopup } from "./RecordFeedbackArrivalPopup";
import { dismissFeedbacks, filterUndismissedFeedbacks } from "./dismissedFeedbacks";

interface RecordFeedbackArrivalHostProps {
  /** 他のモーダル (目標の振り返りなど) を出している間は false にして重ねない */
  enabled: boolean;
}

/** 記録タブ側で開く対象を「記録画面へ」から渡すためのパラメータを組み立てる */
export function buildOpenRecordParams(feedback: UnreadRecordFeedback, nonce: string) {
  return {
    segment: "competitions" as const,
    openRecord: {
      recordId: feedback.record_id,
      competitionId: feedback.competition_id,
      competitionTitle: feedback.competition_title,
      competitionDate: feedback.competition_date,
      requestKey: nonce,
    },
  };
}

/**
 * ダッシュボードに置く、未読 FB の受信ポップアップの親。
 * ダッシュボードが表示されるたびに未読を取り直し、このセッションでまだ閉じていない
 * 未読 FB があればポップアップを出す (docs/specs/record-feedback.md)。
 */
export const RecordFeedbackArrivalHost: React.FC<RecordFeedbackArrivalHostProps> = ({ enabled }) => {
  const { supabase, user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  // 未読はマウント時に取得し、以降はダッシュボードの refreshAll (フォーカス時・プルリフレッシュ)
  // が recordFeedbackKeys.unread を invalidate して取り直す
  const unreadQuery = useUnreadRecordFeedbacksQuery(supabase, user?.id);
  const [popupItems, setPopupItems] = useState<UnreadRecordFeedback[] | null>(null);
  const focusedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      return () => {
        focusedRef.current = false;
      };
    }, []),
  );

  const stylesQuery = useQuery({
    queryKey: styleKeys.list(),
    queryFn: () => new StyleAPI(supabase).getStyles(),
    staleTime: 24 * 60 * 60 * 1000,
    enabled: popupItems !== null,
  });
  const stylesById = useMemo(
    () => new Map<number, StyleLike>((stylesQuery.data ?? []).map((s) => [s.id, s])),
    [stylesQuery.data],
  );

  // 取り直した未読から、まだ閉じていないものがあれば出す (表示中は内容を固定する)
  useEffect(() => {
    if (!enabled || popupItems !== null || !focusedRef.current) return;
    const pending = filterUndismissedFeedbacks(unreadQuery.data ?? []);
    if (pending.length > 0) setPopupItems(pending);
  }, [enabled, popupItems, unreadQuery.data]);

  const handleClose = useCallback(() => {
    if (popupItems) dismissFeedbacks(popupItems);
    setPopupItems(null);
  }, [popupItems]);

  const handleOpenRecord = useCallback(
    (feedback: UnreadRecordFeedback) => {
      // 開いた FB は記録画面で表示した時点で既読になる。同時に出ていた他の FB も
      // このセッションでは出し直さない (閉じるのと同じ扱い)
      if (popupItems) dismissFeedbacks(popupItems);
      setPopupItems(null);
      navigation.navigate("MainTabs", {
        screen: "Records",
        params: buildOpenRecordParams(feedback, `${feedback.id}:${Date.now()}`),
      });
    },
    [navigation, popupItems],
  );

  if (!popupItems || popupItems.length === 0) return null;

  return (
    <RecordFeedbackArrivalPopup
      feedbacks={popupItems}
      stylesById={stylesById}
      onClose={handleClose}
      onOpenRecord={handleOpenRecord}
    />
  );
};
