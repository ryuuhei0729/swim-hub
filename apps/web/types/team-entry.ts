import type { Style } from '@apps/shared/types'

// TeamEntrySectionで使用するための大会型
// 共有Competition型とは別に定義（entry_statusなど独自フィールドを持つ）
export interface EntryCompetition {
  id: string
  title: string
  date: string
  place: string | null
  pool_type: number
  entry_status: 'before' | 'open' | 'closed'
  note: string | null
}

export interface UserEntry {
  id: string
  user_id: string
  style_id: number
  entry_time: number | null
  note: string | null
  created_at: string
  style: Style | null
}

export interface EntryFormData {
  styleId: string
  entryTime: string
  note: string
  editingEntryId: string | null
}

export interface EntryFormErrors {
  entryTime?: string
}

// コンポーネントProps
export interface TeamEntrySectionProps {
  teamId: string
  isAdmin: boolean
}

export interface CompetitionCardProps {
  competition: EntryCompetition
  entries: UserEntry[]
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

export interface EntryListProps {
  entries: UserEntry[]
  onEdit: (entry: UserEntry) => void
  onDelete: (entryId: string) => void
  submitting: boolean
}

export interface EntryItemProps {
  entry: UserEntry
  onEdit: () => void
  onDelete: () => void
  submitting: boolean
}

export interface EntryFormProps {
  formData: EntryFormData
  errors: EntryFormErrors
  styles: Style[]
  submitting: boolean
  onUpdateForm: (updates: Partial<EntryFormData>) => void
  onSubmit: () => void
  onCancelEdit: () => void
}
