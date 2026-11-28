import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useAuth } from "@/contexts/AuthProvider";
import { formatTimeShort, parseTime } from "@apps/shared/utils/time";
import { UserFacingError, toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import {
  autoAssignMembers,
  buildScanMenuDrafts,
  isTimesheetScanResult,
  resolveScanTime,
  scanTimeKey,
  type ScanMatchMember,
  type ScanMenuDraft,
  type TimesheetScanResult,
} from "@apps/shared/utils/timesheetScan";

interface TimesheetScanModalProps {
  visible: boolean;
  onClose: () => void;
  /** 読み取った選手に割り当てる候補 (代理入力の対象にできるメンバー) */
  members: ReadonlyArray<ScanMatchMember>;
  /** 「フォームに反映」で、種目ごとのメニューを渡す */
  onApply: (drafts: ScanMenuDraft[]) => void;
}

type Step = "upload" | "analyzing" | "results";

/** scan-timesheet の上限 (base64 化前で 5MB) */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** 送る画像の長辺。記録表の数字が読める大きさに保ちつつ、通信量と上限に収める */
const MAX_IMAGE_EDGE = 2000;

/** Edge Function のエラーから HTTP ステータスを取り出す (FunctionsHttpError.context は Response) */
function functionErrorStatus(err: unknown): number | null {
  const context = (err as { context?: { status?: unknown } } | null)?.context;
  return typeof context?.status === "number" ? context.status : null;
}

/**
 * 写真からタイム記録表を読み取る (チーム練習ログの代理入力用)。
 * web components/team/OcrScanModal.tsx と同じく supabase/functions/scan-timesheet を呼び、
 * 選手ごとにメンバーを割り当て・タイムを直してからフォームに反映する。
 * 無料プランの回数 (1日1回) はサーバー側で数えるので、ここでは上限に達したときの表示だけを持つ。
 */
export const TimesheetScanModal: React.FC<TimesheetScanModalProps> = ({
  visible,
  onClose,
  members,
  onApply,
}) => {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const [step, setStep] = useState<Step>("upload");
  const [image, setImage] = useState<{ uri: string; base64: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<TimesheetScanResult | null>(null);
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [editedTimes, setEditedTimes] = useState<Record<string, number | null>>({});
  /** 入力途中のタイム (フォーカスが外れたら editedTimes に確定する) */
  const [cellDrafts, setCellDrafts] = useState<Record<string, string>>({});
  const [pickingMemberFor, setPickingMemberFor] = useState<number | null>(null);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    setStep("upload");
    setImage(null);
    setError(null);
    setScanResult(null);
    setAssignments({});
    setEditedTimes({});
    setCellDrafts({});
    setPickingMemberFor(null);
  }, []);

  // 閉じたら次に開いたとき最初から始める
  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
    },
    [],
  );

  const memberName = (userId: string): string =>
    members.find((m) => m.user_id === userId)?.users?.name || t("teams.mobile.unnamedMember");

  // ---- 画像を選ぶ ----
  const pickImage = async (source: "camera" | "library") => {
    try {
      // Android のライブラリ選択はシステムの Photo Picker (権限不要) を使うので権限を求めない
      // (components/shared/VideoUploader と同じ)
      const isAndroidLibrary = source === "library" && Platform.OS === "android";
      if (!isAndroidLibrary) {
        const { status } =
          source === "camera"
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            t("common.alertErrorTitle"),
            source === "camera"
              ? t("common.upload.cameraPermissionDenied")
              : t("common.upload.mediaPermissionDenied"),
          );
          return;
        }
      }

      const pick = source === "camera" ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
      const result = await pick({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
        base64: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;

      // HEIC などのまま送れないので、常に JPEG にして長辺を抑える
      const context = ImageManipulator.manipulate(asset.uri);
      if (Math.max(asset.width, asset.height) > MAX_IMAGE_EDGE) {
        context.resize(asset.width >= asset.height ? { width: MAX_IMAGE_EDGE } : { height: MAX_IMAGE_EDGE });
      }
      const rendered = await context.renderAsync();
      const jpeg = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
      if (!jpeg.base64) {
        setError(t("common.upload.imageDataFetchFailed"));
        return;
      }
      if (jpeg.base64.length * 0.75 > MAX_IMAGE_BYTES) {
        setError(t("teamsAdmin.ocr.upload.fileSizeError"));
        return;
      }
      setError(null);
      setImage({ uri: jpeg.uri, base64: jpeg.base64 });
    } catch (err) {
      console.error("記録表の画像選択エラー:", err);
      setError(toUserFacingMessage(err, t("common.upload.imageSelectFailed")));
    }
  };

  // ---- 解析 ----
  const analyze = async () => {
    if (!image) return;
    cancelledRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;
    setStep("analyzing");
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("scan-timesheet", {
        body: { image: image.base64, mimeType: "image/jpeg" },
        signal: controller.signal,
      });
      if (cancelledRef.current) return;
      if (fnError) {
        if (functionErrorStatus(fnError) === 429) {
          throw new UserFacingError(t("teamsAdmin.ocr.errors.dailyLimitReached"));
        }
        throw fnError;
      }
      if (!isTimesheetScanResult(data)) {
        console.error("記録表の解析結果の形式が不正:", data);
        throw new UserFacingError(t("teamsAdmin.ocr.errors.invalidFormat"));
      }
      setScanResult(data);
      setAssignments(autoAssignMembers(data.swimmers, members));
      setEditedTimes({});
      setCellDrafts({});
      setStep("results");
    } catch (err) {
      if (cancelledRef.current) return;
      console.error("記録表の解析エラー:", err);
      setError(toUserFacingMessage(err, t("teamsAdmin.ocr.errors.analyzeError")));
      setStep("upload");
    }
  };

  const cancelAnalyze = () => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    setStep("upload");
  };

  // ---- 結果の確認 ----
  const assignMember = (swimmerNo: number, userId: string | null) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (userId) next[swimmerNo] = userId;
      else delete next[swimmerNo];
      return next;
    });
    setPickingMemberFor(null);
  };

  const commitCell = (key: string) => {
    const text = cellDrafts[key];
    if (text === undefined) return;
    const trimmed = text.trim();
    if (trimmed === "") {
      setEditedTimes((prev) => ({ ...prev, [key]: null }));
    } else {
      const parsed = parseTime(trimmed);
      // 読めない入力は捨てて元の値に戻す (web OcrScanModal と同じ)
      if (parsed > 0) setEditedTimes((prev) => ({ ...prev, [key]: parsed }));
    }
    setCellDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const apply = () => {
    if (!scanResult) return;
    const doApply = () => {
      onApply(buildScanMenuDrafts(scanResult, assignments, editedTimes));
      onClose();
    };
    const unassigned = scanResult.swimmers.filter((s) => !assignments[s.no]).length;
    if (unassigned === 0) {
      doApply();
      return;
    }
    Alert.alert(
      t("teamsAdmin.ocr.discardConfirm.title"),
      t("teamsAdmin.ocr.discardConfirm.message", { count: unassigned }),
      [
        { text: t("teamsAdmin.ocr.discardConfirm.cancelButton"), style: "cancel" },
        { text: t("teamsAdmin.ocr.discardConfirm.confirmButton"), style: "destructive", onPress: doApply },
      ],
    );
  };

  const assignedUserIds = new Set(Object.values(assignments));

  const renderUpload = () => (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.hint}>{t("teamsAdmin.ocr.upload.mobileHint")}</Text>
      <View style={styles.sourceRow}>
        <Pressable
          style={styles.sourceButton}
          onPress={() => pickImage("camera")}
          accessibilityRole="button"
        >
          <Feather name="camera" size={20} color="#4F46E5" />
          <Text style={styles.sourceButtonText}>{t("common.upload.cameraOption")}</Text>
        </Pressable>
        <Pressable
          style={styles.sourceButton}
          onPress={() => pickImage("library")}
          accessibilityRole="button"
        >
          <Feather name="image" size={20} color="#4F46E5" />
          <Text style={styles.sourceButtonText}>{t("common.upload.libraryOption")}</Text>
        </Pressable>
      </View>
      {image && <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="contain" />}
      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );

  const renderAnalyzing = () => (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#4F46E5" />
      <Text style={styles.analyzingText}>{t("teamsAdmin.ocr.analyzing.message")}</Text>
    </View>
  );

  const renderResults = () => {
    if (!scanResult) return null;
    const { menu, swimmers } = scanResult;
    const totalTimes = menu.repCount * menu.setCount;
    return (
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.menuInfo}>
          <Text style={styles.menuInfoTitle}>{t("teamsAdmin.ocr.results.sectionTitle")}</Text>
          <Text style={styles.menuInfoText}>
            {[
              `${t("teamsAdmin.ocr.results.distanceLabel")} ${menu.distance}m`,
              `${t("teamsAdmin.ocr.results.repsLabel")} ${menu.repCount} × ${menu.setCount}`,
              menu.circle
                ? `${t("teamsAdmin.ocr.results.circleLabel")} ${Math.floor(menu.circle / 60)}:${String(menu.circle % 60).padStart(2, "0")}`
                : "",
            ]
              .filter(Boolean)
              .join("   ")}
          </Text>
          {!!menu.description && <Text style={styles.menuInfoSub}>{menu.description}</Text>}
        </View>

        {swimmers.map((swimmer) => {
          const assigned = assignments[swimmer.no];
          const picking = pickingMemberFor === swimmer.no;
          return (
            <View key={swimmer.no} style={styles.swimmerCard} testID={`timesheet-scan-swimmer-${swimmer.no}`}>
              <View style={styles.swimmerHeader}>
                <Text style={styles.swimmerNo}>
                  {t("teamsAdmin.ocr.results.col.no")} {swimmer.no}
                </Text>
                <Text style={styles.swimmerStyle}>{swimmer.style}</Text>
                {!!swimmer.name && <Text style={styles.swimmerName} numberOfLines={1}>{swimmer.name}</Text>}
              </View>

              <Pressable
                style={[styles.memberButton, !assigned && styles.memberButtonUnassigned]}
                onPress={() => setPickingMemberFor(picking ? null : swimmer.no)}
                accessibilityRole="button"
                accessibilityLabel={`${t("teamsAdmin.ocr.results.col.member")} ${swimmer.no}`}
                testID={`timesheet-scan-member-${swimmer.no}`}
              >
                <Text style={[styles.memberButtonText, !assigned && styles.memberButtonTextUnassigned]}>
                  {assigned ? memberName(assigned) : t("teamsAdmin.ocr.results.unselectedOption")}
                </Text>
                <Feather name={picking ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
              </Pressable>
              {picking && (
                <View style={styles.memberList}>
                  <Pressable
                    style={styles.memberChip}
                    onPress={() => assignMember(swimmer.no, null)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.memberChipText}>{t("teamsAdmin.ocr.results.unselectedOption")}</Text>
                  </Pressable>
                  {members.map((m) => {
                    const takenByOther = assignedUserIds.has(m.user_id) && assigned !== m.user_id;
                    const selected = assigned === m.user_id;
                    return (
                      <Pressable
                        key={m.user_id}
                        style={[styles.memberChip, selected && styles.memberChipSelected, takenByOther && styles.memberChipDisabled]}
                        onPress={() => assignMember(swimmer.no, m.user_id)}
                        disabled={takenByOther}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: takenByOther }}
                      >
                        <Text style={[styles.memberChipText, selected && styles.memberChipTextSelected]}>
                          {memberName(m.user_id)}
                          {takenByOther ? t("teamsAdmin.ocr.results.alreadySelectedSuffix") : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={styles.timesGrid}>
                {Array.from({ length: totalTimes }, (_, i) => {
                  const key = scanTimeKey(swimmer.no, i);
                  const value = resolveScanTime(scanResult, editedTimes, swimmer.no, i);
                  const text = cellDrafts[key] ?? (value !== null ? formatTimeShort(value) : "");
                  return (
                    <View key={key} style={styles.timeCell}>
                      <Text style={styles.timeCellLabel}>{i + 1}</Text>
                      <TextInput
                        style={[styles.timeInput, value === null && cellDrafts[key] === undefined && styles.timeInputEmpty]}
                        value={text}
                        onChangeText={(v) => setCellDrafts((prev) => ({ ...prev, [key]: v }))}
                        onBlur={() => commitCell(key)}
                        onSubmitEditing={() => commitCell(key)}
                        placeholder="--"
                        placeholderTextColor="#B45309"
                        keyboardType="numbers-and-punctuation"
                        returnKeyType="done"
                        accessibilityLabel={t("teamsAdmin.ocr.results.editTimeAria", { no: swimmer.no, n: i + 1 })}
                        testID={`timesheet-scan-time-${swimmer.no}-${i}`}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        {swimmers.some((s) => !assignments[s.no]) && (
          <Text style={styles.warning}>{t("teamsAdmin.ocr.results.unassignedWarning")}</Text>
        )}
      </ScrollView>
    );
  };

  const titles: Record<Step, string> = {
    upload: t("teamsAdmin.ocr.stepTitle.upload"),
    analyzing: t("teamsAdmin.ocr.stepTitle.analyzing"),
    results: t("teamsAdmin.ocr.stepTitle.results"),
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={step === "analyzing" ? cancelAnalyze : onClose}>
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>{titles[step]}</Text>
          <Pressable
            onPress={step === "analyzing" ? cancelAnalyze : onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          >
            <Feather name="x" size={22} color="#6B7280" />
          </Pressable>
        </View>

        <View style={styles.flex}>
          {step === "upload" && renderUpload()}
          {step === "analyzing" && renderAnalyzing()}
          {step === "results" && renderResults()}
        </View>

        <View style={styles.footer}>
          {step === "upload" && (
            <>
              <Pressable style={styles.secondaryButton} onPress={onClose} accessibilityRole="button">
                <Text style={styles.secondaryButtonText}>{t("teamsAdmin.ocr.upload.cancelButton")}</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, !image && styles.buttonDisabled]}
                onPress={analyze}
                disabled={!image}
                accessibilityRole="button"
                accessibilityState={{ disabled: !image }}
                testID="timesheet-scan-analyze"
              >
                <Text style={styles.primaryButtonText}>{t("teamsAdmin.ocr.upload.analyzeButton")}</Text>
              </Pressable>
            </>
          )}
          {step === "analyzing" && (
            <Pressable style={styles.secondaryButton} onPress={cancelAnalyze} accessibilityRole="button">
              <Text style={styles.secondaryButtonText}>{t("teamsAdmin.ocr.analyzing.cancelButton")}</Text>
            </Pressable>
          )}
          {step === "results" && (
            <>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  setStep("upload");
                  setScanResult(null);
                  setAssignments({});
                  setEditedTimes({});
                  setCellDrafts({});
                }}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>{t("teamsAdmin.ocr.results.retryButton")}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.primaryButton,
                  !scanResult?.swimmers.some((s) => assignments[s.no]) && styles.buttonDisabled,
                ]}
                onPress={apply}
                disabled={!scanResult?.swimmers.some((s) => assignments[s.no])}
                accessibilityRole="button"
                testID="timesheet-scan-apply"
              >
                <Text style={styles.primaryButtonText}>{t("teamsAdmin.ocr.results.applyButton")}</Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  title: { flex: 1, fontSize: 17, fontWeight: "700", color: "#111827", marginRight: 12 },
  body: { padding: 16, gap: 12 },
  hint: { fontSize: 14, color: "#4B5563" },
  sourceRow: { flexDirection: "row", gap: 10 },
  sourceButton: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#A5B4FC",
    backgroundColor: "#EEF2FF",
  },
  sourceButtonText: { fontSize: 14, fontWeight: "700", color: "#4338CA" },
  preview: { width: "100%", height: 280, borderRadius: 10, backgroundColor: "#E5E7EB" },
  error: {
    fontSize: 13,
    color: "#B91C1C",
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    padding: 10,
    overflow: "hidden",
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  analyzingText: { fontSize: 14, color: "#4B5563" },
  menuInfo: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 10,
    padding: 12,
  },
  menuInfoTitle: { fontSize: 13, fontWeight: "700", color: "#1E3A8A", marginBottom: 4 },
  menuInfoText: { fontSize: 13, color: "#1E40AF" },
  menuInfoSub: { fontSize: 12, color: "#2563EB", marginTop: 4 },
  swimmerCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  swimmerHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  swimmerNo: { fontSize: 13, fontWeight: "700", color: "#374151" },
  swimmerStyle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4338CA",
    backgroundColor: "#EEF2FF",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: "hidden",
  },
  swimmerName: { flex: 1, fontSize: 12, color: "#6B7280" },
  memberButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  memberButtonUnassigned: { borderColor: "#FACC15", backgroundColor: "#FEFCE8" },
  memberButtonText: { fontSize: 14, color: "#111827", fontWeight: "600" },
  memberButtonTextUnassigned: { color: "#A16207" },
  memberList: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  memberChip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#FFFFFF",
  },
  memberChipSelected: { borderColor: "#2563EB", backgroundColor: "#DBEAFE" },
  memberChipDisabled: { opacity: 0.4 },
  memberChipText: { fontSize: 13, color: "#374151" },
  memberChipTextSelected: { color: "#1E40AF", fontWeight: "700" },
  timesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  timeCell: { width: 64, alignItems: "center" },
  timeCellLabel: { fontSize: 10, color: "#9CA3AF", marginBottom: 2 },
  timeInput: {
    width: 64,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    paddingVertical: 5,
    textAlign: "center",
    fontSize: 13,
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  timeInputEmpty: { backgroundColor: "#FEF3C7", borderColor: "#FCD34D" },
  warning: { fontSize: 13, color: "#A16207" },
  footer: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  primaryButton: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4F46E5",
  },
  primaryButtonText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  secondaryButton: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: { fontSize: 15, fontWeight: "700", color: "#374151" },
  buttonDisabled: { opacity: 0.5 },
});
