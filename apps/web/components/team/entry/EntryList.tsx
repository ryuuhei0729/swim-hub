import { memo } from "react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { EntryItem } from "./EntryItem";
import type { EntryListProps } from "@/types/team-entry";

function EntryListComponent({ entries, onEdit, onDelete, submitting }: EntryListProps) {
  const t = useTranslations("teams");

  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-500 mt-2">{t("entryList.empty")}</p>
    );
  }

  return (
    <div className="mt-4 mb-4">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-orange-900 mb-2">
        <CheckCircleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t("entryList.userEntriesTitle")}
      </h4>
      <div className="space-y-2">
        {entries.map((entry) => (
          <EntryItem
            key={entry.id}
            entry={entry}
            onEdit={() => onEdit(entry)}
            onDelete={() => onDelete(entry.id)}
            submitting={submitting}
          />
        ))}
      </div>
    </div>
  );
}

export const EntryList = memo(EntryListComponent);
