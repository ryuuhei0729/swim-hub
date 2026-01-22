'use client'

/**
 * 後方互換性のためのre-export
 * 新しい実装は record-log/RecordLogForm.tsx にあります
 */
export { default } from './record-log/RecordLogForm'
export type {
  RecordLogFormProps,
  RecordLogFormData,
  RecordLogEditData,
  SplitTimeRow,
} from './record-log/types'
