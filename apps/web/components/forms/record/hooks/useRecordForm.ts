"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format, isValid } from "date-fns";
import type {
  RecordFormData,
  RecordSet,
  SplitTimeInput,
  EditData,
  EditRecord,
  EditSplitTime,
  SwimStyle,
} from "../types";
import { generateUUID } from "../utils/timeParser";
import { FREE_PLAN_LIMITS } from "@swim-hub/shared/constants/premium";
import { validateSplitTimeLimit } from "@swim-hub/shared/utils/validators";

interface UseRecordFormOptions {
  isOpen: boolean;
  initialDate?: Date;
  editData?: EditData;
  styles?: SwimStyle[];
  isPremium?: boolean;
}

interface UseRecordFormReturn {
  formData: RecordFormData;
  setFormData: React.Dispatch<React.SetStateAction<RecordFormData>>;
  hasUnsavedChanges: boolean;
  isSubmitted: boolean;
  setIsSubmitted: (value: boolean) => void;
  resetUnsavedChanges: () => void;
  addRecord: () => void;
  removeRecord: (recordId: string) => void;
  updateRecord: (recordId: string, updates: Partial<RecordSet>) => void;
  addSplitTime: (recordId: string) => void;
  addSplitTimesEvery25m: (recordId: string) => void;
  addSplitTimesEvery50m: (recordId: string) => void;
  updateSplitTime: (recordId: string, splitIndex: number, updates: Partial<SplitTimeInput>) => void;
  removeSplitTime: (recordId: string, splitIndex: number) => void;
  sanitizeFormData: () => RecordFormData;
  /** Free ユーザーの場合、split-time が制限に達しているかどうか */
  isSplitTimeLimitReached: (recordId: string) => boolean;
  /** split-time 制限のバリデーションエラーメッセージ（制限に達している場合） */
  splitTimeLimitError: string | null;
}

/**
 * RecordForm の状態管理フック
 */
export const useRecordForm = ({
  isOpen,
  initialDate,
  editData,
  styles = [],
  isPremium = false,
}: UseRecordFormOptions): UseRecordFormReturn => {
  const [formData, setFormData] = useState<RecordFormData>(() =>
    createInitialFormData(initialDate, styles),
  );
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [splitTimeLimitError, setSplitTimeLimitError] = useState<string | null>(null);
  const isInitialChangeRef = useRef(true);

  // モーダルが閉じた時にリセット
  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false);
      setHasUnsavedChanges(false);
      setIsSubmitted(false);
      isInitialChangeRef.current = true;
    }
  }, [isOpen]);

  // initialDateが変更された時にフォームデータを更新
  useEffect(() => {
    if (isOpen && initialDate && isValid(initialDate)) {
      setFormData((prev) => ({
        ...prev,
        recordDate: format(initialDate, "yyyy-MM-dd"),
      }));
    }
  }, [isOpen, initialDate]);

  // フォームに変更があったことを記録
  useEffect(() => {
    if (isOpen) {
      if (isInitialChangeRef.current) {
        isInitialChangeRef.current = false;
        return;
      }
      setHasUnsavedChanges(true);
    }
  }, [formData, isOpen]);

  // 編集データがある場合、フォームを初期化
  useEffect(() => {
    if (!isOpen || isInitialized) return;

    if (editData) {
      // 複数のRecordが存在する場合の処理
      if (editData.records && editData.records.length > 0) {
        const records: RecordSet[] = editData.records.map((record: EditRecord, index: number) => ({
          id: record.id || `record-${index}`,
          styleId: record.styleId || styles[0]?.id || "",
          time: record.time || 0,
          isRelaying: record.isRelaying || false,
          splitTimes:
            record.splitTimes?.map((st: EditSplitTime) => ({
              distance: st.distance,
              splitTime: st.splitTime,
              uiKey: generateUUID(),
            })) || [],
          note: record.note || "",
          videoPath: record.videoPath ?? null,
          videoThumbnailPath: null,
          reactionTime: record.reactionTime?.toString() || "",
        }));

        const today = new Date();
        const defaultDate = isValid(today) ? format(today, "yyyy-MM-dd") : "";
        setFormData({
          recordDate: editData.recordDate || defaultDate,
          place: editData.place || "",
          competitionName: editData.competitionName || "",
          poolType: editData.poolType || 0,
          records: records,
          note: editData.note || "",
        });
        setIsInitialized(true);
        return;
      }

      // 単一のRecordの場合の従来の処理
      const todaySingle = new Date();
      const defaultDateSingle = isValid(todaySingle) ? format(todaySingle, "yyyy-MM-dd") : "";
      setFormData({
        recordDate: editData.recordDate || defaultDateSingle,
        place: editData.place || "",
        competitionName: editData.competitionName || "",
        poolType: editData.poolType || 0,
        records: [
          {
            id: editData.id || "1",
            styleId: editData.styleId || styles[0]?.id || "",
            time: editData.time || 0,
            isRelaying: editData.isRelaying || false,
            splitTimes:
              editData.splitTimes?.map((st: EditSplitTime) => ({
                distance: st.distance,
                splitTime: st.splitTime,
                uiKey: generateUUID(),
              })) || [],
            note: editData.note || "",
            videoPath: editData.videoPath ?? null,
            videoThumbnailPath: null,
            reactionTime: editData.reactionTime?.toString() || "",
          },
        ],
        note: editData.note || "",
      });
      setIsInitialized(true);
    } else if (!editData && isOpen) {
      // 新規作成時はデフォルト値にリセット
      setFormData(createInitialFormData(initialDate, styles));
      setIsInitialized(true);
    }
  }, [editData, isOpen, initialDate, isInitialized, styles]);

  const resetUnsavedChanges = useCallback(() => {
    setHasUnsavedChanges(false);
  }, []);

  const addRecord = useCallback(() => {
    const newRecord: RecordSet = {
      id: `record-${Date.now()}`,
      styleId: styles[0]?.id || "",
      time: 0,
      isRelaying: false,
      splitTimes: [],
      note: "",
      videoPath: null,
      reactionTime: "",
    };

    setFormData((prev) => ({
      ...prev,
      records: [...prev.records, newRecord],
    }));
  }, [styles]);

  const removeRecord = useCallback((recordId: string) => {
    setFormData((prev) => {
      if (prev.records.length <= 1) return prev;
      return {
        ...prev,
        records: prev.records.filter((record) => record.id !== recordId),
      };
    });
  }, []);

  const updateRecord = useCallback(
    (recordId: string, updates: Partial<RecordSet>) => {
      setFormData((prev) => {
        const record = prev.records.find((r) => r.id === recordId);
        if (!record) return prev;

        const updatedRecord = { ...record, ...updates };
        const style = styles.find((s) => s.id === updatedRecord.styleId);
        const raceDistance = style?.distance;

        // タイムが変更された場合、種目の距離と同じ距離のsplit-timeを自動追加/更新
        if (updates.time !== undefined && raceDistance && updatedRecord.time > 0) {
          const existingSplitIndex = updatedRecord.splitTimes.findIndex(
            (st) => typeof st.distance === "number" && st.distance === raceDistance,
          );

          if (existingSplitIndex >= 0) {
            updatedRecord.splitTimes = updatedRecord.splitTimes.map((st, idx) =>
              idx === existingSplitIndex
                ? { ...st, splitTime: updatedRecord.time, splitTimeDisplayValue: undefined }
                : st,
            );
          } else {
            const newSplitTime: SplitTimeInput = {
              distance: raceDistance,
              splitTime: updatedRecord.time,
              uiKey: generateUUID(),
            };
            updatedRecord.splitTimes = [...updatedRecord.splitTimes, newSplitTime];
          }
        }

        return {
          ...prev,
          records: prev.records.map((r) => (r.id === recordId ? updatedRecord : r)),
        };
      });
    },
    [styles],
  );

  // 最終タイム（種目距離と同じ距離のsplit-time）を除いた、課金対象のsplit-time数を返す
  const countBillableSplitTimes = useCallback(
    (record: RecordSet): number => {
      const style = styles.find((s) => s.id === record.styleId);
      const raceDistance = style?.distance;
      if (!raceDistance) return record.splitTimes.length;
      return record.splitTimes.filter(
        (st) => !(typeof st.distance === "number" && st.distance === raceDistance),
      ).length;
    },
    [styles],
  );

  const isSplitTimeLimitReached = useCallback(
    (recordId: string): boolean => {
      if (isPremium) return false;
      const record = formData.records.find((r) => r.id === recordId);
      if (!record) return false;
      return countBillableSplitTimes(record) >= FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD;
    },
    [isPremium, formData.records, countBillableSplitTimes],
  );

  const addSplitTime = useCallback((recordId: string) => {
    setFormData((prev) => {
      const record = prev.records.find((r) => r.id === recordId);
      if (!record) return prev;

      // Free ユーザーの場合、制限チェック（最終タイムは除外）
      if (!isPremium) {
        const billableCount = countBillableSplitTimes(record);
        const validation = validateSplitTimeLimit(billableCount + 1, false);
        if (!validation.valid) {
          setSplitTimeLimitError(validation.error || null);
          return prev;
        }
        setSplitTimeLimitError(null);
      }

      const newSplitTime: SplitTimeInput = {
        distance: "",
        splitTime: 0,
        uiKey: generateUUID(),
      };

      return {
        ...prev,
        records: prev.records.map((r) =>
          r.id === recordId ? { ...r, splitTimes: [...r.splitTimes, newSplitTime] } : r,
        ),
      };
    });
  }, [isPremium, countBillableSplitTimes]);

  const addSplitTimesEvery25m = useCallback(
    (recordId: string) => {
      setFormData((prev) => {
        const record = prev.records.find((r) => r.id === recordId);
        if (!record) return prev;

        const style = styles.find((s) => s.id === record.styleId);
        if (!style || !style.distance) return prev;

        const raceDistance = style.distance;
        const existingDistances = new Set(
          record.splitTimes
            .map((st) => (typeof st.distance === "number" ? st.distance : null))
            .filter((d): d is number => d !== null),
        );

        let newSplitTimes: SplitTimeInput[] = [];
        for (let distance = 25; distance <= raceDistance; distance += 25) {
          if (!existingDistances.has(distance)) {
            newSplitTimes.push({
              distance,
              splitTime: 0,
              uiKey: generateUUID(),
            });
          }
        }

        if (newSplitTimes.length === 0) return prev;

        // Free ユーザーの場合、制限内に収まるよう切り詰める（最終タイムは除外してカウント）
        if (!isPremium) {
          const billableCount = countBillableSplitTimes(record);
          // 新規追加分から最終タイム（raceDistance）を除外してカウント
          const newBillable = newSplitTimes.filter(
            (st) => !(typeof st.distance === "number" && st.distance === raceDistance),
          );
          const maxNewBillable = FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD - billableCount;
          if (maxNewBillable <= 0 && newBillable.length > 0) {
            setSplitTimeLimitError(
              `Freeプランでは${FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD}個まで登録できます。Premiumにアップグレードすると無制限に`,
            );
            // 最終タイムだけなら追加OK
            newSplitTimes = newSplitTimes.filter(
              (st) => typeof st.distance === "number" && st.distance === raceDistance,
            );
            if (newSplitTimes.length === 0) return prev;
          } else if (newBillable.length > maxNewBillable) {
            // 課金対象の中から制限内に収まるよう切り詰め、最終タイムは常に含める
            let billableAdded = 0;
            newSplitTimes = newSplitTimes.filter((st) => {
              const isRaceDist = typeof st.distance === "number" && st.distance === raceDistance;
              if (isRaceDist) return true;
              if (billableAdded < maxNewBillable) {
                billableAdded++;
                return true;
              }
              return false;
            });
            setSplitTimeLimitError(
              `Freeプランでは${FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD}個まで登録できます。Premiumにアップグレードすると無制限に`,
            );
          } else {
            setSplitTimeLimitError(null);
          }
        }

        return {
          ...prev,
          records: prev.records.map((r) =>
            r.id === recordId ? { ...r, splitTimes: [...r.splitTimes, ...newSplitTimes] } : r,
          ),
        };
      });
    },
    [styles, isPremium, countBillableSplitTimes],
  );

  const addSplitTimesEvery50m = useCallback(
    (recordId: string) => {
      setFormData((prev) => {
        const record = prev.records.find((r) => r.id === recordId);
        if (!record) return prev;

        const style = styles.find((s) => s.id === record.styleId);
        if (!style || !style.distance) return prev;

        const raceDistance = style.distance;
        const existingDistances = new Set(
          record.splitTimes
            .map((st) => (typeof st.distance === "number" ? st.distance : null))
            .filter((d): d is number => d !== null),
        );

        let newSplitTimes: SplitTimeInput[] = [];
        for (let distance = 50; distance <= raceDistance; distance += 50) {
          if (!existingDistances.has(distance)) {
            newSplitTimes.push({
              distance,
              splitTime: 0,
              uiKey: generateUUID(),
            });
          }
        }

        if (newSplitTimes.length === 0) return prev;

        // Free ユーザーの場合、制限内に収まるよう切り詰める（最終タイムは除外してカウント）
        if (!isPremium) {
          const billableCount = countBillableSplitTimes(record);
          const newBillable = newSplitTimes.filter(
            (st) => !(typeof st.distance === "number" && st.distance === raceDistance),
          );
          const maxNewBillable = FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD - billableCount;
          if (maxNewBillable <= 0 && newBillable.length > 0) {
            setSplitTimeLimitError(
              `Freeプランでは${FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD}個まで登録できます。Premiumにアップグレードすると無制限に`,
            );
            newSplitTimes = newSplitTimes.filter(
              (st) => typeof st.distance === "number" && st.distance === raceDistance,
            );
            if (newSplitTimes.length === 0) return prev;
          } else if (newBillable.length > maxNewBillable) {
            let billableAdded = 0;
            newSplitTimes = newSplitTimes.filter((st) => {
              const isRaceDist = typeof st.distance === "number" && st.distance === raceDistance;
              if (isRaceDist) return true;
              if (billableAdded < maxNewBillable) {
                billableAdded++;
                return true;
              }
              return false;
            });
            setSplitTimeLimitError(
              `Freeプランでは${FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD}個まで登録できます。Premiumにアップグレードすると無制限に`,
            );
          } else {
            setSplitTimeLimitError(null);
          }
        }

        return {
          ...prev,
          records: prev.records.map((r) =>
            r.id === recordId ? { ...r, splitTimes: [...r.splitTimes, ...newSplitTimes] } : r,
          ),
        };
      });
    },
    [styles, isPremium, countBillableSplitTimes],
  );

  const updateSplitTime = useCallback(
    (recordId: string, splitIndex: number, updates: Partial<SplitTimeInput>) => {
      setFormData((prev) => {
        const record = prev.records.find((r) => r.id === recordId);
        if (!record) return prev;

        const style = styles.find((s) => s.id === record.styleId);
        const raceDistance = style?.distance;

        const updatedSplitTimes = record.splitTimes.map((split, index) =>
          index === splitIndex ? { ...split, ...updates } : split,
        );

        const updatedSplit = updatedSplitTimes[splitIndex];
        let updatedRecord = { ...record, splitTimes: updatedSplitTimes };

        // 種目の距離と同じ距離のsplit-timeが変更されたら、タイムも同期
        if (
          raceDistance &&
          typeof updatedSplit.distance === "number" &&
          updatedSplit.distance === raceDistance &&
          updates.splitTime !== undefined
        ) {
          updatedRecord = {
            ...updatedRecord,
            time: updates.splitTime,
            timeDisplayValue: undefined,
          };
        }

        return {
          ...prev,
          records: prev.records.map((r) => (r.id === recordId ? updatedRecord : r)),
        };
      });
    },
    [styles],
  );

  const removeSplitTime = useCallback((recordId: string, splitIndex: number) => {
    setFormData((prev) => {
      const record = prev.records.find((r) => r.id === recordId);
      if (!record) return prev;

      return {
        ...prev,
        records: prev.records.map((r) =>
          r.id === recordId
            ? {
                ...r,
                splitTimes: r.splitTimes.filter((_, index) => index !== splitIndex),
              }
            : r,
        ),
      };
    });
  }, []);

  const sanitizeFormData = useCallback((): RecordFormData => {
    return {
      ...formData,
      records: formData.records.map((record) => {
        const style = styles.find((s) => s.id === record.styleId);
        const raceDistance = style?.distance;

        // 種目の距離と同じ距離のsplit_timeは保存しない
        // （ゴールタイム=split_timeなので途中経過ではない）
        const filteredSplitTimes = record.splitTimes
          .filter((st) => {
            if (raceDistance && Number(st.distance) === raceDistance) {
              return false;
            }
            return true;
          })
          .map((st) => ({
            distance: st.distance,
            splitTime: st.splitTime,
          }));

        return {
          ...record,
          splitTimes: filteredSplitTimes,
        };
      }),
    };
  }, [formData, styles]);

  return {
    formData,
    setFormData,
    hasUnsavedChanges,
    isSubmitted,
    setIsSubmitted,
    resetUnsavedChanges,
    addRecord,
    removeRecord,
    updateRecord,
    addSplitTime,
    addSplitTimesEvery25m,
    addSplitTimesEvery50m,
    updateSplitTime,
    removeSplitTime,
    sanitizeFormData,
    isSplitTimeLimitReached,
    splitTimeLimitError,
  };
};

function createInitialFormData(initialDate?: Date, styles?: SwimStyle[]): RecordFormData {
  const today = new Date();
  const validInitialDate = initialDate && isValid(initialDate) ? initialDate : null;
  const validToday = isValid(today) ? today : null;

  return {
    recordDate: validInitialDate
      ? format(validInitialDate, "yyyy-MM-dd")
      : validToday
        ? format(validToday, "yyyy-MM-dd")
        : "",
    place: "",
    competitionName: "",
    poolType: 0,
    records: [
      {
        id: "1",
        styleId: styles?.[0]?.id || "",
        time: 0,
        isRelaying: false,
        splitTimes: [],
        note: "",
        videoPath: null,
        reactionTime: "",
      },
    ],
    note: "",
  };
}

export default useRecordForm;
