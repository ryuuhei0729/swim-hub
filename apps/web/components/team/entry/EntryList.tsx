import { memo } from 'react'
import { EntryItem } from './EntryItem'
import type { EntryListProps } from '@/types/team-entry'

function EntryListComponent({
  entries,
  onEdit,
  onDelete,
  submitting
}: EntryListProps) {
  if (entries.length === 0) return null

  return (
    <div className="mt-4 mb-4">
      <h4 className="text-sm font-semibold text-orange-900 mb-2">
        ✅ あなたのエントリー
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
  )
}

export const EntryList = memo(EntryListComponent)
