'use client'

import { useEffect } from 'react'

interface UseUnsavedChangesWarningOptions {
  isOpen: boolean
  hasUnsavedChanges: boolean
  isSubmitted: boolean
}

/**
 * 未保存の変更がある場合にブラウザの離脱警告を表示するフック
 */
export const useUnsavedChangesWarning = ({
  isOpen,
  hasUnsavedChanges,
  isSubmitted,
}: UseUnsavedChangesWarningOptions): void => {
  useEffect(() => {
    if (!isOpen || !hasUnsavedChanges || isSubmitted) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    const handlePopState = () => {
      if (hasUnsavedChanges && !isSubmitted) {
        const confirmed = window.confirm(
          '入力内容が保存されていません。このまま戻りますか？'
        )
        if (!confirmed) {
          window.history.pushState(null, '', window.location.href)
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.history.pushState(null, '', window.location.href)
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isOpen, hasUnsavedChanges, isSubmitted])
}

export default useUnsavedChangesWarning
