"use client";

import React, { useEffect, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { CenterModal } from "@/components/ui/CenterModal";
import { useCenterModalMaxHeight } from "@/components/goals/useCenterModalMaxHeight";
import { formatTime } from "@/utils/formatters";
import { localizedStyleName, type StyleLike } from "@/utils/styleName";
import type { UnreadRecordFeedback } from "@swim-hub/shared/types";

/** 「手紙が届く」アニメーションの長さ (ms)。終わったら一覧のポップアップに切り替える */
export const FEEDBACK_ARRIVAL_ANIMATION_MS = 3000;

interface RecordFeedbackArrivalPopupProps {
  /** 表示する未読 FB (新しい順) */
  feedbacks: UnreadRecordFeedback[];
  /** style_id → 種目マスター (種目名の表示用) */
  stylesById: Map<number, StyleLike>;
  onClose: () => void;
  onOpenRecord: (feedback: UnreadRecordFeedback) => void;
}

/** 封筒が上から落ちてきて弾み、中から手紙が少し顔を出すアニメーション */
const LetterArrivalAnimation: React.FC<{ onSkip: () => void }> = ({ onSkip }) => {
  const { t } = useTranslation();
  const translateY = useSharedValue(-260);
  const rotate = useSharedValue(-12);
  const letterLift = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    translateY.set(withSpring(0, { damping: 9, stiffness: 110 }));
    rotate.set(
      withSequence(
        withTiming(8, { duration: 450, easing: Easing.out(Easing.quad) }),
        withTiming(-5, { duration: 260 }),
        withTiming(0, { duration: 220 }),
      ),
    );
    letterLift.set(withDelay(1100, withTiming(-34, { duration: 700, easing: Easing.out(Easing.cubic) })));
    glow.set(withDelay(1300, withTiming(1, { duration: 600 })));
  }, [translateY, rotate, letterLift, glow]);

  const envelopeStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }, { rotate: `${rotate.get()}deg` }],
  }));
  const letterStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: letterLift.get() }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.get(),
    transform: [{ scale: 0.8 + glow.get() * 0.4 }],
  }));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onSkip}>
      <Pressable
        testID="record-feedback-arrival-animation"
        style={styles.animationOverlay}
        onPress={onSkip}
        accessibilityRole="button"
        accessibilityLabel={t("recordFeedbackMobile.arrival.skipAnimation")}
      >
        <Animated.View style={[styles.envelopeWrap, envelopeStyle]}>
          <Animated.View style={[styles.glow, glowStyle]} />
          <Animated.View style={[styles.letter, letterStyle]}>
            <View style={styles.letterLine} />
            <View style={[styles.letterLine, styles.letterLineShort]} />
          </Animated.View>
          <View style={styles.envelope}>
            <Feather name="mail" size={64} color="#7C3AED" />
          </View>
        </Animated.View>
        <Text style={styles.animationText}>{t("recordFeedbackMobile.arrival.animationText")}</Text>
      </Pressable>
    </Modal>
  );
};

/**
 * ダッシュボードの FB 受信ポップアップ。
 * 約3秒の「手紙が届く」アニメーションのあと、未読 FB の一覧を出す。
 * タップでアニメーションを飛ばせる。OS の「視差効果を減らす」が有効ならアニメーションを出さない。
 */
export const RecordFeedbackArrivalPopup: React.FC<RecordFeedbackArrivalPopupProps> = ({
  feedbacks,
  stylesById,
  onClose,
  onOpenRecord,
}) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const maxHeight = useCenterModalMaxHeight();
  const [phase, setPhase] = useState<"animation" | "list">(reduceMotion ? "list" : "animation");

  useEffect(() => {
    if (phase !== "animation") return;
    const timer = setTimeout(() => setPhase("list"), FEEDBACK_ARRIVAL_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  if (phase === "animation") {
    return <LetterArrivalAnimation onSkip={() => setPhase("list")} />;
  }

  return (
    <CenterModal
      visible
      onClose={onClose}
      closeAccessibilityLabel={t("recordFeedbackMobile.arrival.close")}
      contentStyle={{ maxHeight }}
    >
      <View style={styles.titleRow} testID="record-feedback-arrival-list">
        <Feather name="mail" size={20} color="#7C3AED" />
        <Text style={styles.title}>{t("recordFeedbackMobile.arrival.title")}</Text>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {feedbacks.map((feedback) => {
          const authorName = feedback.author_name ?? t("recordFeedbackMobile.deletedUser");
          const style = stylesById.get(feedback.style_id);
          const styleName = style ? localizedStyleName(style, t) : "";
          const competitionTitle =
            feedback.competition_title ||
            (feedback.competition_id
              ? t("recordMobile.fallbackTitle")
              : `(${t("competition.client.bulkInputLabel")})`);
          const recordLine = [competitionTitle, styleName, formatTime(feedback.time)]
            .filter(Boolean)
            .join(" · ");
          return (
            <View key={feedback.id} style={styles.item} testID={`record-feedback-arrival-item-${feedback.id}`}>
              <Text style={styles.itemTitle}>
                {t("recordFeedbackMobile.arrival.from", { name: authorName })}
              </Text>
              <Text style={styles.itemRecord} numberOfLines={2}>
                {recordLine}
                {feedback.is_relaying && <Text style={styles.relayMark}> R</Text>}
              </Text>
              <Pressable
                testID={`record-feedback-arrival-open-${feedback.id}`}
                style={styles.openButton}
                onPress={() => onOpenRecord(feedback)}
                accessibilityRole="button"
                accessibilityLabel={`${t("recordFeedbackMobile.arrival.openRecord")} ${recordLine}`}
              >
                <Text style={styles.openButtonText}>{t("recordFeedbackMobile.arrival.openRecord")}</Text>
                <Feather name="chevron-right" size={16} color="#FFFFFF" />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      <Pressable
        testID="record-feedback-arrival-close"
        style={styles.closeButton}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t("recordFeedbackMobile.arrival.close")}
      >
        <Text style={styles.closeButtonText}>{t("recordFeedbackMobile.arrival.close")}</Text>
      </Pressable>
    </CenterModal>
  );
};

const styles = StyleSheet.create({
  animationOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17, 24, 39, 0.55)",
    gap: 24,
  },
  envelopeWrap: {
    width: 140,
    height: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(196, 181, 253, 0.45)",
  },
  letter: {
    position: "absolute",
    top: 34,
    width: 72,
    height: 56,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    padding: 8,
    gap: 6,
  },
  letterLine: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD6FE",
  },
  letterLineShort: {
    width: "60%",
  },
  envelope: {
    width: 110,
    height: 110,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  animationText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingRight: 28,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    flexShrink: 1,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 10,
  },
  item: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#FAF5FF",
    borderWidth: 1,
    borderColor: "#E9D5FF",
    gap: 6,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  itemRecord: {
    fontSize: 13,
    color: "#4B5563",
  },
  relayMark: {
    fontWeight: "bold",
    color: "#DC2626",
  },
  openButton: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#7C3AED",
  },
  openButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  closeButton: {
    marginTop: 14,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
});
