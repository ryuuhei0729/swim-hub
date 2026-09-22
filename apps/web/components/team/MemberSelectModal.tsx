"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import BaseModal from "@/components/ui/BaseModal";
import { cn } from "@/utils/cn";
import { useMemberGroupSort } from "./member-management/hooks/useMemberGroupSort";
import { MemberGroupSorter } from "./member-management/components/MemberGroupSorter";

export interface MemberSelectOption {
  user_id: string;
  role: string;
  name: string;
  // optional: 呼び出し元によっては is_swimmer を select していない場合がある。
  // undefined は「泳者」として扱う (apps/shared/utils/swimmerFilter.ts と同じ判定)。
  is_swimmer?: boolean;
  // optional: 呼び出し元によっては gender を select していない場合がある (PM裁定 W10)。
  // グルーピング (useMemberGroupSort の性別カテゴリ) にのみ使う。undefined のときは
  // 0 で埋めず undefined のまま扱う (0 は「未設定」と「男性」の両方に読めるため)。
  // 欠損時はグルーピングを諦めてフラット表示にフォールバックする。
  gender?: number;
}

interface MemberSelectExtraAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface MemberSelectModalProps {
  isOpen: boolean;
  teamId: string;
  supabase: SupabaseClient;
  /** 選択候補メンバー。退会済み (is_active=false) メンバーは呼び出し側で除外して渡すこと */
  members: MemberSelectOption[];
  /** 初期選択中の user_id 配列 */
  selectedUserIds: string[];
  /** 決定時に選択された user_id 配列を返す（重複 user_id は含まない） */
  onConfirm: (userIds: string[]) => void;
  /** モーダルを閉じる（呼び出し元の選択状態は確定しない） */
  onCancel: () => void;
  title?: string;
  /**
   * PracticeLogClient 専用の「出席者のみ」ボタンを収容する任意枠 (PM裁定 W6)。
   * 他2画面 (EntriesClient/RecordClient) は渡さない。
   */
  extraAction?: MemberSelectExtraAction;
  /**
   * PracticeLogClient 専用の「出席バッジ」を収容する任意枠 (PM裁定 W12)。
   * チップ内にアクセシブルネームへ影響しない (aria-hidden) 装飾バッジとして
   * 差し込まれる。null/undefined を返すメンバーには何も表示されない。
   * 他2画面 (EntriesClient/RecordClient) は渡さない。
   */
  renderMemberBadge?: (member: MemberSelectOption) => React.ReactNode;
}

// useMemberGroupSort.groupMembers に渡す最小構造 (W9)。MemberSelectOption は
// gender を flat に持つが、groupMembers 側のロジックは変更禁止 (m.users?.gender を参照する)
// ため、呼び出し側であるここで nest させて橋渡しする。
interface GroupSortInput {
  user_id: string;
  users: { gender?: number };
}

interface MemberSelectSection {
  label: string;
  members: MemberSelectOption[];
}

/**
 * チームメンバー複数選択モーダル（web汎用基盤）。
 * RecordClient/PracticeLogClient のインライン実装 (checkbox形式) を統合し、
 * mobile 版 (apps/mobile/components/teams/MemberSelectModal.tsx) と同じ
 * 選択チップ + グルーピング + 単一の全選択トグルに置き換えたもの。
 */
export default function MemberSelectModal({
  isOpen,
  teamId,
  supabase,
  members,
  selectedUserIds,
  onConfirm,
  onCancel,
  title,
  extraAction,
  renderMemberBadge,
}: MemberSelectModalProps) {
  const t = useTranslations("teams");
  const tEntries = useTranslations("competition.entries");

  const [tempSelected, setTempSelected] = useState<string[]>(selectedUserIds);

  // モーダルが開かれるたびに（および呼び出し元の選択状態が変わるたびに）
  // 呼び出し元の選択状態に同期する
  useEffect(() => {
    if (isOpen) {
      setTempSelected(selectedUserIds);
    }
  }, [isOpen, selectedUserIds]);

  // 修正H: モーダルを一度も開いていない間は TeamGroupsAPI へのリクエストを
  // 発生させない (isOpen をそのまま enabled として渡す)
  const {
    categories,
    activeCategory,
    toggleCategory,
    groupMembers,
    getCategoryLabel,
  } = useMemberGroupSort(teamId, supabase, isOpen);

  const memberByUserId = useMemo(
    () => new Map(members.map((m) => [m.user_id, m] as const)),
    [members],
  );

  const groupSortInput: GroupSortInput[] = useMemo(
    () =>
      members.map((m) => ({ user_id: m.user_id, users: { gender: m.gender } })),
    [members],
  );

  const groupResult = groupMembers(groupSortInput);

  // W10: groupMembers の結果が空配列 (性別欠損等で男女どちらの分類にも入らない) かつ
  // members.length > 0 の場合は、グルーピングを諦めてフラット表示にフォールバックする。
  // (gender 欠損時にチップが無言で全消失するのを防ぐ)
  const isGroupingUsable = !!groupResult && groupResult.length > 0;

  const sections: MemberSelectSection[] = isGroupingUsable
    ? (groupResult ?? []).map((group) => ({
        label: group.groupName,
        members: group.members
          .map((m) => memberByUserId.get(m.user_id))
          .filter((m): m is MemberSelectOption => m != null),
      }))
    : [{ label: "", members }];

  const toggleMember = (userId: string) => {
    setTempSelected((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  // 全候補が選択済みかどうかの判定・グローバル全選択の対象は members (呼び出し元が
  // 渡した原配列) を基準にする。派生値であり独立 state では持たない (PM裁定 W11)。
  const isAllSelected =
    members.length > 0 &&
    members.every((m) => tempSelected.includes(m.user_id));

  const handleGlobalToggle = () => {
    setTempSelected(
      isAllSelected ? [] : Array.from(new Set(members.map((m) => m.user_id))),
    );
  };

  // グループ内のみを対象にし、他グループの選択状態は変えない
  const handleSectionToggle = (sectionMembers: MemberSelectOption[]) => {
    const ids = sectionMembers.map((m) => m.user_id);
    const isSectionAllSelected =
      ids.length > 0 && ids.every((id) => tempSelected.includes(id));
    setTempSelected((prev) => {
      if (isSectionAllSelected) {
        return prev.filter((id) => !ids.includes(id));
      }
      const merged = new Set(prev);
      ids.forEach((id) => merged.add(id));
      return Array.from(merged);
    });
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onCancel}
      title={title ?? t("record.memberSelectTitle")}
      size="md"
    >
      {/*
        修正E: BaseModal 自体は高さ制約を持たない (中身の量だけ縦に伸びる) ため、
        メンバーが多いと決定ボタンに到達するのにモーダル全体をスクロールする必要が
        あった (チップは checkbox 行より縦に嵩張るため顕著)。BaseModal.tsx 自体は
        共有コンポーネントで影響範囲が別途実測必要なため変更しない。代わりに
        MemberSelectModal 自身の children 側で高さを max-h-[70vh] に固定し、
        ヘッダー相当 (カテゴリ切替行 + 任意の extraAction) とフッター (件数 +
        キャンセル/決定) を flex-shrink-0 で常時表示に固定し、チップ一覧だけを
        flex-1 overflow-y-auto でスクロール領域にする (旧インライン実装の
        `max-h-[80vh] flex flex-col` と同じ考え方)
      */}
      <div className="flex max-h-[70vh] flex-col">
        {/* カテゴリ切替 + グローバル全選択トグル */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-gray-200">
          <div className="flex flex-wrap items-center gap-2">
            <MemberGroupSorter
              categories={categories}
              activeCategory={activeCategory}
              onToggle={toggleCategory}
              getCategoryLabel={getCategoryLabel}
            />
          </div>
          <button
            type="button"
            onClick={handleGlobalToggle}
            aria-pressed={isAllSelected}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-md border transition-colors",
              isAllSelected
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50",
            )}
          >
            {t("record.selectAllToggle")}
          </button>
        </div>

        {/* PracticeLogClient 専用「出席者のみ」ボタン (PM裁定 W6) */}
        {extraAction && (
          <div className="shrink-0 pb-3 mb-3 border-b border-gray-200">
            <button
              type="button"
              onClick={extraAction.onClick}
              disabled={extraAction.disabled}
              className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
            >
              {extraAction.label}
            </button>
          </div>
        )}

        {/* メンバーチップグリッド（グループ見出し + 折り返しグリッド）。
            このブロックだけがスクロールする */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {members.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              {tEntries("noMembersToSelect")}
            </p>
          ) : (
            <div className="space-y-4">
              {sections.map((section, index) => {
                const isSectionAllSelected =
                  section.members.length > 0 &&
                  section.members.every((m) =>
                    tempSelected.includes(m.user_id),
                  );
                return (
                  <div
                    key={section.label || `flat-${index}`}
                    data-testid={
                      section.label
                        ? `member-select-group-${section.label}`
                        : undefined
                    }
                    className="space-y-2"
                  >
                    {section.label && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-500">
                          {section.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleSectionToggle(section.members)}
                          aria-pressed={isSectionAllSelected}
                          aria-label={t("record.selectAllToggleGroup", {
                            group: section.label,
                          })}
                          className={cn(
                            "px-2 py-1 text-xs font-medium rounded-md border transition-colors",
                            isSectionAllSelected
                              ? "bg-blue-600 border-blue-600 text-white"
                              : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50",
                          )}
                        >
                          {t("record.selectAllToggle")}
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {section.members.map((member) => {
                        const isSelected = tempSelected.includes(
                          member.user_id,
                        );
                        const memberBadge = renderMemberBadge?.(member);
                        const isAdmin = member.role === "admin";
                        const adminDescId = isAdmin
                          ? `member-select-desc-admin-${member.user_id}`
                          : undefined;
                        const extraDescId = memberBadge
                          ? `member-select-desc-extra-${member.user_id}`
                          : undefined;
                        const describedBy =
                          [adminDescId, extraDescId]
                            .filter(Boolean)
                            .join(" ") || undefined;
                        return (
                          <React.Fragment key={member.user_id}>
                            <button
                              type="button"
                              onClick={() => toggleMember(member.user_id)}
                              aria-pressed={isSelected}
                              aria-describedby={describedBy}
                              className={cn(
                                "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                                isSelected
                                  ? "bg-blue-600 border-blue-600 text-white"
                                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50",
                              )}
                            >
                              <span className="truncate">{member.name}</span>
                              {isAdmin && (
                                // アクセシブルネームからは除外する (チップの accessible
                                // name はメンバー名のみに保つ)。視覚表示専用のバッジで、
                                // 読み上げ用の説明は下の sr-only 要素 (ボタン外) が別途
                                // 担う (修正G)
                                <span
                                  aria-hidden="true"
                                  className={cn(
                                    "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                                    isSelected
                                      ? "bg-white/25 text-white"
                                      : "bg-purple-100 text-purple-800",
                                  )}
                                >
                                  {t("record.adminBadge")}
                                </span>
                              )}
                              {memberBadge && (
                                // admin バッジと同じく視覚表示専用 (装飾)
                                <span aria-hidden="true" className="shrink-0">
                                  {memberBadge}
                                </span>
                              )}
                            </button>
                            {/*
                              修正G: 「aria-describedby の参照先が aria-hidden でも
                              説明としては算出対象から除外されない」という WAI-ARIA の
                              例外規定に依存すると、AT/ブラウザ実装差 (特に
                              VoiceOver+Safari) で届かないことがある。例外規定に頼らず、
                              aria-hidden を付けない専用の視覚的非表示要素 (sr-only) を
                              ボタンの外に用意して aria-describedby で参照する。
                              ボタンの外に置くことで accessible name (メンバー名のみ) には
                              混入しない
                            */}
                            {isAdmin && (
                              <span id={adminDescId} className="sr-only">
                                {t("record.adminBadge")}
                              </span>
                            )}
                            {memberBadge && (
                              <span id={extraDescId} className="sr-only">
                                {memberBadge}
                              </span>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex shrink-0 items-center justify-between pt-4 mt-4 border-t border-gray-200">
          <span className="text-sm text-gray-600">
            {t("record.selectedMemberCount", { n: tempSelected.length })}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
            >
              {t("record.cancelButton")}
            </button>
            <button
              type="button"
              onClick={() => onConfirm(Array.from(new Set(tempSelected)))}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700"
            >
              {t("record.confirmSelection")}
            </button>
          </div>
        </div>
      </div>
    </BaseModal>
  );
}
