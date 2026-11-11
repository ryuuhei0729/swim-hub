"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import { useBestTimesQuery } from "@apps/shared/hooks/queries/records";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { resolveAgeCategory } from "@apps/shared/utils/domesticRecords";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { useAuth } from "@/contexts/AuthProvider";
import { BestTimesTable, type BestTimesTableEdit } from "@/components/profile/BestTimesTable";
import { BestTimeInputGrid } from "@/components/besttime/BestTimeInputGrid";
import { useBestTimeBulkInput } from "@/components/besttime/useBestTimeBulkInput";
import { WaPointsInfoTooltip } from "@/components/ui/WaPointsInfoTooltip";
import { sectionSurface } from "@/constants/theme";
import { useToast } from "@/providers/ToastProvider";
import type { TabParamList } from "@/navigation/types";

export interface DashboardBestTimesSectionProps {
  /** 入力モードでマスを選んだとき、表と入力欄が見えるようにホームを末尾まで送る */
  onRequestReveal?: () => void;
  /** 入力モードに入った・抜けたことを知らせる (ホームの他の部分を暗くするのに使う) */
  onEditingChange?: (isEditing: boolean) => void;
  /**
   * 入力モードを抜ける操作 (キャンセルと同じ: 入力があれば破棄の確認、無ければそのまま抜ける) を
   * 呼び出し元に渡す。ホームの暗い部分を押したときに使う
   */
  exitRequestRef?: React.MutableRefObject<(() => void) | null>;
}

/**
 * ホームのベストタイム欄。
 * 2026-11-07 にマイページから見出し・一括入力・点数化の切り替え・表をそのまま移した (マイページからは削除)。
 * 見出しは水路タブ・「引き継ぎ含む」と同じ行に、表示切り替え・一括入力は表の下に置く。
 * 2026-11-10 に一括入力画面をやめ、「一括入力」を押すとこの表がそのまま入力モードに変わるようにした。
 */
export const DashboardBestTimesSection: React.FC<DashboardBestTimesSectionProps> = ({
  onRequestReveal,
  onEditingChange,
  exitRequestRef,
}) => {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList, "Dashboard">>();
  const [isWaPointsMode, setIsWaPointsMode] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const bulk = useBestTimeBulkInput();

  const {
    data: bestTimes = [],
    isLoading,
    isError,
    error,
  } = useBestTimesQuery(supabase, { userId: user?.id });
  const { profile } = useUserQuery(supabase, { enableRealtime: false });
  // 区分記録基準の初期選択に使う年齢区分 (生年月日そのものは BestTimesTable に渡さない)
  const ageCategory = useMemo(() => resolveAgeCategory(profile?.birthday), [profile?.birthday]);
  const errorMessage = error
    ? toUserFacingMessage(error, t("mypage.mobile.bestTimesFetchFailed"))
    : undefined;

  const title = <Text style={styles.sectionTitle}>Best Time</Text>;

  const startEditing = () => {
    setIsWaPointsMode(false);
    setIsEditing(true);
  };

  const exitEditing = useCallback(() => {
    Keyboard.dismiss();
    bulk.reset();
    setIsEditing(false);
  }, [bulk]);

  // 入力が残っていれば破棄してよいか確かめてから入力モードを抜ける
  const enteredCount = Object.keys(bulk.inputs).length;
  const confirmDiscard = useCallback(
    (onKeepEditing?: () => void) => {
      Alert.alert(
        t("mypage.bestTimesTable.edit.discardTitle"),
        t("mypage.bestTimesTable.edit.discardMessage", { count: enteredCount }),
        [
          {
            text: t("mypage.bestTimesTable.edit.keepEditing"),
            style: "cancel",
            onPress: onKeepEditing,
          },
          {
            text: t("mypage.bestTimesTable.edit.discardConfirm"),
            style: "destructive",
            onPress: exitEditing,
          },
        ],
      );
    },
    [enteredCount, exitEditing, t],
  );

  const handleCancel = useCallback(() => {
    if (enteredCount === 0) {
      exitEditing();
      return;
    }
    confirmDiscard();
  }, [enteredCount, exitEditing, confirmDiscard]);

  useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  useEffect(() => {
    if (!exitRequestRef) return;
    exitRequestRef.current = handleCancel;
    return () => {
      exitRequestRef.current = null;
    };
  }, [exitRequestRef, handleCancel]);

  // 入力が残ったまま他のタブへ移ったら、破棄してよいか確かめる。
  // iOS のネイティブのタブバーはタブの切り替えを JS から止められない (tabPress は preventDefault
  // できない) ので、切り替わった直後に確かめ、「入力を続ける」ならホームへ戻す。
  // ホームから別画面を重ねて開いた (タブはホームのまま) ときは確かめない
  useEffect(() => {
    if (!isEditing || enteredCount === 0) return;
    return navigation.addListener("blur", () => {
      const state = navigation.getState();
      const current = state.routes[state.index]?.name;
      if (current === undefined || current === "Dashboard") return;
      confirmDiscard(() => navigation.navigate("Dashboard"));
    });
  }, [isEditing, enteredCount, navigation, confirmDiscard]);

  // Android の戻るボタンは、入力モード中はアプリを閉じずにキャンセルとして扱う
  useEffect(() => {
    if (!isEditing) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleCancel();
      return true;
    });
    return () => sub.remove();
  }, [isEditing, handleCancel]);

  const handleSave = async () => {
    Keyboard.dismiss();
    const created = await bulk.save();
    if (created === null) return;
    toast.success(t("bulkBestTime.success.registered", { n: created }));
    exitEditing();
  };

  const edit: BestTimesTableEdit | undefined = isEditing
    ? {
        render: ({ poolType, isRelaying }) => (
          <>
            <BestTimeInputGrid
              key={`${poolType}_${isRelaying ? 1 : 0}`}
              bestTimes={bestTimes}
              poolType={poolType}
              isRelaying={isRelaying}
              inputs={bulk.inputs}
              onUpdateCell={bulk.updateCell}
              onClearCell={bulk.clearCell}
              disabled={bulk.saving}
              onRequestReveal={onRequestReveal}
            />
            {bulk.saveError && (
              <View style={styles.saveErrorBanner}>
                <Text style={styles.saveErrorText}>{bulk.saveError}</Text>
              </View>
            )}
          </>
        ),
      }
    : undefined;

  const editActions = (
    <>
      <Text style={styles.editCount}>
        {t("mypage.bestTimesTable.edit.inputCount", { count: bulk.records.length })}
      </Text>
      <View style={styles.editButtons}>
        <Pressable
          style={[styles.editButton, styles.editButtonGhost]}
          onPress={handleCancel}
          disabled={bulk.saving}
          accessibilityRole="button"
          testID="best-times-edit-cancel"
        >
          <Text style={styles.editButtonGhostText}>{t("mypage.bestTimesTable.edit.cancel")}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.editButton,
            styles.editButtonPrimary,
            (bulk.records.length === 0 || bulk.saving) && styles.editButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={bulk.records.length === 0 || bulk.saving}
          accessibilityRole="button"
          accessibilityState={{ disabled: bulk.records.length === 0 || bulk.saving }}
          testID="best-times-edit-save"
        >
          {bulk.saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.editButtonPrimaryText}>
              {t("mypage.bestTimesTable.edit.register", { count: bulk.records.length })}
            </Text>
          )}
        </Pressable>
      </View>
    </>
  );

  // 表の下の1行: 左に表示切り替え (タイム/点数)、右に一括入力。
  // 表示の切り替えは水路タブと同じセグメント形にして、今どちらを表示しているかを常に見せる。
  // 一括入力は別画面へ移る控えめな操作なので、枠の無いボタンにして右端へ寄せる。
  const viewModes = [
    { id: "time", isPoints: false, label: t("mypage.bestTimesTable.viewModeTime") },
    { id: "points", isPoints: true, label: t("mypage.bestTimesTable.viewModePoints") },
  ] as const;

  const actions = (
    <>
      <View style={styles.viewModeGroup}>
        <View style={styles.segment}>
          {viewModes.map((mode) => {
            const selected = isWaPointsMode === mode.isPoints;
            return (
              <Pressable
                key={mode.id}
                testID={mode.isPoints ? "best-times-wa-points-toggle" : "best-times-time-toggle"}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.segmentItem, selected && styles.segmentItemActive]}
                onPress={() => setIsWaPointsMode(mode.isPoints)}
              >
                <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>
                  {mode.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <WaPointsInfoTooltip
          testID="best-times-wa-info"
          ariaLabel={t("mypage.bestTimesTable.pointsInfoAriaLabel")}
          tooltipText={t("mypage.bestTimesTable.pointsInfo")}
        />
      </View>
      <Pressable
        style={styles.bulkInputButton}
        onPress={startEditing}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel={t("mypage.mobile.bulkInputAria")}
        hitSlop={8}
      >
        <Feather name="upload" size={13} color="#2563EB" />
        <Text style={styles.bulkInputText}>{t("mypage.mobile.bulkInput")}</Text>
      </Pressable>
    </>
  );

  return (
    <View style={styles.section} testID="dashboard-best-times">
      {isLoading || (isError && !isEditing) ? (
        <>
          <View style={styles.sectionHeader}>{title}</View>
          {isLoading ? (
            <ActivityIndicator color="#2563EB" style={styles.loading} />
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>
                {errorMessage || t("mypage.mobile.bestTimesFetchFailed")}
              </Text>
            </View>
          )}
          <View style={styles.actions}>{actions}</View>
        </>
      ) : (
        <BestTimesTable
          bestTimes={bestTimes}
          gender={profile?.gender}
          isWaPointsMode={isWaPointsMode}
          ageCategory={ageCategory}
          title={title}
          footer={isEditing ? editActions : actions}
          edit={edit}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  // 上の余白は呼び出し元 (ホーム) が持つ。入力モード中に、この欄の外側だけを暗くするため
  section: {
    ...sectionSurface,
    paddingVertical: 16,
  },
  sectionHeader: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  viewModeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  // 水路タブ (BestTimesTable の tabs/tab) と同じ寸法
  segment: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  segmentItem: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  segmentItemActive: {
    backgroundColor: "#2563EB",
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
  },
  segmentTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  bulkInputButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
  },
  bulkInputText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  editCount: {
    fontSize: 12,
    color: "#6B7280",
  },
  editButtons: {
    flexDirection: "row",
    gap: 8,
  },
  editButton: {
    height: 36,
    minWidth: 88,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  editButtonGhost: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  editButtonGhostText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  editButtonPrimary: {
    backgroundColor: "#2563EB",
  },
  editButtonDisabled: {
    backgroundColor: "#93C5FD",
  },
  editButtonPrimaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  saveErrorBanner: {
    marginHorizontal: 16,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  saveErrorText: {
    fontSize: 13,
    color: "#B91C1C",
  },
  loading: {
    paddingVertical: 24,
  },
  errorContainer: {
    padding: 20,
    alignItems: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
  },
});
