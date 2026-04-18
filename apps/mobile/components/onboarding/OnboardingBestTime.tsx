import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  Modal,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthProvider";
import { RecordAPI } from "@apps/shared/api/records";
import { parseTime } from "@apps/shared/utils/time";

// =============================================================================
// 型定義
// =============================================================================

interface BestTimeEntry {
  key: string;
  styleId: number;
  poolType: 0 | 1; // 0: 短水路, 1: 長水路
  time: string;
}

export interface OnboardingBestTimeProps {
  onComplete: () => Promise<void>;
  onBack: () => void;
}

interface StyleOption {
  id: number;
  nameJp: string;
}

// =============================================================================
// 種目マスター (Web版 Step3BestTime.tsx から複製)
// =============================================================================

const STYLES: StyleOption[] = [
  { id: 1, nameJp: "25m 自由形" },
  { id: 2, nameJp: "50m 自由形" },
  { id: 3, nameJp: "100m 自由形" },
  { id: 4, nameJp: "200m 自由形" },
  { id: 5, nameJp: "400m 自由形" },
  { id: 6, nameJp: "800m 自由形" },
  { id: 7, nameJp: "1500m 自由形" },
  { id: 8, nameJp: "25m 平泳ぎ" },
  { id: 9, nameJp: "50m 平泳ぎ" },
  { id: 10, nameJp: "100m 平泳ぎ" },
  { id: 11, nameJp: "200m 平泳ぎ" },
  { id: 12, nameJp: "25m 背泳ぎ" },
  { id: 13, nameJp: "50m 背泳ぎ" },
  { id: 14, nameJp: "100m 背泳ぎ" },
  { id: 15, nameJp: "200m 背泳ぎ" },
  { id: 16, nameJp: "25m バタフライ" },
  { id: 17, nameJp: "50m バタフライ" },
  { id: 18, nameJp: "100m バタフライ" },
  { id: 19, nameJp: "200m バタフライ" },
  { id: 20, nameJp: "100m 個人メドレー" },
  { id: 21, nameJp: "200m 個人メドレー" },
  { id: 22, nameJp: "400m 個人メドレー" },
];

function genKey(): string {
  return `bt-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

// =============================================================================
// ロジック関数
// =============================================================================

function hasDuplicates(entries: BestTimeEntry[]): boolean {
  const seen = new Set<string>();
  for (const e of entries) {
    // NOTE: is_relaying は固定値 (false) のため重複判定から除外
    const composite = `${e.styleId}-${e.poolType}`;
    if (seen.has(composite)) return true;
    seen.add(composite);
  }
  return false;
}

function getDuplicateKeys(entries: BestTimeEntry[]): Set<string> {
  const keys = new Set<string>();
  const seen = new Map<string, string>();
  for (const e of entries) {
    const composite = `${e.styleId}-${e.poolType}`;
    const existing = seen.get(composite);
    if (existing) {
      keys.add(existing);
      keys.add(e.key);
    } else {
      seen.set(composite, e.key);
    }
  }
  return keys;
}

function canSave(entries: BestTimeEntry[]): boolean {
  if (entries.length === 0) return false;
  if (hasDuplicates(entries)) return false;
  return entries.every((e) => parseTime(e.time) > 0);
}

// =============================================================================
// メインコンポーネント
// =============================================================================

export const OnboardingBestTime: React.FC<OnboardingBestTimeProps> = ({ onComplete, onBack }) => {
  const { supabase } = useAuth();
  const [entries, setEntries] = useState<BestTimeEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showStyleModal, setShowStyleModal] = useState(false);
  const savingRef = useRef(false);

  const recordAPI = useMemo(() => {
    if (!supabase) return null;
    return new RecordAPI(supabase);
  }, [supabase]);

  const duplicateKeys = useMemo(() => getDuplicateKeys(entries), [entries]);
  const isDuplicate = duplicateKeys.size > 0;
  const hasEntries = entries.length > 0;
  const isSaveable = canSave(entries);

  const addEntry = useCallback((styleId: number) => {
    setEntries((prev) => [
      ...prev,
      {
        key: genKey(),
        styleId,
        poolType: 1,
        time: "",
      },
    ]);
    setShowStyleModal(false);
  }, []);

  const removeEntry = useCallback((key: string) => {
    setEntries((prev) => prev.filter((e) => e.key !== key));
  }, []);

  const updateEntry = useCallback((key: string, patch: Partial<BestTimeEntry>) => {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }, []);

  const handleSave = useCallback(async () => {
    if (!recordAPI || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const records = entries.map((e) => ({
        style_id: e.styleId,
        time: parseTime(e.time),
        is_relaying: false,
        note: null,
        pool_type: e.poolType,
      }));

      const result = await recordAPI.createBulkRecords(records);
      if (result.errors.length > 0) {
        setSaveError(`一部の登録に失敗しました: ${result.errors.join(", ")}`);
        return;
      }

      await onComplete();
    } catch {
      setSaveError("登録に失敗しました。もう一度お試しください。");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [entries, recordAPI, onComplete]);

  const handleSkip = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await onComplete();
    } catch {
      setSaveError("処理に失敗しました。もう一度お試しください。");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [onComplete]);

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.headerIconRow}>
          <Feather name="trending-up" size={24} color="#2563EB" />
        </View>
        <Text style={styles.title}>ベストタイムを入力</Text>
        <Text style={styles.subtitle}>
          記録しておくと成長の推移が一目でわかります。後からでも追加・編集できます。
        </Text>
      </View>

      {/* エラー表示 */}
      {saveError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{saveError}</Text>
        </View>
      )}

      {/* 重複警告 */}
      {isDuplicate && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>重複する種目があります</Text>
        </View>
      )}

      {/* エントリー一覧 */}
      <ScrollView
        style={styles.entryList}
        contentContainerStyle={styles.entryListContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {entries.map((entry) => {
          const styleName = STYLES.find((s) => s.id === entry.styleId)?.nameJp ?? "";
          return (
            <EntryRow
              key={entry.key}
              entry={entry}
              styleName={styleName}
              onUpdate={updateEntry}
              onRemove={removeEntry}
              disabled={saving}
              isDuplicate={duplicateKeys.has(entry.key)}
            />
          );
        })}

        {/* 種目追加ボタン */}
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed, saving && styles.addButtonDisabled]}
          onPress={() => setShowStyleModal(true)}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="種目を追加"
        >
          <Feather name="plus" size={16} color={saving ? "#9CA3AF" : "#2563EB"} />
          <Text style={[styles.addButtonText, saving && styles.addButtonTextDisabled]}>
            種目を追加
          </Text>
        </Pressable>
      </ScrollView>

      {/* ボタン */}
      <View style={styles.buttonSection}>
        <View style={styles.bottomRow}>
          <Pressable
            style={[styles.backButton, saving && styles.backButtonDisabled]}
            onPress={onBack}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="戻る"
          >
            <Text style={[styles.backButtonText, saving && styles.backButtonTextDisabled]}>
              戻る
            </Text>
          </Pressable>

          {hasEntries ? (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                (!isSaveable || saving) && styles.primaryButtonDisabled,
                pressed && isSaveable && !saving && styles.primaryButtonPressed,
              ]}
              onPress={handleSave}
              disabled={!isSaveable || saving}
              accessibilityRole="button"
              accessibilityLabel="保存して始める"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>保存して始める</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                saving && styles.primaryButtonDisabled,
                pressed && !saving && styles.primaryButtonPressed,
              ]}
              onPress={handleSkip}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="スキップして始める"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryButtonText}>スキップして始める</Text>
              )}
            </Pressable>
          )}
        </View>
      </View>

      {/* 種目選択モーダル */}
      <Modal
        visible={showStyleModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStyleModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowStyleModal(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>種目を選択</Text>
              <Pressable
                onPress={() => setShowStyleModal(false)}
                accessibilityRole="button"
                accessibilityLabel="閉じる"
              >
                <Feather name="x" size={20} color="#374151" />
              </Pressable>
            </View>
            <FlatList
              data={STYLES}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.modalItem, pressed && styles.modalItemPressed]}
                  onPress={() => addEntry(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={item.nameJp}
                >
                  <Text style={styles.modalItemText}>{item.nameJp}</Text>
                </Pressable>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

// =============================================================================
// エントリー行コンポーネント
// =============================================================================

interface EntryRowProps {
  entry: BestTimeEntry;
  styleName: string;
  onUpdate: (key: string, patch: Partial<BestTimeEntry>) => void;
  onRemove: (key: string) => void;
  disabled: boolean;
  isDuplicate: boolean;
}

const EntryRow: React.FC<EntryRowProps> = ({
  entry,
  styleName,
  onUpdate,
  onRemove,
  disabled,
  isDuplicate,
}) => {
  return (
    <View style={[entryStyles.card, isDuplicate && entryStyles.cardDuplicate]}>
      {/* ヘッダー: 種目名 + 削除 */}
      <View style={entryStyles.cardHeader}>
        <Text style={entryStyles.styleName}>{styleName}</Text>
        <Pressable
          onPress={() => onRemove(entry.key)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${styleName}を削除`}
          style={({ pressed }) => [entryStyles.removeButton, pressed && entryStyles.removeButtonPressed]}
        >
          <Feather name="x" size={16} color={disabled ? "#D1D5DB" : "#9CA3AF"} />
        </Pressable>
      </View>

      {/* 水路種別トグル + タイム入力 */}
      <View style={entryStyles.inputRow}>
        {/* 短水路/長水路 トグル */}
        <View style={entryStyles.poolToggle}>
          <Pressable
            style={[entryStyles.poolButton, entry.poolType === 0 && entryStyles.poolButtonActive]}
            onPress={() => onUpdate(entry.key, { poolType: 0 })}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="短水路"
          >
            <Text
              style={[
                entryStyles.poolButtonText,
                entry.poolType === 0 && entryStyles.poolButtonTextActive,
              ]}
            >
              短水路
            </Text>
          </Pressable>
          <Pressable
            style={[entryStyles.poolButton, entry.poolType === 1 && entryStyles.poolButtonActive]}
            onPress={() => onUpdate(entry.key, { poolType: 1 })}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="長水路"
          >
            <Text
              style={[
                entryStyles.poolButtonText,
                entry.poolType === 1 && entryStyles.poolButtonTextActive,
              ]}
            >
              長水路
            </Text>
          </Pressable>
        </View>

        {/* タイム入力 */}
        <TextInput
          style={[entryStyles.timeInput, disabled && entryStyles.timeInputDisabled]}
          value={entry.time}
          onChangeText={(text) => onUpdate(entry.key, { time: text })}
          placeholder="例: 1:23.45"
          placeholderTextColor="#9CA3AF"
          keyboardType="numbers-and-punctuation"
          editable={!disabled}
          accessibilityLabel={`${styleName}のタイム`}
        />
      </View>
    </View>
  );
};

// =============================================================================
// スタイル
// =============================================================================

const entryStyles = StyleSheet.create({
  card: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 10,
  },
  cardDuplicate: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  styleName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  removeButton: {
    padding: 4,
  },
  removeButtonPressed: {
    opacity: 0.6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  poolToggle: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    overflow: "hidden",
  },
  poolButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  poolButtonActive: {
    backgroundColor: "#2563EB",
  },
  poolButtonText: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
  poolButtonTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  timeInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    fontVariant: ["tabular-nums"],
  },
  timeInputDisabled: {
    backgroundColor: "#F3F4F6",
    color: "#9CA3AF",
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
  },
  header: {
    gap: 6,
    alignItems: "flex-start",
  },
  headerIconRow: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  errorBanner: {
    padding: 12,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    fontSize: 13,
    color: "#DC2626",
  },
  warningBanner: {
    padding: 12,
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  warningText: {
    fontSize: 13,
    color: "#92400E",
  },
  entryList: {
    flex: 1,
  },
  entryListContent: {
    gap: 10,
    paddingBottom: 4,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 10,
    borderStyle: "dashed",
    backgroundColor: "#F0F9FF",
  },
  addButtonPressed: {
    backgroundColor: "#DBEAFE",
  },
  addButtonDisabled: {
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  addButtonText: {
    fontSize: 14,
    color: "#2563EB",
    fontWeight: "500",
  },
  addButtonTextDisabled: {
    color: "#9CA3AF",
  },
  buttonSection: {
    gap: 0,
    marginTop: "auto",
  },
  bottomRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  backButtonDisabled: {
    backgroundColor: "#F9FAFB",
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#374151",
  },
  backButtonTextDisabled: {
    color: "#9CA3AF",
  },
  primaryButton: {
    flex: 1,
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonPressed: {
    backgroundColor: "#1D4ED8",
  },
  primaryButtonDisabled: {
    backgroundColor: "#93C5FD",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  // モーダル
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  modalItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalItemPressed: {
    backgroundColor: "#F0F9FF",
  },
  modalItemText: {
    fontSize: 15,
    color: "#111827",
  },
});
