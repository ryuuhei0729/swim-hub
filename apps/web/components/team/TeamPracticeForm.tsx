'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { TeamPracticesAPI } from '@apps/shared/api/teams/practices'
import { Button, Input } from '@/components/ui'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface TeamPracticeFormProps {
  isOpen: boolean
  onClose: () => void
  teamId: string
  onSuccess: () => void
}

export default function TeamPracticeForm({ 
  isOpen, 
  onClose, 
  teamId, 
  onSuccess 
}: TeamPracticeFormProps) {
  const { supabase } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0], // YYYY-MM-DD形式
    title: '',
    place: '',
    note: ''
  })

  // フォーカストラップ用のref
  const modalRef = useRef<HTMLDivElement>(null)
  const _firstFocusableRef = useRef<HTMLButtonElement>(null)
  const _lastFocusableRef = useRef<HTMLButtonElement>(null)

  const handleClose = useCallback(() => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      title: '',
      place: '',
      note: ''
    })
    setError(null)
    onClose()
  }, [onClose])

  // フォーカストラップ機能
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
        return
      }

      if (e.key === 'Tab') {
        const focusableElements = modalRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        
        if (!focusableElements || focusableElements.length === 0) return

        const firstElement = focusableElements[0] as HTMLElement
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            e.preventDefault()
            lastElement.focus()
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            e.preventDefault()
            firstElement.focus()
          }
        }
      }
    }

    // モーダルが開いた時に最初のフォーカス可能要素にフォーカス
    const firstFocusable = modalRef.current?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as HTMLElement
    
    if (firstFocusable) {
      firstFocusable.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.date) {
      setError('日付は必須です')
      return
    }

    try {
      setLoading(true)
      setError(null)
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証が必要です')

      const practicesAPI = new TeamPracticesAPI(supabase)
      const practiceInput: import('@apps/shared/types/database').PracticeInsert = {
        user_id: user.id,
        date: formData.date,
        title: formData.title || null,
        place: formData.place || null,
        note: formData.note || null,
        team_id: teamId
      }
      await practicesAPI.create(practiceInput)
      
      onSuccess()
      onClose()
      
      // フォームをリセット
      setFormData({
        date: new Date().toISOString().split('T')[0],
        title: '',
        place: '',
        note: ''
      })
    } catch (err) {
      console.error('チーム練習記録作成エラー:', err)
      setError(err instanceof Error ? err.message : 'チーム練習記録の作成に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" data-testid="team-practice-modal">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-black/40 transition-opacity z-[10]"
          onClick={handleClose}
          aria-hidden="true"
        />

        <div 
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className="relative z-[20] inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
          data-testid="team-practice-dialog"
        >
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 id="modal-title" className="text-lg leading-6 font-medium text-gray-900">
                チーム練習記録を追加
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
                disabled={loading}
                aria-label="モーダルを閉じる"
                data-testid="team-practice-close-button"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              チームの練習記録を作成します
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6" data-testid="team-practice-form">
            {/* エラー表示 */}
            {error && (
              <div className="rounded-md bg-red-50 p-4" role="alert" aria-live="polite" data-testid="team-practice-error">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      エラーが発生しました
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p id="practice-date-error">{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 練習日 */}
            <div>
              <label htmlFor="practice-date" className="block text-sm font-medium text-gray-700 mb-2">
                練習日 <span className="text-red-500">*</span>
              </label>
              <Input
                id="practice-date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                aria-describedby="practice-date-error"
                data-testid="team-practice-date"
              />
            </div>

            {/* 練習タイトル */}
            <div>
              <label htmlFor="practice-title" className="block text-sm font-medium text-gray-700 mb-2">
                練習タイトル
              </label>
              <Input
                id="practice-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例: 基礎練習、スプリント練習（空欄の場合は「チーム練習」と表示）"
                data-testid="team-practice-title"
              />
            </div>

            {/* 練習場所 */}
            <div>
              <label htmlFor="practice-place" className="block text-sm font-medium text-gray-700 mb-2">
                練習場所
              </label>
              <Input
                id="practice-place"
                type="text"
                value={formData.place}
                onChange={(e) => setFormData({ ...formData, place: e.target.value })}
                placeholder="例: 市営プール、学校プール"
                data-testid="team-practice-place"
              />
            </div>

            {/* メモ */}
            <div>
              <label htmlFor="practice-note" className="block text-sm font-medium text-gray-700 mb-2">
                メモ
              </label>
              <textarea
                id="practice-note"
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="練習内容や感想など"
                data-testid="team-practice-note"
              />
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Button
                type="button"
                onClick={handleClose}
                variant="secondary"
                disabled={loading}
                data-testid="team-practice-cancel-button"
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="team-practice-submit-button"
              >
                {loading ? '作成中...' : '作成'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
