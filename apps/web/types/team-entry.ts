import type { Style } from '@apps/shared/types'

export interface Competition {
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
