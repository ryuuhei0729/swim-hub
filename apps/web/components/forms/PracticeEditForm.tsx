import React, { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useMutation } from '@apollo/client/react'
import { UPDATE_PRACTICE } from '@/graphql/mutations'
import { GET_CALENDAR_DATA, GET_PRACTICES } from '@/graphql/queries'

interface PracticeEditFormProps {
  isOpen: boolean
  onClose: () => void
  practiceData: {
    id: string
    date: string
    place: string
    note: string
  }
  isLoading?: boolean
}

const PracticeEditForm: React.FC<PracticeEditFormProps> = ({
  isOpen,
  onClose,
  practiceData,
  isLoading = false
}) => {
  const [formData, setFormData] = useState({
    date: '',
    place: '',
    note: ''
  })

  const [updatePractice] = useMutation(UPDATE_PRACTICE, {
    refetchQueries: [
      {
        query: GET_CALENDAR_DATA,
        variables: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
      },
      {
        query: GET_PRACTICES,
        variables: {
          startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
        }
      }
    ],
    awaitRefetchQueries: true
  })

  // 編集データの初期化
  useEffect(() => {
    if (practiceData && isOpen) {
      setFormData({
        date: practiceData.date,
        place: practiceData.place,
        note: practiceData.note
      })
    }
  }, [practiceData, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await updatePractice({
        variables: {
          id: practiceData.id,
          input: {
            date: formData.date,
            place: formData.place,
            note: formData.note
          }
        }
      })
      onClose()
    } catch (error) {
      console.error('Practiceの更新に失敗しました:', error)
      alert('Practiceの更新に失敗しました。')
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">練習記録を編集</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              日付
            </label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => handleChange('date', e.target.value)}
              required
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              場所
            </label>
            <Input
              type="text"
              value={formData.place}
              onChange={(e) => handleChange('place', e.target.value)}
              placeholder="練習場所を入力"
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              メモ
            </label>
            <textarea
              value={formData.note}
              onChange={(e) => handleChange('note', e.target.value)}
              placeholder="練習メモを入力"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              disabled={isLoading}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? '更新中...' : '更新'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PracticeEditForm
