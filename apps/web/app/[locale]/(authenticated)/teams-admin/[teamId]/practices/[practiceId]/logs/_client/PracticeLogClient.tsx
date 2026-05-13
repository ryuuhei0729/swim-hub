"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useAuth } from "@/contexts/AuthProvider";
import Button from "@/components/ui/Button";
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  ClockIcon,
  CalendarDaysIcon,
  MapPinIcon,
  UserGroupIcon,
  XMarkIcon,
  CheckIcon,
  ChevronDownIcon,
  SparklesIcon,
  PrinterIcon,
} from "@heroicons/react/24/outline";
import TagInput from "@/components/forms/TagInput";
import TeamTimeInputModal from "@/components/team/TeamTimeInputModal";
import type { TeamTimeEntry } from "@/components/team/TeamTimeInputModal";
import OcrScanModal from "@/components/team/OcrScanModal";
import { PracticeTag, Practice } from "@apps/shared/types";

// TeamVideoUploaderを動的インポート（重いコンポーネント）
const TeamVideoUploader = dynamic(() => import("@/components/video/TeamVideoUploader"), {
  ssr: false,
});

import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { openTimesheetPrintWindow } from "@/utils/generateTimesheetHtml";
import { format, parseISO, isValid } from "date-fns";
import { ja, enUS } from "date-fns/locale";

type Tag = PracticeTag;

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  users: {
    id: string;
    name: string;
  };
}

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
  tags: Tag[];
  times: TeamTimeEntry[];
  targetUserIds: string[]; // 対象ユーザーのuser_idリスト
  videoFiles?: Record<string, File | null>; // memberId → File のマップ
  videoThumbnails?: Record<string, Blob | null>; // memberId → Blob のマップ
}

interface PracticeWithDetails extends Practice {
  team: {
    id: string;
    name: string;
  } | null;
}

interface PracticeLogWithDetails {
  id: string;
  user_id: string;
  style: string;
  swim_category: "Swim" | "Pull" | "Kick";
  distance: number;
  rep_count: number;
  set_count: number;
  circle: number | null;
  note: string | null;
  practice_log_tags: {
    practice_tags: PracticeTag;
  }[];
  practice_times: {
    id: string;
    user_id: string;
    set_number: number;
    rep_number: number;
    time: number;
  }[];
}

interface PracticeLogClientProps {
  teamId: string;
  practiceId: string;
  practice: PracticeWithDetails;
  members: TeamMember[];
  existingLogs: PracticeLogWithDetails[];
  availableTags: PracticeTag[];
  presentUserIds: string[]; // 出席しているメンバーのuser_idリスト
}

// 泳法カテゴリの選択肢
const SWIM_CATEGORIES = [
  { value: "Swim", label: "Swim" },
  { value: "Pull", label: "Pull" },
  { value: "Kick", label: "Kick" },
];

export default function PracticeLogClient({
  teamId,
  practiceId,
  practice,
  members,
  existingLogs,
  availableTags: initialTags,
  presentUserIds,
}: PracticeLogClientProps) {
  const t = useTranslations("teamsAdmin");
  const tPractice = useTranslations("practice");
  const locale = useLocale();
  const router = useRouter();
  const { supabase } = useAuth();

  const SWIM_STYLES = useMemo(() => [
    { value: "Fr", label: tPractice("styles.Fr") },
    { value: "Ba", label: tPractice("styles.Ba") },
    { value: "Br", label: tPractice("styles.Br") },
    { value: "Fly", label: tPractice("styles.Fly") },
    { value: "IM", label: tPractice("styles.IM") },
  ], [tPractice]);

  const [availableTags, setAvailableTags] = useState<Tag[]>(initialTags);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showOcrModal, setShowOcrModal] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [pendingOcrMenus, setPendingOcrMenus] = useState<PracticeMenu[] | null>(null);
  const [showUserSelectModal, setShowUserSelectModal] = useState(false);
  const [currentMenuIdForUserSelect, setCurrentMenuIdForUserSelect] = useState<string | null>(null);
  const [tempSelectedUserIds, setTempSelectedUserIds] = useState<string[]>([]);
  const [videoUploadModal, setVideoUploadModal] = useState<{
    menuId: string;
    memberId: string;
  } | null>(null);

  // 秒数を表示用フォーマットに変換
  const formatTime = (seconds: number) => {
    if (seconds === 0) return "";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0
      ? `${minutes}:${remainingSeconds.toFixed(2).padStart(5, "0")}`
      : `${remainingSeconds.toFixed(2)}`;
  };

  // 既存データからメニューを構築
  const buildMenusFromLogs = (): PracticeMenu[] => {
    if (existingLogs.length === 0) {
      // 新規作成時は出席者をデフォルト選択
      return [
        {
          id: "1",
          style: "Fr",
          swimCategory: "Swim",
          distance: 100,
          reps: 4,
          sets: 1,
          circleMin: 1,
          circleSec: 30,
          note: "",
          tags: [],
          times: [],
          targetUserIds: presentUserIds.length > 0 ? presentUserIds : members.map((m) => m.user_id),
        },
      ];
    }

    // 同じメニュー構成のログをグループ化
    const menuGroups = new Map<
      string,
      {
        style: string;
        swim_category: "Swim" | "Pull" | "Kick";
        distance: number;
        rep_count: number;
        set_count: number;
        circle: number | null;
        note: string | null;
        tags: PracticeTag[];
        times: TeamTimeEntry[];
        targetUserIds: string[];
      }
    >();

    for (const log of existingLogs) {
      const key = `${log.style}-${log.swim_category || "Swim"}-${log.distance}-${log.rep_count}-${log.set_count}`;

      if (!menuGroups.has(key)) {
        const tags =
          log.practice_log_tags
            ?.map((plt) => plt.practice_tags)
            .filter((tag): tag is PracticeTag => tag != null) || [];

        menuGroups.set(key, {
          style: log.style,
          swim_category: log.swim_category || "Swim",
          distance: log.distance,
          rep_count: log.rep_count,
          set_count: log.set_count,
          circle: log.circle,
          note: log.note,
          tags,
          times: [],
          targetUserIds: [],
        });
      }

      // このログのuser_idを対象ユーザーに追加
      const group = menuGroups.get(key)!;
      if (!group.targetUserIds.includes(log.user_id)) {
        group.targetUserIds.push(log.user_id);
      }

      // メンバーのタイムを追加
      const member = members.find((m) => m.user_id === log.user_id);
      if (member && log.practice_times && log.practice_times.length > 0) {
        const existingMemberTime = group.times.find((t) => t.memberId === member.id);

        const memberTimes = log.practice_times.map((pt) => ({
          setNumber: pt.set_number,
          repNumber: pt.rep_number,
          time: pt.time,
          displayValue: formatTime(pt.time),
        }));

        if (existingMemberTime) {
          existingMemberTime.times.push(...memberTimes);
        } else {
          group.times.push({
            memberId: member.id,
            times: memberTimes,
          });
        }
      }
    }

    return Array.from(menuGroups.entries()).map(([_key, group], index) => ({
      id: String(index + 1),
      style: group.style,
      swimCategory: group.swim_category,
      distance: group.distance,
      reps: group.rep_count,
      sets: group.set_count,
      circleMin: group.circle ? Math.floor(group.circle / 60) : 1,
      circleSec: group.circle ? group.circle % 60 : 30,
      note: group.note || "",
      tags: group.tags,
      times: group.times,
      targetUserIds: group.targetUserIds,
    }));
  };

  const [menus, setMenus] = useState<PracticeMenu[]>(buildMenusFromLogs);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null);

  const isEditMode = existingLogs.length > 0;

  const addMenu = () => {
    const newMenu: PracticeMenu = {
      id: Date.now().toString(),
      style: "Fr",
      swimCategory: "Swim",
      distance: 100,
      reps: 4,
      sets: 1,
      circleMin: 1,
      circleSec: 30,
      note: "",
      tags: [],
      times: [],
      targetUserIds: presentUserIds.length > 0 ? presentUserIds : members.map((m) => m.user_id),
    };
    setMenus((prev) => [...prev, newMenu]);
  };

  const removeMenu = (menuId: string) => {
    if (menus.length > 1) {
      setMenus((prev) => prev.filter((menu) => menu.id !== menuId));
    }
  };

  const updateMenu = <K extends keyof PracticeMenu>(
    menuId: string,
    field: K,
    value: PracticeMenu[K],
  ) => {
    setMenus((prev) =>
      prev.map((menu) => (menu.id === menuId ? { ...menu, [field]: value } : menu)),
    );
  };

  const handleTimeSave = (menuId: string, times: TeamTimeEntry[]) => {
    updateMenu(menuId, "times", times);
  };

  const handleVideoReady = (menuId: string, memberId: string, file: File, thumbnail: Blob) => {
    setMenus((prev) =>
      prev.map((menu) => {
        if (menu.id !== menuId) return menu;
        return {
          ...menu,
          videoFiles: { ...(menu.videoFiles ?? {}), [memberId]: file },
          videoThumbnails: { ...(menu.videoThumbnails ?? {}), [memberId]: thumbnail },
        };
      }),
    );
    setVideoUploadModal(null);
  };

  const getMemberName = (memberId: string): string => {
    const member = members.find((m) => m.user_id === memberId);
    return member?.users.name ?? memberId;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 既に保存処理中の場合は重複実行を防ぐ
    if (saving) {
      return;
    }

    setSaving(true);

    try {
      // ログデータを準備
      const logsData: Array<{
        user_id: string;
        style: string;
        swim_category: "Swim" | "Pull" | "Kick";
        rep_count: number;
        set_count: number;
        distance: number;
        note: string;
        practice_times: Array<{
          set_number: number;
          rep_number: number;
          time: number;
        }>;
        tag_ids: string[];
      }> = [];

      for (const menu of menus) {
        // 対象ユーザーのみにログを作成
        const targetMembers = members.filter((m) => menu.targetUserIds.includes(m.user_id));

        for (const member of targetMembers) {
          const memberTimes = menu.times.find((t) => t.memberId === member.id)?.times || [];

          logsData.push({
            user_id: member.user_id,
            style: menu.style,
            swim_category: menu.swimCategory,
            rep_count: Number(menu.reps) || 1,
            set_count: Number(menu.sets) || 1,
            distance: Number(menu.distance) || 100,
            note: menu.note || "",
            practice_times: memberTimes.map((timeEntry) => ({
              set_number: timeEntry.setNumber,
              rep_number: timeEntry.repNumber,
              time: timeEntry.time,
            })),
            tag_ids: menu.tags.map((tag) => tag.id),
          });
        }
      }

      if (logsData.length === 0) {
        setSubmitError(t("practiceLog.errorAtLeastOne"));
        setSaving(false);
        return;
      }

      // RPC関数を呼び出して原子性のある操作を実行
      // replace_practice_logsは、practice_idに紐づくすべてのログを削除してから新しいログを挿入する
      const { data: result, error: rpcError } = await supabase.rpc("replace_practice_logs", {
        p_practice_id: practiceId,
        p_logs_data: logsData,
      });

      if (rpcError) {
        console.error("練習ログ保存エラー:", rpcError);
        setSubmitError(t("practiceLog.errorSave"));
        setSaving(false);
        return;
      }

      // RPC関数の戻り値を確認
      if (result && typeof result === "object" && "success" in result) {
        if (!result.success) {
          const errorMessage = result.error || t("practiceLog.errorSave");
          console.error("練習ログ保存エラー:", errorMessage);
          setSubmitError(t("practiceLog.errorSaveWithMessage", { message: errorMessage }));
          setSaving(false);
          return;
        }
      }

      // 保存成功後に動画をアップロード
      // RPC の戻り値から保存されたログID一覧を取得（構造によってはスキップ）
      if (
        result &&
        typeof result === "object" &&
        "log_ids" in result &&
        Array.isArray((result as { log_ids: unknown[] }).log_ids)
      ) {
        const logIds = (result as { log_ids: string[] }).log_ids;
        // logsData と同じ menus → targetMembers の順序で flat index → logId のマップを構築
        const logIdMap = new Map<string, string>();
        let flatIdx = 0;
        for (let mi = 0; mi < menus.length; mi++) {
          const targetMembers = members.filter((m) => menus[mi].targetUserIds.includes(m.user_id));
          for (const member of targetMembers) {
            if (logIds[flatIdx]) {
              logIdMap.set(`${mi}_${member.user_id}`, logIds[flatIdx]);
            }
            flatIdx++;
          }
        }
        const videoUploadErrors: string[] = [];
        for (let i = 0; i < menus.length; i++) {
          const menu = menus[i];
          if (!menu.videoFiles) continue;
          for (const [memberId, videoFile] of Object.entries(menu.videoFiles)) {
            if (!videoFile) continue;
            const thumbnail = menu.videoThumbnails?.[memberId];
            const logId = logIdMap.get(`${i}_${memberId}`);
            if (!logId) continue;
            try {
              const uploadUrlRes = await fetch("/api/storage/videos/upload-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "practice-log", id: logId, contentType: "video/mp4" }),
              });
              if (!uploadUrlRes.ok) {
                const memberName = members.find((m) => m.user_id === memberId)?.users?.name ?? memberId;
                videoUploadErrors.push(t("practiceLog.errorVideoUploadUrlFailed", { name: memberName, status: uploadUrlRes.status }));
                continue;
              }
              const { videoUploadUrl, thumbnailUploadUrl, videoPath: vPath, thumbnailPath: tPath } =
                await uploadUrlRes.json() as {
                  videoUploadUrl: string;
                  thumbnailUploadUrl: string;
                  videoPath: string;
                  thumbnailPath: string;
                };
              const putRes = await fetch(videoUploadUrl, { method: "PUT", body: videoFile });
              if (!putRes.ok) {
                const memberName = members.find((m) => m.user_id === memberId)?.users?.name ?? memberId;
                videoUploadErrors.push(t("practiceLog.errorVideoUploadFailed", { name: memberName, status: putRes.status }));
                continue;
              }
              if (thumbnail) {
                const thumbRes = await fetch(thumbnailUploadUrl, { method: "PUT", body: thumbnail });
                if (!thumbRes.ok) {
                  const memberName = members.find((m) => m.user_id === memberId)?.users?.name ?? memberId;
                  videoUploadErrors.push(t("practiceLog.errorVideoThumbnailFailed", { name: memberName, status: thumbRes.status }));
                  continue;
                }
              }
              const confirmFormData = new FormData();
              confirmFormData.append("type", "practice-log");
              confirmFormData.append("id", logId);
              confirmFormData.append("videoPath", vPath);
              confirmFormData.append("thumbnailPath", tPath);
              if (thumbnail) {
                confirmFormData.append(
                  "thumbnailBlob",
                  new File([thumbnail], "thumbnail.webp", { type: "image/webp" }),
                );
              }
              const confirmRes = await fetch("/api/storage/videos/confirm", { method: "POST", body: confirmFormData });
              if (!confirmRes.ok) {
                const memberName = members.find((m) => m.user_id === memberId)?.users?.name ?? memberId;
                videoUploadErrors.push(t("practiceLog.errorVideoConfirmFailed", { name: memberName, status: confirmRes.status }));
                continue;
              }
              // team-assign APIでターゲットユーザーに移動
              const assignRes = await fetch("/api/storage/videos/team-assign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "practice-log",
                  sourceId: logId,
                  targetUserId: memberId,
                  teamId,
                  tempVideoPath: vPath,
                  tempThumbnailPath: tPath,
                }),
              });
              if (!assignRes.ok) {
                const memberName = members.find((m) => m.user_id === memberId)?.users?.name ?? memberId;
                videoUploadErrors.push(t("practiceLog.errorVideoAssignFailed", { name: memberName, status: assignRes.status }));
              }
            } catch (videoErr) {
              console.error("動画アップロードエラー:", videoErr);
              const memberName = members.find((m) => m.user_id === memberId)?.users?.name ?? memberId;
              videoUploadErrors.push(t("practiceLog.errorVideoGenericFailed", { name: memberName }));
            }
          }
        }
        if (videoUploadErrors.length > 0) {
          setSubmitError(t("practiceLog.errorVideoUpload", { errors: videoUploadErrors.join("\n") }));
        }
      }

      // 成功時はリダイレクト
      router.push(`/teams/${teamId}?tab=practices`);
    } catch (err) {
      console.error("チーム練習ログ作成エラー:", err);
      setSubmitError(t("practiceLog.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    router.push(`/teams/${teamId}?tab=practices`);
  };

  // OCR結果をフォームに反映
  const handleOcrApply = (ocrMenus: PracticeMenu[]) => {
    // 既存メニューが1件でデフォルト値のままの場合は上書き
    let isDefault = false;
    if (menus.length === 1) {
      const m = menus[0];
      isDefault =
        m.style === "Fr" &&
        m.swimCategory === "Swim" &&
        m.distance === 100 &&
        m.reps === 4 &&
        m.sets === 1 &&
        m.circleMin === 1 &&
        m.circleSec === 30 &&
        m.note === "" &&
        m.tags.length === 0 &&
        m.times.length === 0;
    }
    if (isDefault) {
      setMenus(ocrMenus);
    } else {
      // 既存メニューがある場合は確認ダイアログ
      setPendingOcrMenus(ocrMenus);
      setShowOverwriteConfirm(true);
    }
    setShowOcrModal(false);
  };

  // メンバーをフォーマット（TeamTimeInputModal用） - useMemoで参照を安定させる
  const teamMembersForModal = useMemo(
    () =>
      members.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        users: m.users,
      })),
    [members],
  );

  // モーダルに渡すpropsをメモ化（参照が毎回変わるとuseEffectがtimesをリセットしてしまう）
  const currentMenu = useMemo(
    () => menus.find((menu) => menu.id === currentMenuId),
    [menus, currentMenuId],
  );
  const modalTeamMembers = useMemo(
    () => teamMembersForModal.filter((m) => currentMenu?.targetUserIds.includes(m.user_id)),
    [teamMembersForModal, currentMenu?.targetUserIds],
  );
  const modalInitialTimes = useMemo(() => currentMenu?.times || [], [currentMenu?.times]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* ヘッダー */}
        <div className="mb-6">
          <button
            onClick={handleBack}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            {t("practiceLog.backButton")}
          </button>

          <div className="bg-white rounded-lg shadow p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {isEditMode ? t("practiceLog.titleEdit") : t("practiceLog.titleAdd")}
            </h1>
            <p className="text-gray-600 mb-4">{t("practiceLog.subtitle")}</p>

            {/* 練習情報 */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 border-t pt-4">
              <div className="flex items-center gap-1">
                <CalendarDaysIcon className="h-4 w-4" />
                <span>
                  {(() => {
                    const dateLocale = locale === "ja" ? ja : enUS;
                    const datePattern = locale === "ja" ? "yyyy年M月d日(EEE)" : "MMM d, yyyy (EEE)";
                    const parsedDate = parseISO(practice.date + "T00:00:00");
                    return isValid(parsedDate) ? format(parsedDate, datePattern, { locale: dateLocale }) : "-";
                  })()}
                </span>
              </div>
              {practice.place && (
                <div className="flex items-center gap-1">
                  <MapPinIcon className="h-4 w-4" />
                  <span>{practice.place}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 記録表印刷 & 画像スキャンボタン */}
        <div className="flex justify-end gap-2 -mt-2 mb-4">
          <Button type="button" variant="outline" onClick={() => openTimesheetPrintWindow()}>
            <PrinterIcon className="h-4 w-4 mr-2" />
            {t("practiceLog.printButton")}
          </Button>
          <Button
            type="button"
            onClick={() => setShowOcrModal(true)}
            data-testid="team-practice-log-ocr-scan-button"
            className="bg-linear-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-md hover:shadow-lg transition-all"
          >
            <SparklesIcon className="h-4 w-4 mr-2" />
            {t("practiceLog.ocrButton")}
          </Button>
        </div>

        {/* エラー表示 */}
        {submitError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 whitespace-pre-line">{submitError}</p>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
            >
              {t("practiceLog.closeError")}
            </button>
          </div>
        )}

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {menus.map((menu, index) => (
            <div
              key={menu.id}
              className="bg-white rounded-lg shadow p-6"
              data-testid={`team-practice-log-menu-${index + 1}`}
            >
              {/* メニューヘッダー */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">{t("practiceLog.menuTitle", { index: index + 1 })}</h2>
                {menus.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMenu(menu.id)}
                    className="text-red-600 hover:text-red-800"
                    data-testid={`team-practice-log-remove-menu-${index + 1}`}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* メニュー設定 */}
              {/* 1行目：種目 */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* 種目① */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("practiceLog.style1Label")}</label>
                  <div className="relative">
                    <select
                      value={menu.style}
                      onChange={(e) => updateMenu(menu.id, "style", e.target.value)}
                      className="w-full pl-3 pr-10 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                      data-testid={`team-practice-log-style-${index + 1}`}
                    >
                      {SWIM_STYLES.map((style) => (
                        <option key={style.value} value={style.value}>
                          {style.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon className="h-4 w-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                {/* 種目② */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("practiceLog.style2Label")}</label>
                  <div className="relative">
                    <select
                      value={menu.swimCategory}
                      onChange={(e) =>
                        updateMenu(
                          menu.id,
                          "swimCategory",
                          e.target.value as "Swim" | "Pull" | "Kick",
                        )
                      }
                      className="w-full pl-3 pr-10 py-2 bg-white border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                      data-testid={`team-practice-log-swim-category-${index + 1}`}
                    >
                      {SWIM_CATEGORIES.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDownIcon className="h-4 w-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* 2行目：距離、本数、セット数、サークル */}
              <div className="grid grid-cols-5 gap-4 mb-4">
                {/* 距離 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("practiceLog.distanceLabel")}</label>
                  <input
                    type="number"
                    value={menu.distance}
                    onChange={(e) =>
                      updateMenu(
                        menu.id,
                        "distance",
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="25"
                    step="25"
                    data-testid={`team-practice-log-distance-${index + 1}`}
                  />
                </div>

                {/* 本数 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("practiceLog.repsLabel")}</label>
                  <input
                    type="number"
                    value={menu.reps}
                    onChange={(e) =>
                      updateMenu(
                        menu.id,
                        "reps",
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    data-testid={`team-practice-log-reps-${index + 1}`}
                  />
                </div>

                {/* セット数 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("practiceLog.setsLabel")}</label>
                  <input
                    type="number"
                    value={menu.sets}
                    onChange={(e) =>
                      updateMenu(
                        menu.id,
                        "sets",
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    data-testid={`team-practice-log-sets-${index + 1}`}
                  />
                </div>

                {/* サークル(分) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("practiceLog.circleMinLabel")}
                  </label>
                  <input
                    type="number"
                    value={menu.circleMin}
                    onChange={(e) =>
                      updateMenu(
                        menu.id,
                        "circleMin",
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    data-testid={`team-practice-log-circle-min-${index + 1}`}
                  />
                </div>

                {/* サークル(秒) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("practiceLog.circleSecLabel")}
                  </label>
                  <input
                    type="number"
                    value={menu.circleSec}
                    onChange={(e) =>
                      updateMenu(
                        menu.id,
                        "circleSec",
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    max="59"
                    data-testid={`team-practice-log-circle-sec-${index + 1}`}
                  />
                </div>
              </div>

              {/* 対象ユーザー */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("practiceLog.participantsSection")}</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentMenuIdForUserSelect(menu.id);
                      setTempSelectedUserIds(menu.targetUserIds);
                      setShowUserSelectModal(true);
                    }}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid={`team-practice-log-select-users-${index + 1}`}
                  >
                    <UserGroupIcon className="h-4 w-4 mr-2" />
                    {t("practiceLog.selectUsersButton")}
                  </button>
                  <span className="text-sm text-gray-600">{t("practiceLog.selectedCount", { count: menu.targetUserIds.length })}</span>
                </div>
                {/* 選択されたユーザーの表示 */}
                {menu.targetUserIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {menu.targetUserIds.slice(0, 5).map((userId) => {
                      const member = members.find((m) => m.user_id === userId);
                      return member ? (
                        <span
                          key={userId}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {member.users.name}
                        </span>
                      ) : null;
                    })}
                    {menu.targetUserIds.length > 5 && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        {t("practiceLog.morePeopleCount", { count: menu.targetUserIds.length - 5 })}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 動画アップロード（対象ユーザーごと） */}
              {menu.targetUserIds.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t("practiceLog.videoLabel")}</label>
                  <div className="flex flex-wrap gap-2">
                    {menu.targetUserIds.map((userId) => {
                      const hasVideo = !!(menu.videoFiles?.[userId]);
                      return (
                        <button
                          key={userId}
                          type="button"
                          onClick={() => setVideoUploadModal({ menuId: menu.id, memberId: userId })}
                          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                            hasVideo
                              ? "border-green-500 bg-green-50 text-green-700"
                              : "border-gray-300 bg-white text-gray-600 hover:border-blue-400"
                          }`}
                        >
                          {getMemberName(userId)}: {hasVideo ? t("practiceLog.videoHas") : t("practiceLog.videoSelect")}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* タグ */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t("practiceLog.tagLabel")}</label>
                <TagInput
                  selectedTags={menu.tags}
                  availableTags={availableTags}
                  onTagsChange={(tags) => updateMenu(menu.id, "tags", tags)}
                  onAvailableTagsUpdate={setAvailableTags}
                />
              </div>

              {/* メモ */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("practiceLog.memoLabel")}</label>
                <textarea
                  value={menu.note}
                  onChange={(e) => updateMenu(menu.id, "note", e.target.value)}
                  placeholder={t("practiceLog.memoPlaceholder")}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid={`team-practice-log-note-${index + 1}`}
                />
              </div>

              {/* タイム入力ボタン */}
              <div className="flex items-center justify-between border-t pt-4">
                <div className="text-sm text-gray-600">
                  {t("practiceLog.timeInputSummary", {
                    sets: menu.sets || 0,
                    reps: menu.reps || 0,
                    total: (Number(menu.sets) || 0) * (Number(menu.reps) || 0),
                  })}
                  <br />
                  <span className="text-xs text-gray-500">{t("practiceLog.timeInputOptional")}</span>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    setCurrentMenuId(menu.id);
                    setShowTimeModal(true);
                  }}
                  className="inline-flex items-center"
                  data-testid={`team-practice-log-time-button-${index + 1}`}
                >
                  <ClockIcon className="h-4 w-4 mr-2" />
                  {t("practiceLog.timeInputButton")}
                </Button>
              </div>

              {/* 各人のタイム表示 */}
              {menu.times && menu.times.length > 0 && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">{t("practiceLog.recordedTimesTitle")}</h3>
                  <div className="space-y-3">
                    {menu.times.map((memberTime: TeamTimeEntry) => {
                      const member = members.find((m) => m.id === memberTime.memberId);
                      if (!member || !memberTime.times || memberTime.times.length === 0)
                        return null;

                      const validTimes = memberTime.times.filter((t) => t.time > 0);
                      if (validTimes.length === 0) return null;

                      return (
                        <div key={memberTime.memberId} className="bg-gray-50 p-3 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">
                              {member.users?.name || "Unknown User"}
                            </span>
                            <span className="text-xs text-gray-500">
                              {t("practiceLog.recordedCount", { count: validTimes.length })}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-xs">
                            {validTimes.map((timeEntry, idx: number) => (
                              <div key={idx} className="bg-white p-2 rounded border text-center">
                                <div className="text-gray-500">
                                  {t("practiceLog.setRepLabel", { set: timeEntry.setNumber, rep: timeEntry.repNumber })}
                                </div>
                                <div className="font-mono text-gray-800">
                                  {timeEntry.displayValue || formatTime(timeEntry.time)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* メニュー追加ボタン */}
          <Button
            type="button"
            onClick={addMenu}
            variant="outline"
            className="w-full"
            data-testid="team-practice-log-add-menu-button"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            {t("practiceLog.addMenuButton")}
          </Button>

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3 pt-6">
            <Button
              type="button"
              onClick={handleBack}
              variant="secondary"
              data-testid="team-practice-log-cancel-button"
            >
              {t("practiceLog.cancelButton")}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="team-practice-log-submit-button"
            >
              {saving ? t("practiceLog.saving") : t("practiceLog.saveButton")}
            </Button>
          </div>
        </form>
      </div>

      {/* チームタイム入力モーダル */}
      {currentMenuId && (
        <TeamTimeInputModal
          isOpen={showTimeModal}
          onClose={() => {
            setShowTimeModal(false);
            setCurrentMenuId(null);
          }}
          onSubmit={(times: TeamTimeEntry[]) => handleTimeSave(currentMenuId, times)}
          setCount={currentMenu?.sets || 1}
          repCount={currentMenu?.reps || 1}
          teamMembers={modalTeamMembers}
          menuNumber={menus.findIndex((m) => m.id === currentMenuId) + 1}
          initialTimes={modalInitialTimes}
        />
      )}

      {/* ユーザー選択モーダル */}
      {showUserSelectModal && currentMenuIdForUserSelect && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/40 transition-opacity"
              onClick={() => setShowUserSelectModal(false)}
            />
            <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 max-w-lg w-full max-h-[80vh] flex flex-col">
              {/* モーダルヘッダー */}
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">{t("practiceLog.userSelectModalTitle")}</h3>
                <button
                  type="button"
                  onClick={() => setShowUserSelectModal(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* 一括選択ボタン */}
              <div className="flex gap-2 p-4 border-b bg-gray-50">
                <button
                  type="button"
                  onClick={() => setTempSelectedUserIds(members.map((m) => m.user_id))}
                  className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
                >
                  {t("practiceLog.selectAllButton")}
                </button>
                <button
                  type="button"
                  onClick={() => setTempSelectedUserIds(presentUserIds)}
                  className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded transition-colors"
                  disabled={presentUserIds.length === 0}
                >
                  {t("practiceLog.selectPresentButton", { count: presentUserIds.length })}
                </button>
                <button
                  type="button"
                  onClick={() => setTempSelectedUserIds([])}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                >
                  {t("practiceLog.deselectButton")}
                </button>
              </div>

              {/* メンバーリスト */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-2">
                  {members.map((member) => {
                    const isSelected = tempSelectedUserIds.includes(member.user_id);
                    const isPresent = presentUserIds.includes(member.user_id);

                    return (
                      <label
                        key={member.id}
                        className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTempSelectedUserIds((prev) => [...prev, member.user_id]);
                            } else {
                              setTempSelectedUserIds((prev) =>
                                prev.filter((id) => id !== member.user_id),
                              );
                            }
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 flex-1 text-sm font-medium text-gray-900">
                          {member.users.name}
                        </span>
                        {isPresent && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            <CheckIcon className="h-3 w-3 mr-1" />
                            {t("practiceLog.attendingBadge")}
                          </span>
                        )}
                        {member.role === "admin" && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            {t("practiceLog.adminBadge")}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* モーダルフッター */}
              <div className="flex items-center justify-between p-4 border-t bg-gray-50">
                <span className="text-sm text-gray-600">{t("practiceLog.selectedCount", { count: tempSelectedUserIds.length })}</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowUserSelectModal(false)}
                  >
                    {t("practiceLog.cancelButton")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      updateMenu(currentMenuIdForUserSelect, "targetUserIds", tempSelectedUserIds);
                      setShowUserSelectModal(false);
                      setCurrentMenuIdForUserSelect(null);
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {t("practiceLog.confirmButton")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OCRスキャンモーダル */}
      {showOcrModal && (
        <OcrScanModal
          isOpen={showOcrModal}
          onClose={() => setShowOcrModal(false)}
          onApply={handleOcrApply}
          members={members}
          presentUserIds={presentUserIds}
        />
      )}

      {/* 動画アップロードモーダル */}
      {videoUploadModal && (
        <TeamVideoUploader
          targetUserId={videoUploadModal.memberId}
          targetUserName={getMemberName(videoUploadModal.memberId)}
          onVideoReady={(file, thumbnail) =>
            handleVideoReady(videoUploadModal.menuId, videoUploadModal.memberId, file, thumbnail)
          }
          onCancel={() => setVideoUploadModal(null)}
        />
      )}

      {/* OCR上書き確認ダイアログ */}
      <ConfirmDialog
        isOpen={showOverwriteConfirm}
        onConfirm={() => {
          if (pendingOcrMenus) setMenus(pendingOcrMenus);
          setShowOverwriteConfirm(false);
          setPendingOcrMenus(null);
        }}
        onCancel={() => {
          setShowOverwriteConfirm(false);
          setPendingOcrMenus(null);
        }}
        onTertiary={() => {
          if (pendingOcrMenus) setMenus((prev) => [...prev, ...pendingOcrMenus]);
          setShowOverwriteConfirm(false);
          setPendingOcrMenus(null);
        }}
        title={t("practiceLog.overwriteConfirm.title")}
        message={t("practiceLog.overwriteConfirm.message")}
        confirmLabel={t("practiceLog.overwriteConfirm.confirmLabel")}
        cancelLabel={t("practiceLog.overwriteConfirm.cancelLabel")}
        tertiaryLabel={t("practiceLog.overwriteConfirm.tertiaryLabel")}
        variant="info"
      />
    </div>
  );
}
