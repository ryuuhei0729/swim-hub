import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  InputAccessoryView,
  Keyboard,
  Platform,
} from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { FormKeyboardAvoidingView } from "@/components/forms/FormKeyboardAvoidingView";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { usePracticeTimeStore } from "@/stores/practiceTimeStore";
import { useAuth } from "@/contexts/AuthProvider";
import { PremiumBadge } from "@/components/shared/PremiumBadge";
import { WaPointsInfoTooltip } from "@/components/ui/WaPointsInfoTooltip";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { FREE_PLAN_LIMITS } from "@swim-hub/shared/constants/premium";
import type { MainStackParamList } from "@/navigation/types";
import type { TimeEntry } from "@apps/shared/types/ui";
import { formatTime } from "@/utils/formatters";
import { useQuickTimeInput } from "@/hooks/useQuickTimeInput";

type PracticeTimeFormScreenRouteProp = RouteProp<MainStackParamList, "PracticeTimeForm">;
type PracticeTimeFormScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;

// タイムエントリー（表示用にidとdisplayValueを追加）
interface TimeEntryWithDisplay extends TimeEntry {
  id: string;
  displayValue?: string;
  /**
   * 2本目以降のクイック入力で使う「引き継ぎシード」("3" = 十の位のみ、"1.2" = 分.十の位)。
   * undefined の間は「未着手 (または既存値を編集前)」を表し、表示値は displayValue をそのまま使う。
   * 一度でもフォーカス/キー入力でクイック入力モードに入ると文字列 (空文字含む) になる。
   */
  quickSeed?: string;
  /** シードに続けてユーザーが打った生の数字 (最大2桁: 一の位・小数第1位。シードが空なら最大3桁) */
  quickTyped?: string;
}

const QUICK_INPUT_ACCESSORY_ID = "practice-time-quick-input-next";

/** シード文字列を「分」部分と「十の位」部分に分解する ("1.2"→{minutePart:"1",tensDigitPart:"2"}, "3"→{minutePart:"",tensDigitPart:"3"}) */
function splitQuickSeed(seed: string): { minutePart: string; tensDigitPart: string } {
  const dotIndex = seed.lastIndexOf(".");
  if (dotIndex === -1) return { minutePart: "", tensDigitPart: seed };
  return { minutePart: seed.slice(0, dotIndex), tensDigitPart: seed.slice(dotIndex + 1) };
}

/**
 * シード + 追加入力 → 表示文字列。
 * 「シードの十の位を含めて2桁目」の直後に "." を自動挿入する (十の位+一の位 の次が小数第1位)。
 */
function formatQuickBuffer(seed: string, typed: string): string {
  const { tensDigitPart } = splitQuickSeed(seed);
  const seedDigitCount = tensDigitPart ? 1 : 0;
  let result = seed;
  for (let i = 0; i < typed.length; i++) {
    result += typed[i];
    // この文字を追加した直後の合計桁数が2 (十の位+一の位) になったら "." を続ける
    const totalDigitsSoFar = seedDigitCount + i + 1;
    if (totalDigitsSoFar === 2) {
      result += ".";
    }
  }
  return result;
}

/** シード + 追加入力 → 秒数 (一の位まで揃っていない場合は0=未確定) */
function quickBufferToSeconds(seed: string, typed: string): number {
  const { minutePart, tensDigitPart } = splitQuickSeed(seed);
  const secondsDigits = tensDigitPart + typed; // 十の位・一の位・小数第1位を最大3桁でつなげる
  if (secondsDigits.length < 2) return 0;
  const tens = Number(secondsDigits[0]);
  const ones = Number(secondsDigits[1]);
  const tenths = secondsDigits.length >= 3 ? Number(secondsDigits[2]) : 0;
  const minutes = minutePart ? Number(minutePart) : 0;
  return minutes * 60 + tens * 10 + ones + tenths / 10;
}

/** シード時点で埋まっている「十の位までの桁数」(0 or 1)。追加入力の残り枠数の計算に使う */
function quickSeedDigitCount(seed: string): number {
  return splitQuickSeed(seed).tensDigitPart ? 1 : 0;
}

/** 確定済みタイム (秒) → 次のセルへ引き継ぐシード ("3" または、分がある場合は "1.2") */
function seedFromSeconds(seconds: number): string {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const secsRemainder = whole % 60;
  const tensDigit = Math.floor(secsRemainder / 10) % 10;
  return minutes > 0 ? `${minutes}.${tensDigit}` : `${tensDigit}`;
}

/**
 * タイム入力画面
 * セット数×本数のタイムを入力
 */
export const PracticeTimeFormScreen: React.FC = () => {
  const route = useRoute<PracticeTimeFormScreenRouteProp>();
  const navigation = useNavigation<PracticeTimeFormScreenNavigationProp>();
  const { setCount, repCount, initialTimes = [] } = route.params;
  const saveTimes = usePracticeTimeStore((state) => state.setTimes);
  const currentMenuId = usePracticeTimeStore((state) => state.currentMenuId);

  // Premium 判定
  const { subscription } = useAuth();
  const isPremium = checkIsPremium(subscription);
  const totalTimes = setCount * repCount;
  const practiceTimeLimitExceeded = !isPremium && totalTimes > FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG;
  const { t } = useTranslation();
  // Android の Edge-to-Edge 強制下ではシステムナビゲーションバー(3ボタン)の領域まで
  // 描画されるため、ScrollView 最下部の保存ボタンがナビゲーションバーの背後に隠れる。
  // contentContainerStyle に下部インセットを加算して回避する (パターンB:
  // KeyboardAvoidingView の外側を SafeAreaView で包むとキーボード表示時に
  // インセットぶんの隙間が空くため、スクロール余白として足す方式を採る)。
  const insets = useSafeInsets();

  // クイック入力フック
  const { parseInput, resetContext } = useQuickTimeInput();

  // タイムエントリー
  const [times, setTimes] = useState<TimeEntryWithDisplay[]>([]);

  // 現在フォーカス中のセルID（保存時に blur を待たずに確定値へ反映するため）
  const focusedIdRef = useRef<string | null>(null);

  // 入力フィールドの参照（フォーカス遷移用）
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // 初期化
  useEffect(() => {
    // クイック入力コンテキストをリセット
    resetContext();

    // refs配列を初期化
    inputRefs.current = new Array(setCount * repCount).fill(null);

    // 全てのセット・レップの組み合わせを生成
    const allCombinations: TimeEntryWithDisplay[] = [];
    for (let set = 1; set <= setCount; set++) {
      for (let rep = 1; rep <= repCount; rep++) {
        const existingTime = initialTimes.find((t) => t.setNumber === set && t.repNumber === rep);

        allCombinations.push({
          id: existingTime?.id || `${set}-${rep}-${Date.now()}-${Math.random()}`,
          setNumber: set,
          repNumber: rep,
          time: existingTime?.time || 0,
          displayValue: existingTime && existingTime.time > 0 ? formatTime(existingTime.time) : "",
        });
      }
    }
    setTimes(allCombinations);
  }, [setCount, repCount, initialTimes, resetContext]);

  // タイム入力の変更（入力中は表示値のみ更新）
  const handleTimeChange = (id: string, value: string) => {
    // "." が連続すると (例: "31." の後にもう一度 "." ) 無意味な "31.." になるため無視する
    if (value.includes("..")) return;
    setTimes((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              displayValue: value,
            }
          : t,
      ),
    );
    // フィールドを空にしたらコンテキストをリセットする。
    // これをしないと、前回入力（例: 1:12.2）の「分」がクイック入力コンテキストに残り、
    // 削除後に「33-3」を入力すると「1:33.3」に化けてしまう。
    if (!value.trim()) {
      resetContext();
    }
  };

  // タイム入力の確定（フォーカスアウト時 or Enter時）
  const handleTimeConfirm = (id: string, value: string) => {
    if (!value.trim()) {
      // 空のまま blur / Enter したケースのフォールバック。
      // 通常は handleTimeChange 側の resetContext で解除済みだが、こちらでも
      // 分引き継ぎコンテキストを確実に解除する（setContextState は冪等）。
      resetContext();
      setTimes((prev) => prev.map((t) => (t.id === id ? { ...t, displayValue: "", time: 0 } : t)));
      return;
    }
    const { time, displayValue } = parseInput(value);
    setTimes((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              time,
              displayValue,
            }
          : t,
      ),
    );
  };

  // 次の入力フィールドへフォーカス
  const focusNextInput = (currentIndex: number) => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < inputRefs.current.length) {
      inputRefs.current[nextIndex]?.focus();
    } else {
      Keyboard.dismiss();
    }
  };

  // 2本目以降のクイック入力: フォーカス時に直前の本の十の位 (分がある場合は分.十の位) を
  // シードとして先頭に入れておく。既に触った後・既存値がある場合は上書きしない
  const handleQuickFocus = (id: string, globalIndex: number) => {
    focusedIdRef.current = id;
    setTimes((prev) => {
      const current = prev[globalIndex];
      if (!current) return prev;
      const alreadyTouched = current.quickSeed !== undefined;
      const hasExistingValue = (current.displayValue ?? "").trim() !== "";
      if (alreadyTouched || hasExistingValue) return prev;
      const prevEntry = prev[globalIndex - 1];
      if (!prevEntry || prevEntry.time <= 0) {
        // 引き継ぎ元が無い場合はシード無しでクイック入力モードに入る
        return prev.map((t, i) => (i === globalIndex ? { ...t, quickSeed: "", quickTyped: "" } : t));
      }
      const seed = seedFromSeconds(prevEntry.time);
      return prev.map((t, i) =>
        i === globalIndex
          ? {
              ...t,
              quickSeed: seed,
              quickTyped: "",
              displayValue: formatQuickBuffer(seed, ""),
              time: quickBufferToSeconds(seed, ""),
            }
          : t,
      );
    });
  };

  // 2本目以降のクイック入力: 数字キー/バックスペースのみを扱う (「.」はマスク側で自動挿入するため無視)
  const handleQuickKeyPress = (id: string, key: string) => {
    setTimes((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const seed = t.quickSeed ?? "";
        const typed = t.quickTyped ?? "";
        if (key === "Backspace") {
          if (typed.length > 0) {
            const nextTyped = typed.slice(0, -1);
            return {
              ...t,
              quickTyped: nextTyped,
              displayValue: formatQuickBuffer(seed, nextTyped),
              time: quickBufferToSeconds(seed, nextTyped),
            };
          }
          const nextSeed = seed.slice(0, -1);
          return {
            ...t,
            quickSeed: nextSeed,
            quickTyped: "",
            displayValue: formatQuickBuffer(nextSeed, ""),
            time: quickBufferToSeconds(nextSeed, ""),
          };
        }
        if (!/^[0-9]$/.test(key)) return t;
        const cap = 3 - quickSeedDigitCount(seed);
        if (typed.length >= cap) return t;
        const nextTyped = typed + key;
        return {
          ...t,
          quickTyped: nextTyped,
          displayValue: formatQuickBuffer(seed, nextTyped),
          time: quickBufferToSeconds(seed, nextTyped),
        };
      }),
    );
  };

  // キーボード上部の「次へ」アクセサリバー (iOS)。該当セルを確定し、次のセルへ移動する
  const handleAccessoryNext = (index: number) => {
    const entry = times[index];
    if (entry && entry.quickSeed === undefined) {
      // 1本目 (自由入力) はキーボードの Enter 相当の確定処理を先に行う
      handleTimeConfirm(entry.id, entry.displayValue || "");
    }
    focusNextInput(index);
  };

  // セットごとのタイムを取得
  const getTimesBySet = (setNumber: number) => {
    return times.filter((t) => t.setNumber === setNumber);
  };

  // セットごとの平均タイムを計算
  const getSetAverage = (setNumber: number) => {
    const setTimes = getTimesBySet(setNumber);
    const validTimes = setTimes.filter((t) => t.time > 0);
    if (validTimes.length === 0) return 0;
    return validTimes.reduce((sum, t) => sum + t.time, 0) / validTimes.length;
  };

  // 全体の平均タイムを計算
  const getOverallAverage = () => {
    const validTimes = times.filter((t) => t.time > 0);
    if (validTimes.length === 0) return 0;
    return validTimes.reduce((sum, t) => sum + t.time, 0) / validTimes.length;
  };

  // 最速タイムを取得
  const getFastestTime = () => {
    const validTimes = times.filter((t) => t.time > 0);
    if (validTimes.length === 0) return 0;
    return Math.min(...validTimes.map((t) => t.time));
  };

  // 保存処理
  const handleSave = () => {
    // フォーカス中のセルは blur イベントと保存ボタンの押下が競合し、
    // まだ time へ反映されていない (displayValue のみ確定済み) 場合があるため、
    // times の state 更新を待たずにここで直接確定してから保存する
    let finalTimes = times;
    const focusedId = focusedIdRef.current;
    if (focusedId) {
      const focusedEntry = times.find((t) => t.id === focusedId);
      // クイック入力セル (quickSeed が定義済み) は time が既にキー入力ごとに同期済みなのでここでは何もしない。
      // 1本目 (自由入力、quickSeed === undefined) のみ blur 前の生文字列を確定し直す必要がある
      if (focusedEntry && focusedEntry.quickSeed === undefined && focusedEntry.displayValue?.trim()) {
        const { time, displayValue } = parseInput(focusedEntry.displayValue);
        finalTimes = times.map((t) =>
          t.id === focusedId ? { ...t, time, displayValue } : t,
        );
      }
    }
    // タイムデータをストアに保存（TimeEntry形式に変換）
    if (currentMenuId) {
      const timeEntries: TimeEntry[] = finalTimes.map((t) => ({
        setNumber: t.setNumber,
        repNumber: t.repNumber,
        time: t.time,
      }));
      saveTimes(currentMenuId, timeEntries);
    }
    navigation.goBack();
  };

  return (
    <FormKeyboardAvoidingView style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: getSafeFooterPadding(16, insets.bottom) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t("practice.form.timeInputTitle")}</Text>
          <WaPointsInfoTooltip
            testID="practice-time-input-help-icon"
            ariaLabel={t("forms.timeInput.helpTitle")}
            tooltipText={t("practice.form.timeInputHelpBody")}
          />
        </View>
        <Text style={styles.subtitle}>
          {t("practice.form.timeInputSubtitle", { setCount, repCount })}
        </Text>
        {practiceTimeLimitExceeded && (
          <View style={{ marginTop: 12 }}>
            <PremiumBadge feature="practice_time_limit" />
          </View>
        )}
      </View>

      <View style={styles.timesContainer}>
        {Array.from({ length: setCount }, (_, setIndex) => {
          const setNumber = setIndex + 1;
          const setTimes = getTimesBySet(setNumber);
          const setAverage = getSetAverage(setNumber);
          const validTimesCount = setTimes.filter((t) => t.time > 0).length;

          return (
            <View key={setNumber} style={styles.setContainer}>
              <View style={styles.setHeader}>
                <Text style={styles.setTitle}>{t("practice.form.setNumberLabel", { setNumber })}</Text>
                <Text style={styles.setAverage}>
                  {setAverage > 0
                    ? t("practice.form.setAverageDetail", { avg: formatTime(setAverage), count: validTimesCount })
                    : t("practice.form.noInput")}
                </Text>
              </View>

              <View style={styles.timesGrid}>
                {setTimes.map((timeEntry, repIndex) => {
                  // 全体のインデックスを計算（セット数×本数）
                  const globalIndex = (setNumber - 1) * repCount + repIndex;
                  const isLastInput = globalIndex === setCount * repCount - 1;

                  // Free ユーザーは 18 個目までしか入力できない
                  const isDisabledByLimit = !isPremium && globalIndex >= FREE_PLAN_LIMITS.PRACTICE_TIMES_PER_LOG;

                  // 1本目のみ従来通りの自由入力 (分単位や "." を含む手入力に対応)。
                  // 2本目以降は直前の本の十の位を引き継ぐクイック入力 (masked input)
                  const isQuickInputCell = globalIndex > 0;

                  return (
                    <View key={timeEntry.id} style={[styles.timeInputContainer, isDisabledByLimit && { opacity: 0.4 }]}>
                      <Text style={styles.timeLabel}>{t("practice.modal.repLabel", { n: timeEntry.repNumber })}</Text>
                      <TextInput
                        ref={(ref) => {
                          inputRefs.current[globalIndex] = ref;
                        }}
                        style={styles.timeInput}
                        value={timeEntry.displayValue || ""}
                        onChangeText={
                          isQuickInputCell ? undefined : (value) => handleTimeChange(timeEntry.id, value)
                        }
                        onKeyPress={
                          isQuickInputCell
                            ? (e) => handleQuickKeyPress(timeEntry.id, e.nativeEvent.key)
                            : undefined
                        }
                        onFocus={() => {
                          if (isQuickInputCell) {
                            handleQuickFocus(timeEntry.id, globalIndex);
                          } else {
                            focusedIdRef.current = timeEntry.id;
                          }
                        }}
                        onBlur={() => {
                          if (focusedIdRef.current === timeEntry.id) {
                            focusedIdRef.current = null;
                          }
                          if (!isQuickInputCell) {
                            handleTimeConfirm(timeEntry.id, timeEntry.displayValue || "");
                          }
                        }}
                        onSubmitEditing={() => {
                          if (!isQuickInputCell) {
                            handleTimeConfirm(timeEntry.id, timeEntry.displayValue || "");
                          }
                          focusNextInput(globalIndex);
                        }}
                        placeholder={isDisabledByLimit ? t("practice.form.premiumLimited") : t("practice.form.timeInputPlaceholder")}
                        keyboardType="decimal-pad"
                        autoCapitalize="none"
                        returnKeyType={isLastInput ? "done" : "next"}
                        blurOnSubmit={false}
                        editable={!isDisabledByLimit}
                        inputAccessoryViewID={
                          Platform.OS === "ios"
                            ? `${QUICK_INPUT_ACCESSORY_ID}-${globalIndex}`
                            : undefined
                        }
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>

      {/* 統計情報 */}
      <View style={styles.statsContainer}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>{t("practice.form.overallAverage")}</Text>
          <Text style={styles.statValue}>
            {getOverallAverage() > 0 ? formatTime(getOverallAverage()) : t("practice.form.noInput")}
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>{t("practice.form.fastest")}</Text>
          <Text style={[styles.statValue, styles.statValueFastest]}>
            {getFastestTime() > 0 ? formatTime(getFastestTime()) : t("practice.form.noInput")}
          </Text>
        </View>
      </View>

      {/* ボタン */}
      <View style={styles.buttonContainer}>
        <Pressable style={[styles.button, styles.cancelButton]} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.saveButton]} onPress={handleSave}>
          <Text style={styles.saveButtonText}>{t("common.save")}</Text>
        </Pressable>
      </View>
      </ScrollView>

      {/*
        キーボード上の「次へ」/「完了」バー (iOS のみ。decimal-pad は改行キーが無いため専用ボタンで代替する)。
        RN の InputAccessoryView は同一 nativeID を複数の TextInput で共有すると
        最初にフォーカスした入力欄以外で表示されなくなる既知のバグがあるため、
        セルごとに一意な nativeID を持つ InputAccessoryView を個別に用意する
      */}
      {Platform.OS === "ios" &&
        times.map((entry, index) => {
          const isLast = index === times.length - 1;
          return (
            <InputAccessoryView key={entry.id} nativeID={`${QUICK_INPUT_ACCESSORY_ID}-${index}`}>
              <View style={styles.accessoryBar}>
                <Pressable
                  onPress={() => (isLast ? Keyboard.dismiss() : handleAccessoryNext(index))}
                  style={styles.accessoryNextButton}
                >
                  <Text style={styles.accessoryNextButtonText}>
                    {isLast ? t("practice.form.timeInputDone") : t("practice.form.timeInputNext")}
                  </Text>
                </Pressable>
              </View>
            </InputAccessoryView>
          );
        })}
    </FormKeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
  },
  timesContainer: {
    gap: 16,
    marginBottom: 24,
  },
  setContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  setHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  setTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  setAverage: {
    fontSize: 12,
    color: "#6B7280",
  },
  timesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  timeInputContainer: {
    flex: 1,
    minWidth: "30%",
    gap: 4,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
  },
  timeInput: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
  },
  statsContainer: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2563EB",
  },
  statValueFastest: {
    color: "#DC2626",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  saveButton: {
    backgroundColor: "#2563EB",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  accessoryBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#F3F4F6",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#D1D5DB",
  },
  accessoryNextButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  accessoryNextButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2563EB",
  },
});
