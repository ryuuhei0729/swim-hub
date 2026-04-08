import React, { useState, useEffect } from "react";
import { View, Text, Modal, Pressable, TextInput, ScrollView, StyleSheet } from "react-native";
import type { TeamGroupWithCount } from "./hooks";

interface GroupFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (category: string | null, name: string) => Promise<boolean>;
  existingCategories: string[];
  editingGroup?: TeamGroupWithCount | null;
  saving: boolean;
  error: string | null;
}

export const GroupFormModal: React.FC<GroupFormModalProps> = ({
  visible,
  onClose,
  onSubmit,
  existingCategories,
  editingGroup,
  saving,
  error,
}) => {
  const [categoryMode, setCategoryMode] = useState<"existing" | "new">("existing");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (editingGroup) {
      setName(editingGroup.name);
      if (editingGroup.category && existingCategories.includes(editingGroup.category)) {
        setCategoryMode("existing");
        setSelectedCategory(editingGroup.category);
      } else if (editingGroup.category) {
        setCategoryMode("new");
        setNewCategory(editingGroup.category);
      } else {
        setCategoryMode("existing");
        setSelectedCategory("");
      }
    } else {
      setName("");
      setCategoryMode(existingCategories.length > 0 ? "existing" : "new");
      setSelectedCategory(existingCategories[0] || "");
      setNewCategory("");
    }
  }, [editingGroup, existingCategories, visible]);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSubmit = async () => {
    const category = categoryMode === "new" ? newCategory.trim() || null : selectedCategory || null;
    const success = await onSubmit(category, name.trim());
    if (success) {
      onClose();
    }
  };

  const isValid = name.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{editingGroup ? "グループを編集" : "グループを追加"}</Text>
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
            {/* カテゴリ */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>カテゴリ</Text>
              {existingCategories.length > 0 && (
                <View style={styles.modeToggle}>
                  <Pressable
                    style={[
                      styles.modeButton,
                      categoryMode === "existing" && styles.modeButtonActive,
                    ]}
                    onPress={() => setCategoryMode("existing")}
                  >
                    <Text
                      style={[
                        styles.modeButtonText,
                        categoryMode === "existing" && styles.modeButtonTextActive,
                      ]}
                    >
                      既存から選択
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modeButton, categoryMode === "new" && styles.modeButtonActive]}
                    onPress={() => setCategoryMode("new")}
                  >
                    <Text
                      style={[
                        styles.modeButtonText,
                        categoryMode === "new" && styles.modeButtonTextActive,
                      ]}
                    >
                      新規カテゴリ
                    </Text>
                  </Pressable>
                </View>
              )}

              {categoryMode === "existing" && existingCategories.length > 0 ? (
                <View style={styles.categoryPills}>
                  <Pressable
                    style={[
                      styles.categoryPill,
                      selectedCategory === "" && styles.categoryPillSelected,
                    ]}
                    onPress={() => setSelectedCategory("")}
                  >
                    <Text
                      style={[
                        styles.categoryPillText,
                        selectedCategory === "" && styles.categoryPillTextSelected,
                      ]}
                    >
                      カテゴリなし
                    </Text>
                  </Pressable>
                  {existingCategories.map((cat) => (
                    <Pressable
                      key={cat}
                      style={[
                        styles.categoryPill,
                        selectedCategory === cat && styles.categoryPillSelected,
                      ]}
                      onPress={() => setSelectedCategory(cat)}
                    >
                      <Text
                        style={[
                          styles.categoryPillText,
                          selectedCategory === cat && styles.categoryPillTextSelected,
                        ]}
                      >
                        {cat}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  value={newCategory}
                  onChangeText={setNewCategory}
                  placeholder="例: 学年、距離、S1"
                  placeholderTextColor="#9CA3AF"
                  editable={!saving}
                />
              )}
              <Text style={styles.hint}>同じ分類のグループをまとめるための名前です</Text>
            </View>

            {/* グループ名 */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                グループ名 <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={
                  editingGroup ? "例: スプリント" : "例: スプリント, ディスタンス, ミドル"
                }
                placeholderTextColor="#9CA3AF"
                editable={!saving}
              />
              {!editingGroup && (
                <Text style={styles.hint}>カンマ区切りで複数のグループを一度に作成できます</Text>
              )}
            </View>

            {/* エラー */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={saving}
            >
              <Text style={styles.cancelButtonText}>キャンセル</Text>
            </Pressable>
            <Pressable
              style={[
                styles.button,
                styles.submitButton,
                (!isValid || saving) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!isValid || saving}
            >
              <Text style={styles.submitButtonText}>
                {saving ? "保存中..." : editingGroup ? "更新" : "作成"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    width: "100%",
    maxWidth: 500,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#6B7280",
    lineHeight: 28,
  },
  body: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  required: {
    color: "#EF4444",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
  },
  modeToggle: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  modeButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  modeButtonActive: {
    backgroundColor: "#DBEAFE",
    borderColor: "#93C5FD",
  },
  modeButtonText: {
    fontSize: 12,
    color: "#4B5563",
  },
  modeButtonTextActive: {
    color: "#1D4ED8",
    fontWeight: "600",
  },
  categoryPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  categoryPillSelected: {
    backgroundColor: "#DBEAFE",
    borderColor: "#3B82F6",
  },
  categoryPillText: {
    fontSize: 14,
    color: "#4B5563",
  },
  categoryPillTextSelected: {
    color: "#1D4ED8",
    fontWeight: "600",
  },
  errorContainer: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#374151",
  },
  submitButton: {
    backgroundColor: "#2563EB",
  },
  submitButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#FFFFFF",
  },
});
