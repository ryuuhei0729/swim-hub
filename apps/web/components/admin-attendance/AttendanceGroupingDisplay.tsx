"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { AttendanceStatus, TeamAttendanceWithDetails } from "@swim-hub/shared/types";
import { TeamMember } from "@swim-hub/shared/utils/team";
import { useAttendanceGrouping } from "@swim-hub/shared/hooks/useAttendanceGrouping";
import { toUserFacingMessage } from "@swim-hub/shared/utils/userFacingError";
import type { MemberAnswerTarget } from "@/hooks/useMemberAnswerEditor";

interface AttendanceGroupingDisplayProps {
  attendanceData: TeamAttendanceWithDetails[];
  teamMembers: TeamMember[];
  /**
   * 管理者ビュー: メンバーの回答を代わりに変更する。指定したときだけ各メンバー
   * (自分以外) に「変更」を出す (mobile の AttendanceEventModal と同じ。swimhub-tasks #61)。
   * 失敗したら例外を投げる
   */
  onChangeMemberStatus?: (target: MemberAnswerTarget, status: AttendanceStatus) => Promise<void>;
  /** 自分には「変更」を出さない (自分の回答は出欠タブの一覧から) */
  currentUserId?: string;
}

const ANSWER_BUTTONS: ReadonlyArray<{
  status: AttendanceStatus;
  labelKey: "attendanceList.statusPresent" | "attendanceList.statusAbsent" | "attendanceList.statusOther";
  activeClass: string;
}> = [
  {
    status: "present",
    labelKey: "attendanceList.statusPresent",
    activeClass: "bg-green-100 text-green-800 border-green-500",
  },
  {
    status: "absent",
    labelKey: "attendanceList.statusAbsent",
    activeClass: "bg-red-100 text-red-800 border-red-500",
  },
  {
    status: "other",
    labelKey: "attendanceList.statusOther",
    activeClass: "bg-yellow-100 text-yellow-800 border-yellow-500",
  },
];

const GROUPS = [
  {
    key: "presentMembers",
    titleKey: "attendanceGrouping.present",
    titleClass: "text-green-800",
    boxClass: "bg-green-50",
    nameClass: "text-gray-900",
  },
  {
    key: "absentMembers",
    titleKey: "attendanceGrouping.absent",
    titleClass: "text-red-800",
    boxClass: "bg-red-50",
    nameClass: "text-gray-900",
  },
  {
    key: "otherMembers",
    titleKey: "attendanceGrouping.other",
    titleClass: "text-yellow-800",
    boxClass: "bg-yellow-50",
    nameClass: "text-gray-900",
  },
  {
    key: "unansweredMembers",
    titleKey: "attendanceGrouping.unanswered",
    titleClass: "text-gray-800",
    boxClass: "bg-gray-50",
    nameClass: "text-gray-600",
  },
] as const;

/**
 * 1 つの練習・大会の全員の出欠を 出席・欠席・その他・未回答 に分けて、備考と一緒に並べる
 * (利用者ビュー・管理者ビュー共通。mobile の AttendanceEventModal と同じく備考も出す。swimhub-tasks #75)。
 */
export function AttendanceGroupingDisplay({
  attendanceData,
  teamMembers,
  onChangeMemberStatus,
  currentUserId,
}: AttendanceGroupingDisplayProps) {
  // attendanceGrouping はロール中立な共有UI(一般メンバー向け閲覧とAdmin両方で使用)のため
  // ロール中立な "teams" 名前空間を参照する(旧 teamsAdmin 側の同名グループは削除済み)
  const t = useTranslations("teams");
  const tCommon = useTranslations("common");
  const grouping = useAttendanceGrouping(attendanceData, teamMembers);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // 各メンバーの出欠の行 (備考・行 ID・回答)。未回答の人も DB トリガーで作られた行を持つことがある
  const rowByUserId = useMemo(() => {
    const map = new Map<string, TeamAttendanceWithDetails>();
    for (const row of attendanceData) map.set(row.user_id, row);
    return map;
  }, [attendanceData]);

  const handleChange = async (userId: string, status: AttendanceStatus) => {
    if (!onChangeMemberStatus || savingUserId) return;
    const row = rowByUserId.get(userId);
    if (row?.status === status) {
      setEditingUserId(null);
      return;
    }
    setSavingUserId(userId);
    setEditError(null);
    try {
      await onChangeMemberStatus(
        { userId, attendanceId: row?.id || null, note: row?.note ?? null },
        status,
      );
      setEditingUserId(null);
    } catch (err) {
      console.error("メンバーの出欠の変更に失敗:", err);
      setEditError(toUserFacingMessage(err, t("mobile.attendanceSaveFailed")));
    } finally {
      setSavingUserId(null);
    }
  };

  const renderMember = (member: { id: string; name: string }, nameClass: string) => {
    const row = rowByUserId.get(member.id);
    const note = row?.note?.trim();
    const canEdit = !!onChangeMemberStatus && member.id !== currentUserId;
    const editing = editingUserId === member.id;
    const saving = savingUserId === member.id;
    return (
      <div key={member.id} data-testid={`attendance-member-${member.id}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className={`text-sm ${nameClass}`}>{member.name}</div>
            {note && (
              <p className="text-xs text-gray-500 whitespace-pre-wrap wrap-break-word">{note}</p>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setEditError(null);
                setEditingUserId(editing ? null : member.id);
              }}
              disabled={savingUserId !== null}
              aria-label={t("mobile.attendanceTab.editMemberAria", { name: member.name })}
              aria-expanded={editing}
              className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
              data-testid={`attendance-edit-member-${member.id}`}
            >
              {editing ? tCommon("close") : t("mobile.attendanceTab.editMember")}
            </button>
          )}
        </div>
        {editing && (
          <div
            className="mt-2 flex gap-2"
            role="group"
            aria-label={t("mobile.attendanceTab.editMemberAria", { name: member.name })}
          >
            {ANSWER_BUTTONS.map(({ status, labelKey, activeClass }) => {
              const active = row?.status === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => void handleChange(member.id, status)}
                  disabled={saving}
                  aria-pressed={active}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors disabled:opacity-50 ${
                    active ? activeClass : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                  data-testid={`attendance-edit-member-${member.id}-${status}`}
                >
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {editError && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700"
        >
          {editError}
        </div>
      )}
      {GROUPS.map(({ key, titleKey, titleClass, boxClass, nameClass }) => {
        const members = grouping[key];
        return (
          <div key={key}>
            <h3 className={`text-sm font-semibold mb-2 ${titleClass}`}>
              {t(titleKey, { count: members.length })}
            </h3>
            {members.length > 0 ? (
              <div className={`${boxClass} rounded-lg p-3 space-y-2`}>
                {members.map((member) => renderMember(member, nameClass))}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-500">
                {t("attendanceGrouping.none")}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
