'use client'

/**
 * 後方互換性のためのre-export
 * 新しい実装は practice-log/PracticeLogForm.tsx にあります
 */
export { default } from './practice-log/PracticeLogForm'
export type {
  PracticeLogFormProps,
  PracticeLogSubmitData,
  PracticeLogEditData,
  PracticeMenu,
  Tag,
} from './practice-log/types'
export { SWIM_STYLES, SWIM_CATEGORIES } from './practice-log/types'
