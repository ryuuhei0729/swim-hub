"use client";

import React, { useRef, useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { AttendanceStatusType } from "@swim-hub/shared/types";

const STATUS_ORDER: AttendanceStatusType[] = ["open", "closed"];

/** 大会カードのエントリー受付ステータス (TeamCompetitionList の ENTRY_STATUS_BADGE) と同じ配色 */
const BADGE: Record<AttendanceStatusType, { container: object; color: string }> = {
  open: { container: { backgroundColor: "#DCFCE7" }, color: "#166534" },
  closed: { container: { backgroundColor: "#FEE2E2" }, color: "#991B1B" },
};

const LABEL_KEYS: Record<AttendanceStatusType, string> = {
  open: "teams.mobile.adminAttendance.statusOpen",
  closed: "teams.mobile.adminAttendance.statusClosed",
};

const PANEL_WIDTH = 150;

interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AttendanceStatusBadgeProps {
  status: AttendanceStatusType;
}

/** 受付状態のバッジ (押せない表示用)。まとめて変更中などに使う */
export const AttendanceStatusBadge: React.FC<AttendanceStatusBadgeProps> = ({ status }) => {
  const { t } = useTranslation();
  return (
    <View style={[styles.badge, BADGE[status].container]}>
      <Text style={[styles.badgeText, { color: BADGE[status].color }]}>{t(LABEL_KEYS[status])}</Text>
    </View>
  );
};

interface AttendanceStatusDropdownProps {
  status: AttendanceStatusType;
  /** 今と違う状態を選んだとき (確認は呼び出し側) */
  onSelect: (status: AttendanceStatusType) => void;
  accessibilityLabel: string;
  testID?: string;
}

/**
 * 受付状態 (受付中 / 締切) のプルダウン。
 * 見た目と動きは大会カードのエントリー受付ステータスと同じ (バッジを押すと真下に選択肢が開く)。
 * 一覧の行は角丸のカードに切り抜かれているため、選択肢は画面全体に重ねたレイヤーに出し、
 * 押したバッジの位置を測ってその真下 (右端そろえ) に置く。
 */
export const AttendanceStatusDropdown: React.FC<AttendanceStatusDropdownProps> = ({
  status,
  onSelect,
  accessibilityLabel,
  testID,
}) => {
  const { t } = useTranslation();
  const badgeRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const open = anchor !== null;

  const openMenu = () => {
    const node = badgeRef.current;
    if (node && typeof node.measureInWindow === "function") {
      node.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
    } else {
      setAnchor({ x: 0, y: 0, width: 0, height: 0 });
    }
  };
  const closeMenu = () => setAnchor(null);

  return (
    <>
      <Pressable
        ref={badgeRef}
        style={[styles.badge, styles.badgeButton, BADGE[status].container]}
        onPress={openMenu}
        hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        testID={testID}
      >
        <Text style={[styles.badgeText, { color: BADGE[status].color }]}>{t(LABEL_KEYS[status])}</Text>
        <Feather name="chevron-down" size={12} color={BADGE[status].color} />
      </Pressable>
      <Modal visible={open} transparent animationType="none" onRequestClose={closeMenu} statusBarTranslucent>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeMenu}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        />
        {anchor && (
          <View
            style={[
              styles.panel,
              {
                top: anchor.y + anchor.height + 4,
                left: Math.max(8, anchor.x + anchor.width - PANEL_WIDTH),
              },
            ]}
          >
            {STATUS_ORDER.map((value) => {
              const active = value === status;
              const label = t(LABEL_KEYS[value]);
              return (
                <Pressable
                  key={value}
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                  onPress={() => {
                    closeMenu();
                    if (!active) onSelect(value);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t("teams.mobile.teamCompetitionEntryModal.changeStatusAria", {
                    status: label,
                  })}
                  testID={testID ? `${testID}-option-${value}` : undefined}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{label}</Text>
                  {active && <Feather name="check" size={14} color="#2563EB" />}
                </Pressable>
              );
            })}
          </View>
        )}
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  // TeamCompetitionList の entryStatusBadge / entryStatusBadgeAdmin / entryStatusBadgeText と同じ寸法
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    flexShrink: 0,
  },
  badgeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  // TeamCompetitionList の statusMenuPanel / statusMenuItem と同じ見た目
  panel: {
    position: "absolute",
    width: PANEL_WIDTH,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  optionPressed: {
    backgroundColor: "#F9FAFB",
  },
  optionText: {
    fontSize: 13,
    color: "#374151",
  },
  optionTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },
});
