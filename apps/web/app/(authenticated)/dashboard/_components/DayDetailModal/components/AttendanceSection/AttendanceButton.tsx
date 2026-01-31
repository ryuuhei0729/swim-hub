'use client'

import { ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline'
import type { AttendanceButtonProps } from '../../types'

export function AttendanceButton({ onClick }: AttendanceButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors text-sm"
      title="出欠状況を確認"
    >
      <ClipboardDocumentCheckIcon className="h-4 w-4" />
      <span>出欠状況</span>
    </button>
  )
}
