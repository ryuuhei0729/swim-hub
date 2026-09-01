import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { PracticeTag } from "@apps/shared/types";
import { PRESET_TAG_COLORS, getColorForName } from "@/constants/tagColors";

interface TagManageModalProps {
  visible: boolean;
  onClose: () => void;
  tag: PracticeTag | null;
  onSave: (name: string, color: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  /**
   * このモーダルが実際に閉じ終わったタイミングで呼ばれる (iOS は onDismiss、Android は
   * visible=false を発火条件とし、実装内の分岐理由は本体コメントを参照。
   * components/ui/SlideUpModal.tsx の onClosed と同じ意図)。初回マウント時は発火しない。
   */
  onClosed?: () => void;
}

/**
 * タグ作成/編集/削除モーダル
 */
export const TagManageModal: React.FC<TagManageModalProps> = ({
  visible,
  onClose,
  tag,
  onSave,
  onDelete,
  onClosed,
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_TAG_COLORS[0]);
  // 新規作成時、ユーザーが手動で色を選ぶまでは名前から色を自動導出する (Web と同一の決定的割当)
  const [colorManuallySet, setColorManuallySet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isEditMode = tag !== null;

  // onClosed の呼び出し元は毎レンダー新しい関数を渡すことがあるため、ref 経由で参照し
  // 下の visible 監視 effect の依存配列には含めない (直前の visible の追跡だけで
  // 発火判定したいため)。
  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);
  const wasVisibleRef = useRef(visible);
  // handleDismiss は「onDismiss が届いた時点の最新 visible」で判定する必要がある。
  // ネイティブ側に渡ったハンドラが、閉じる直前 (visible=true) のレンダーで生成された
  // クロージャのまま呼ばれる可能性があるため、prop を直接読まず ref 経由で見る。
  const visibleRef = useRef(visible);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = visible;
    visibleRef.current = visible;

    // Android/Web: RN <Modal> は visible=false で即座に中身を描画しなくなる (SlideUpModal と
    // 異なり遅延アンマウントを持たない) ため、この時点を「閉じ終わった」とみなせる。
    // iOS はここでは処理しない (下の onDismiss が信号を担う。visible=false の時点では
    // ネイティブの閉じアニメーションがまだ再生中のため)。
    if (Platform.OS === "ios") return;
    if (!visible && wasVisible) {
      onClosedRef.current?.();
    }
  }, [visible]);

  const handleDismiss = () => {
    // iOS 専用: ネイティブモーダルの提示アニメーションが完全に終わった (閉じ切った) 通知。
    // Android では onDismiss 自体が発火しないため、Android の通知は上の useEffect が担う。
    //
    // `visible` が既に true に戻っている場合は、閉じアニメーション中に再オープンされた
    // ケースであり、ここへ届いた onDismiss は「reopen 前のクローズサイクル」の遅延信号。
    // ネイティブの dismiss は JS から途中キャンセルできないため必ず遅れて届く。これを
    // 無条件に通知すると、呼び出し元が「TagManageModal は閉じた」と誤認して
    // TagSelectModal を開き直し、提示中の TagManageModal と二重マウントになる
    // (SlideUpModal が awaitingDismissRef で防いでいるのと同じ競合)。TagManageModal は
    // `visible` をネイティブ <Modal> にそのまま渡しているため、`!visibleRef.current` が
    // 「クローズサイクルがまだ継続中か」の判定にそのまま使える。
    //
    // なお RN の onDismiss は発生源を識別する情報を持たない空のイベントのため、
    // close→reopen→close のように3回以上連続で操作された場合までは保護できない
    // (SlideUpModal の onClosed に記載した制約と同一)。
    if (Platform.OS === "ios" && !visibleRef.current) {
      onClosedRef.current?.();
    }
  };

  useEffect(() => {
    if (visible) {
      if (tag) {
        setName(tag.name);
        setColor(tag.color);
        setColorManuallySet(true);
      } else {
        setName("");
        setColor(getColorForName(""));
        setColorManuallySet(false);
      }
    }
  }, [visible, tag]);

  const handleNameChange = (text: string) => {
    setName(text);
    // 新規作成 & 手動選択前は名前ベースの色に追従させる
    if (!isEditMode && !colorManuallySet) {
      setColor(getColorForName(text.trim()));
    }
  };

  const handleColorSelect = (presetColor: string) => {
    setColor(presetColor);
    setColorManuallySet(true);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert(t("common.alertErrorTitle"), t("forms.tag.errorNameRequired"));
      return;
    }

    setIsSaving(true);
    try {
      await onSave(trimmedName, color);
      onClose();
    } catch (error) {
      console.error("タグ保存エラー:", error);
      Alert.alert(
        t("common.alertErrorTitle"),
        error instanceof Error ? error.message : t("forms.tag.errorSaveFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!tag || !onDelete) return;

    Alert.alert(
      t("forms.tag.deleteConfirmTitle"),
      t("forms.tag.deleteConfirmMessage", { name: tag.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("forms.tag.actionDelete"),
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              await onDelete(tag.id);
              onClose();
            } catch (error) {
              console.error("タグ削除エラー:", error);
              Alert.alert(
                t("common.alertErrorTitle"),
                error instanceof Error ? error.message : t("forms.tag.errorDeleteFailed"),
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  const isLoading = isSaving || isDeleting;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={handleDismiss}
    >
      <SafeAreaView style={styles.container}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {isEditMode ? t("forms.tag.editTagTitle") : t("forms.tag.newTagTitle")}
          </Text>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            disabled={isLoading}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Feather name="x" size={24} color="#374151" />
          </Pressable>
        </View>

        <View style={styles.content}>
          {/* タグ名入力 */}
          <View style={styles.field}>
            <Text style={styles.label}>{t("forms.tag.nameLabel")}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={handleNameChange}
              placeholder={t("forms.tag.namePlaceholderExample")}
              placeholderTextColor="#9CA3AF"
              maxLength={20}
              editable={!isLoading}
              autoFocus
            />
          </View>

          {/* カラー選択 */}
          <View style={styles.field}>
            <Text style={styles.label}>{t("forms.tag.colorLabel")}</Text>
            <View style={styles.colorGrid}>
              {PRESET_TAG_COLORS.map((presetColor) => (
                <Pressable
                  key={presetColor}
                  style={[
                    styles.colorOption,
                    { backgroundColor: presetColor },
                    color === presetColor && styles.colorOptionSelected,
                  ]}
                  onPress={() => handleColorSelect(presetColor)}
                  disabled={isLoading}
                >
                  {color === presetColor && <Feather name="check" size={18} color="#374151" />}
                </Pressable>
              ))}
            </View>
          </View>

          {/* プレビュー */}
          <View style={styles.field}>
            <Text style={styles.label}>{t("forms.tag.previewLabel")}</Text>
            <View style={styles.previewContainer}>
              <View style={[styles.previewTag, { backgroundColor: color }]}>
                <Text style={styles.previewTagText}>
                  {name.trim() || t("forms.tag.previewDefault")}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* フッター */}
        <View style={styles.footer}>
          {isEditMode && onDelete && (
            <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={isLoading}>
              {isDeleting ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <>
                  <Feather name="trash-2" size={18} color="#DC2626" />
                  <Text style={styles.deleteButtonText}>{t("forms.tag.actionDelete")}</Text>
                </>
              )}
            </Pressable>
          )}
          <View style={styles.footerRight}>
            <Pressable style={styles.cancelButton} onPress={onClose} disabled={isLoading}>
              <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.saveButton, (!name.trim() || isLoading) && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={!name.trim() || isLoading}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>{t("common.save")}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 24,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: "#374151",
  },
  previewContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  previewTag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  previewTagText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginLeft: "auto",
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  saveButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#93C5FD",
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

export default TagManageModal;
