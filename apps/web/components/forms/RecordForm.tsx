'use client'

/**
 * 後方互換性のためのre-export
 * 新しい実装は record/RecordForm.tsx にあります
 */
export { default } from './record/RecordForm'
export type {
  RecordFormProps,
  RecordFormData,
  RecordSet,
  SplitTimeInput,
  SwimStyle,
  EditData,
  EditRecord,
  EditSplitTime,
} from './record/types'
export { POOL_TYPES } from './record/types'
