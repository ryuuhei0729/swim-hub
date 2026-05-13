import { memo } from "react";
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { formatTimeBest } from "@/utils/formatters";
import type { EntryItemProps } from "@/types/team-entry";

function EntryItemComponent({ entry, onEdit, onDelete, submitting }: EntryItemProps) {
  const t = useTranslations("teams");

  return (
    <div className="flex items-center justify-between p-3 bg-orange-50 rounded-md border border-orange-100">
      <div className="flex-1">
        <p className="font-medium text-gray-900">{entry.style?.name_jp || t("competitionEntryModal.unknownStyle")}</p>
        {entry.entry_time && entry.entry_time > 0 && (
          <p className="text-sm text-gray-600">
            {t("entryItem.enteredLabel")}{" "}
            <span className="font-mono font-semibold">{formatTimeBest(entry.entry_time)}</span>
          </p>
        )}
        {entry.note && <p className="text-sm text-gray-500 mt-1">{entry.note}</p>}
      </div>
      <div className="flex items-center space-x-2 ml-4">
        <button
          onClick={onEdit}
          className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
          title={t("attendanceList.editButton")}
        >
          <PencilIcon className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          disabled={submitting}
          className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
          title={t("entryForm.deleteButton")}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export const EntryItem = memo(EntryItemComponent);
