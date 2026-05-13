"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthProvider";
import BaseModal from "@/components/ui/BaseModal";
import Button from "@/components/ui/Button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { formatTimeShort, formatTimeAverage, parseTime } from "@apps/shared/utils/time";
import { autoAssignMembers } from "@/utils/memberMatch";
import { transformScanResultToMenus, type GeminiScanResult } from "@/utils/ocrTransform";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { CameraIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  users: {
    id: string;
    name: string;
  };
}

// PracticeLogClientのPracticeMenu型と一致
interface PracticeMenu {
  id: string;
  style: string;
  swimCategory: "Swim" | "Pull" | "Kick";
  distance: number | "";
  reps: number | "";
  sets: number | "";
  circleMin: number | "";
  circleSec: number | "";
  note: string;
  tags: [];
  times: Array<{
    memberId: string;
    times: Array<{
      setNumber: number;
      repNumber: number;
      time: number;
      displayValue: string;
    }>;
  }>;
  targetUserIds: string[];
}

interface OcrScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (menus: PracticeMenu[]) => void;
  members: TeamMember[];
  presentUserIds: string[];
}

type ModalStep = "upload" | "analyzing" | "results";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png"];

function isGeminiScanResult(obj: unknown): obj is GeminiScanResult {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;

  // menu validation
  if (typeof o.menu !== "object" || o.menu === null) return false;
  const menu = o.menu as Record<string, unknown>;
  if (typeof menu.distance !== "number") return false;
  if (typeof menu.repCount !== "number") return false;
  if (typeof menu.setCount !== "number") return false;

  // swimmers validation
  if (!Array.isArray(o.swimmers)) return false;
  for (const s of o.swimmers) {
    if (typeof s !== "object" || s === null) return false;
    const swimmer = s as Record<string, unknown>;
    if (typeof swimmer.no !== "number") return false;
    if (typeof swimmer.name !== "string") return false;
    if (!Array.isArray(swimmer.times)) return false;
  }

  return true;
}

export default function OcrScanModal({ isOpen, onClose, onApply, members }: OcrScanModalProps) {
  const t = useTranslations("teamsAdmin");
  const { supabase } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // アンマウント時に進行中の解析をキャンセル
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      abortControllerRef.current?.abort();
    };
  }, []);

  const [step, setStep] = useState<ModalStep>("upload");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<GeminiScanResult | null>(null);

  // 結果ステップの状態
  const [memberAssignments, setMemberAssignments] = useState<Record<number, string>>({});
  const [editedTimes, setEditedTimes] = useState<Record<string, number | null>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // リセット
  const resetModal = useCallback(() => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setStep("upload");
    setImageFile(null);
    setImagePreview(null);
    setError(null);
    setScanResult(null);
    setMemberAssignments({});
    setEditedTimes({});
    setEditingCell(null);
    setEditingValue("");
  }, [imagePreview]);

  const handleClose = useCallback(() => {
    resetModal();
    onClose();
  }, [resetModal, onClose]);

  // ファイルバリデーション
  const validateFile = useCallback(
    (file: File): string | null => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return t("ocr.upload.invalidTypeError");
      }
      if (file.size > MAX_FILE_SIZE) {
        return t("ocr.upload.fileSizeError");
      }
      return null;
    },
    [t],
  );

  // ファイル選択
  const handleFileSelect = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setError(null);
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    },
    [imagePreview, validateFile],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  // ドラッグ&ドロップ
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  // 解析実行
  const handleAnalyze = useCallback(async () => {
    if (!imageFile || !supabase) return;

    cancelledRef.current = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStep("analyzing");
    setError(null);

    try {
      // FileをBase64に変換
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // data:image/...;base64, のプレフィックスを除去
          const base64Data = result.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      if (cancelledRef.current) return;

      const { data, error: fnError } = await supabase.functions.invoke("scan-timesheet", {
        body: {
          image: base64,
          mimeType: imageFile.type,
        },
        signal: controller.signal,
      });

      if (cancelledRef.current) return;

      if (fnError) {
        throw new Error(fnError.message || t("ocr.errors.serverError"));
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (!isGeminiScanResult(data)) {
        console.error("Invalid scan response shape:", data);
        throw new Error(t("ocr.errors.invalidFormat"));
      }

      setScanResult(data);

      // 自動メンバーマッチング
      const assignments = autoAssignMembers(data.swimmers, members);
      setMemberAssignments(assignments);

      setStep("results");
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : t("ocr.errors.analyzeError"));
      setStep("upload");
    }
  }, [imageFile, supabase, members, t]);

  // メンバー割り当て変更
  const handleMemberAssign = useCallback((swimmerNo: number, userId: string) => {
    setMemberAssignments((prev) => {
      if (userId === "") {
        const next = { ...prev };
        delete next[swimmerNo];
        return next;
      }
      return { ...prev, [swimmerNo]: userId };
    });
  }, []);

  // タイム編集
  const handleTimeEditStart = useCallback((key: string, currentValue: number | null) => {
    setEditingCell(key);
    setEditingValue(currentValue !== null ? formatTimeShort(currentValue) : "");
  }, []);

  const handleTimeEditConfirm = useCallback(() => {
    if (editingCell === null) return;
    const value = editingValue.trim();
    if (value === "") {
      setEditedTimes((prev) => ({ ...prev, [editingCell]: null }));
    } else {
      const parsed = parseTime(value);
      if (parsed > 0) {
        setEditedTimes((prev) => ({ ...prev, [editingCell]: parsed }));
      }
    }
    setEditingCell(null);
    setEditingValue("");
  }, [editingCell, editingValue]);

  const handleTimeEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleTimeEditConfirm();
      } else if (e.key === "Escape") {
        setEditingCell(null);
        setEditingValue("");
      }
    },
    [handleTimeEditConfirm],
  );

  // 実際のタイム値を取得 (editedTimesがあればそちらを優先)
  const getTimeValue = useCallback(
    (swimmerNo: number, timeIndex: number): number | null => {
      const key = `${swimmerNo}-${timeIndex}`;
      if (key in editedTimes) return editedTimes[key];
      const swimmer = scanResult?.swimmers.find((s) => s.no === swimmerNo);
      return swimmer?.times[timeIndex] ?? null;
    },
    [editedTimes, scanResult],
  );

  // 全員アサイン済みか
  const allAssigned = scanResult
    ? scanResult.swimmers.every((s) => memberAssignments[s.no])
    : false;

  // フォーム反映
  const handleApply = useCallback(() => {
    if (!scanResult) return;
    // 未割り当てがある場合は確認ダイアログを表示
    if (!allAssigned) {
      setShowDiscardConfirm(true);
      return;
    }
    const menus = transformScanResultToMenus(scanResult, memberAssignments, members, editedTimes);
    onApply(menus);
    handleClose();
  }, [scanResult, memberAssignments, members, editedTimes, onApply, handleClose, allAssigned]);

  // 未割り当て破棄を確認してフォーム反映
  const handleConfirmDiscard = useCallback(() => {
    if (!scanResult) return;
    setShowDiscardConfirm(false);
    const menus = transformScanResultToMenus(scanResult, memberAssignments, members, editedTimes);
    onApply(menus);
    handleClose();
  }, [scanResult, memberAssignments, members, editedTimes, onApply, handleClose]);

  // 選択済みのuser_id一覧 (重複防止)
  const assignedUserIds = new Set(Object.values(memberAssignments));

  // ステップ1: アップロード
  const renderUploadStep = () => (
    <div className="space-y-4">
      {/* ドロップゾーン */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        tabIndex={0}
        role="button"
        aria-label={t("ocr.upload.dropzoneText")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <CameraIcon className="h-12 w-12 mx-auto text-gray-400 mb-3" />
        <p className="text-sm text-gray-600">{t("ocr.upload.dropzoneText")}</p>
        <p className="text-xs text-gray-400 mt-1">{t("ocr.upload.dropzoneHint")}</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* プレビュー */}
      {imagePreview && (
        <div className="relative">
          <img
            src={imagePreview}
            alt={t("ocr.upload.dropzoneText")}
            className="w-full max-h-64 object-contain rounded-lg border"
          />
          <button
            type="button"
            onClick={() => {
              if (imagePreview) URL.revokeObjectURL(imagePreview);
              if (fileInputRef.current) fileInputRef.current.value = "";
              setImageFile(null);
              setImagePreview(null);
              setError(null);
            }}
            className="absolute top-2 right-2 bg-white rounded-full p-1 shadow hover:bg-gray-100"
            aria-label={t("ocr.upload.dropzoneText")}
          >
            <span className="text-gray-500 text-sm">✕</span>
          </button>
        </div>
      )}

      {/* エラー */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 解析ボタン */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={handleClose}>
          {t("ocr.upload.cancelButton")}
        </Button>
        <Button
          type="button"
          onClick={handleAnalyze}
          disabled={!imageFile}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {t("ocr.upload.analyzeButton")}
        </Button>
      </div>
    </div>
  );

  // ステップ2: 解析中
  const renderAnalyzingStep = () => (
    <div className="py-12">
      <LoadingSpinner size="lg" message={t("ocr.analyzing.message")} />
      <div className="flex justify-center mt-6">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            cancelledRef.current = true;
            abortControllerRef.current?.abort();
            setStep("upload");
            setError(null);
          }}
        >
          {t("ocr.analyzing.cancelButton")}
        </Button>
      </div>
    </div>
  );

  // ステップ3: 結果確認
  const renderResultsStep = () => {
    if (!scanResult) return null;

    const { menu, swimmers } = scanResult;
    const totalTimes = menu.repCount * menu.setCount;

    return (
      <div className="space-y-4">
        {/* メニュー情報 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">{t("ocr.results.sectionTitle")}</h4>
          <div className="flex flex-wrap gap-4 text-sm text-blue-800">
            <span>{t("ocr.results.distanceLabel")} {menu.distance}m</span>
            <span>
              {t("ocr.results.repsLabel")} {menu.repCount} × {menu.setCount}
            </span>
            {menu.circle && (
              <span>
                {t("ocr.results.circleLabel")} {Math.floor(menu.circle / 60)}:{String(menu.circle % 60).padStart(2, "0")}
              </span>
            )}
          </div>
          {menu.description && <p className="text-xs text-blue-600 mt-1">{menu.description}</p>}
        </div>

        {/* 結果テーブル */}
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">{t("ocr.results.col.no")}</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 min-w-[160px]">
                  {t("ocr.results.col.member")}
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">{t("ocr.results.col.style")}</th>
                {Array.from({ length: totalTimes }, (_, i) => (
                  <th key={i} className="px-2 py-2 text-center text-xs font-medium text-gray-500">
                    {t("ocr.results.col.repN", { n: i + 1 })}
                  </th>
                ))}
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">{t("ocr.results.col.average")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {swimmers.map((swimmer) => {
                const validTimes: number[] = [];
                for (let i = 0; i < totalTimes; i++) {
                  const tv = getTimeValue(swimmer.no, i);
                  if (tv !== null && tv > 0) validTimes.push(tv);
                }
                const avg =
                  validTimes.length > 0
                    ? validTimes.reduce((a, b) => a + b, 0) / validTimes.length
                    : 0;
                const minTime = validTimes.length > 0 ? Math.min(...validTimes) : null;
                const maxTime = validTimes.length > 0 ? Math.max(...validTimes) : null;

                return (
                  <tr key={swimmer.no} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{swimmer.no}</td>
                    <td className="px-3 py-2">
                      <select
                        value={memberAssignments[swimmer.no] || ""}
                        onChange={(e) => handleMemberAssign(swimmer.no, e.target.value)}
                        className={`w-full px-2 py-1 border rounded text-sm ${
                          memberAssignments[swimmer.no]
                            ? "border-gray-300"
                            : "border-yellow-400 bg-yellow-50"
                        }`}
                      >
                        <option value="">{t("ocr.results.unselectedOption")}</option>
                        {members.map((m) => (
                          <option
                            key={m.user_id}
                            value={m.user_id}
                            disabled={
                              assignedUserIds.has(m.user_id) &&
                              memberAssignments[swimmer.no] !== m.user_id
                            }
                          >
                            {m.users.name}
                            {assignedUserIds.has(m.user_id) &&
                            memberAssignments[swimmer.no] !== m.user_id
                              ? t("ocr.results.alreadySelectedSuffix")
                              : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center text-gray-700">{swimmer.style}</td>
                    {Array.from({ length: totalTimes }, (_, i) => {
                      const key = `${swimmer.no}-${i}`;
                      const timeVal = getTimeValue(swimmer.no, i);
                      const isEditing = editingCell === key;
                      const isFastest =
                        timeVal !== null && timeVal === minTime && validTimes.length > 1;
                      const isSlowest =
                        timeVal !== null && timeVal === maxTime && validTimes.length > 1;

                      return (
                        <td key={i} className="px-2 py-2 text-center">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={handleTimeEditConfirm}
                              onKeyDown={handleTimeEditKeyDown}
                              className="w-16 px-1 py-0.5 text-sm border border-blue-400 rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
                              autoFocus
                            />
                          ) : (
                            <span
                              onClick={() => handleTimeEditStart(key, timeVal)}
                              tabIndex={0}
                              role="button"
                              aria-label={`${swimmer.no}番 ${i + 1}本目のタイムを編集`}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleTimeEditStart(key, timeVal);
                                }
                              }}
                              className={`inline-block w-16 px-1 py-0.5 rounded cursor-pointer hover:bg-gray-100 font-mono text-sm ${
                                timeVal === null
                                  ? "bg-yellow-100 text-yellow-700"
                                  : isFastest
                                    ? "text-red-600 font-bold"
                                    : isSlowest
                                      ? "text-blue-600 font-bold"
                                      : "text-gray-800"
                              }`}
                            >
                              {timeVal !== null ? formatTimeShort(timeVal) : "--"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center text-sm font-medium text-blue-600">
                      {avg > 0 ? formatTimeAverage(avg) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* アクションボタン */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setStep("upload");
                setScanResult(null);
                setMemberAssignments({});
                setEditedTimes({});
              }}
            >
              <ArrowPathIcon className="h-4 w-4 mr-1" />
              {t("ocr.results.retryButton")}
            </Button>
            {!allAssigned && (
              <span className="text-sm text-yellow-600">{t("ocr.results.unassignedWarning")}</span>
            )}
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={handleClose}>
              {t("ocr.results.cancelButton")}
            </Button>
            <Button
              type="button"
              onClick={handleApply}
              disabled={!scanResult?.swimmers.some((s) => memberAssignments[s.no])}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {t("ocr.results.applyButton")}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const stepTitles: Record<ModalStep, string> = {
    upload: t("ocr.stepTitle.upload"),
    analyzing: t("ocr.stepTitle.analyzing"),
    results: t("ocr.stepTitle.results"),
  };

  return (
    <BaseModal isOpen={isOpen} onClose={handleClose} title={stepTitles[step]} size="xl">
      {step === "upload" && renderUploadStep()}
      {step === "analyzing" && renderAnalyzingStep()}
      {step === "results" && renderResultsStep()}

      {/* 未割り当て破棄確認ダイアログ */}
      <ConfirmDialog
        isOpen={showDiscardConfirm}
        onConfirm={handleConfirmDiscard}
        onCancel={() => setShowDiscardConfirm(false)}
        title={t("ocr.discardConfirm.title")}
        message={t("ocr.discardConfirm.message", {
          count: scanResult ? scanResult.swimmers.filter((s) => !memberAssignments[s.no]).length : 0,
        })}
        confirmLabel={t("ocr.discardConfirm.confirmButton")}
        cancelLabel={t("ocr.discardConfirm.cancelButton")}
        variant="warning"
      />
    </BaseModal>
  );
}
