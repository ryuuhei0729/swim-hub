import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Feather } from "@expo/vector-icons";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { CompetitionShareCard } from "./CompetitionShareCard";
import { PracticeShareCard } from "./PracticeShareCard";
import type { CompetitionShareData, PracticeShareData } from "./types";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { SlideUpModal } from "@/components/ui/SlideUpModal";

type ShareCardType = "competition" | "practice";

interface ShareCardModalProps {
  visible: boolean;
  onClose: () => void;
  type: ShareCardType;
  data: CompetitionShareData | PracticeShareData | null;
}

/**
 * シェアカードモーダル（web ShareCardModal のモバイル版）。
 * カードを画像化して OS の共有シートに渡す。
 */
export const ShareCardModal: React.FC<ShareCardModalProps> = ({
  visible,
  onClose,
  type,
  data,
}) => {
  const { t } = useTranslation();
  const insets = useSafeInsets();
  const cardRef = useRef<View>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const titleKey =
    type === "competition"
      ? "common.shareCardModal.competitionTitle"
      : "common.shareCardModal.practiceTitle";

  const handleShare = async () => {
    if (!cardRef.current || isGenerating) return;
    setIsGenerating(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert(
          t("common.error"),
          t("common.shareCardModal.shareUnavailable"),
        );
        return;
      }
      const uri = await captureRef(cardRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: t(titleKey),
        UTI: "public.png",
      });
    } catch (err) {
      console.error("シェア画像の生成に失敗しました:", err);
      Alert.alert(t("common.error"), t("common.shareCardModal.generateFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  if (!data) return null;

  return (
    <SlideUpModal
      visible={visible}
      onClose={onClose}
      overlayColor="rgba(0, 0, 0, 0.6)"
      backdropAccessibilityLabel={t("common.shareCardModal.closeOverlay")}
      sheetStyle={[
        styles.sheet,
        { paddingBottom: getSafeFooterPadding(34, insets.bottom) },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t(titleKey)}</Text>
        <Pressable
          onPress={onClose}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t("common.shareCardModal.close")}
        >
          <Feather name="x" size={24} color="#9CA3AF" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.preview}
        showsVerticalScrollIndicator={false}
      >
        {/* collapsable={false}: Android で captureRef の対象ビューを確実に保持する */}
        <View ref={cardRef} collapsable={false} style={styles.captureWrap}>
          {type === "competition" ? (
            <CompetitionShareCard data={data as CompetitionShareData} t={t} />
          ) : (
            <PracticeShareCard data={data as PracticeShareData} t={t} />
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[
            styles.shareButton,
            isGenerating && styles.shareButtonDisabled,
          ]}
          onPress={handleShare}
          disabled={isGenerating}
          accessibilityRole="button"
          accessibilityLabel={t("common.shareCardModal.share")}
        >
          {isGenerating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Feather name="share-2" size={18} color="#FFFFFF" />
              <Text style={styles.shareButtonText}>
                {t("common.shareCardModal.share")}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </SlideUpModal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#111827",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "88%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  preview: {
    alignItems: "center",
    padding: 16,
  },
  captureWrap: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    overflow: "hidden",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#1F2937",
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1D4ED8",
    borderRadius: 12,
    paddingVertical: 14,
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
