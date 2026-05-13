"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { PencilIcon, TrashIcon, UsersIcon } from "@heroicons/react/24/outline";
import type { TeamGroupWithCount } from "../hooks/useTeamGroups";

interface GroupCardProps {
  group: TeamGroupWithCount;
  onClick: (group: TeamGroupWithCount) => void;
  onEdit: (group: TeamGroupWithCount) => void;
  onDelete: (group: TeamGroupWithCount) => void;
  onManageMembers: (group: TeamGroupWithCount) => void;
}

export const GroupCard: React.FC<GroupCardProps> = ({
  group,
  onClick,
  onEdit,
  onDelete,
  onManageMembers,
}) => {
  const t = useTranslations("teamsAdmin");
  return (
    <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
      <button
        type="button"
        onClick={() => onClick(group)}
        className="flex-1 min-w-0 text-left"
        aria-label={t("groupCard.viewMembersAriaLabel", { name: group.name })}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{group.name}</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 bg-gray-100 rounded-full">
            <UsersIcon className="h-3 w-3" />
            {group.member_count}
          </span>
        </div>
      </button>
      <div className="flex items-center gap-1 ml-2 shrink-0">
        <button
          type="button"
          onClick={() => onManageMembers(group)}
          className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
          title={t("groupCard.manageAriaLabel", { name: group.name })}
          aria-label={t("groupCard.manageAriaLabel", { name: group.name })}
        >
          <UsersIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onEdit(group)}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
          title={t("groupCard.editAriaLabel", { name: group.name })}
          aria-label={t("groupCard.editAriaLabel", { name: group.name })}
        >
          <PencilIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(group)}
          className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
          title={t("groupCard.deleteAriaLabel", { name: group.name })}
          aria-label={t("groupCard.deleteAriaLabel", { name: group.name })}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
