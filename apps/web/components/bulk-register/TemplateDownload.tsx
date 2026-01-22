import React, { useState } from 'react'
import { ArrowDownTrayIcon, ClockIcon, TrophyIcon } from '@heroicons/react/24/outline'
import { downloadPracticeExcelTemplate } from '@/utils/practiceExcel'
import { downloadCompetitionExcelTemplate } from '@/utils/competitionExcel'

interface TemplateDownloadProps {
  loading: boolean
  onLoadingChange: (loading: boolean) => void
  onError: (error: string) => void
}

export function TemplateDownload({ loading, onLoadingChange, onError }: TemplateDownloadProps) {
  const [selectedPracticeYear, setSelectedPracticeYear] = useState<number>(new Date().getFullYear())
  const [selectedCompetitionYear, setSelectedCompetitionYear] = useState<number>(new Date().getFullYear())

  const handleDownloadPracticeTemplate = async () => {
    try {
      onLoadingChange(true)
      await downloadPracticeExcelTemplate(selectedPracticeYear)
      onError('')
    } catch (err) {
      onError('練習テンプレートのダウンロードに失敗しました')
      console.error('テンプレートダウンロードエラー:', err)
    } finally {
      onLoadingChange(false)
    }
  }

  const handleDownloadCompetitionTemplate = async () => {
    try {
      onLoadingChange(true)
      await downloadCompetitionExcelTemplate(selectedCompetitionYear)
      onError('')
    } catch (err) {
      onError('大会テンプレートのダウンロードに失敗しました')
      console.error('テンプレートダウンロードエラー:', err)
    } finally {
      onLoadingChange(false)
    }
  }

  return (
    <div className="mb-6 p-4 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Excelテンプレートのダウンロード
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 練習テンプレート */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center mb-3">
            <ClockIcon className="h-5 w-5 text-green-600 mr-2" />
            <h4 className="text-md font-medium text-gray-800">練習一括登録</h4>
          </div>
          <div className="flex items-center space-x-2 mb-3">
            <select
              value={selectedPracticeYear}
              onChange={(e) => setSelectedPracticeYear(Number(e.target.value))}
              className="w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
            >
              <option value={2025}>2025年</option>
              <option value={2026}>2026年</option>
              <option value={2027}>2027年</option>
            </select>
            <button
              onClick={handleDownloadPracticeTemplate}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
              ダウンロード
            </button>
          </div>
          <p className="text-xs text-gray-500">
            列: 日付 | 曜日 | 場所 | 備考
          </p>
        </div>

        {/* 大会テンプレート */}
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center mb-3">
            <TrophyIcon className="h-5 w-5 text-blue-600 mr-2" />
            <h4 className="text-md font-medium text-gray-800">大会一括登録</h4>
          </div>
          <div className="flex items-center space-x-2 mb-3">
            <select
              value={selectedCompetitionYear}
              onChange={(e) => setSelectedCompetitionYear(Number(e.target.value))}
              className="w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value={2025}>2025年</option>
              <option value={2026}>2026年</option>
              <option value={2027}>2027年</option>
            </select>
            <button
              onClick={handleDownloadCompetitionTemplate}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
              ダウンロード
            </button>
          </div>
          <p className="text-xs text-gray-500">
            列: 開始日 | 終了日 | 大会名 | 場所 | プール種別 | 備考
          </p>
        </div>
      </div>
    </div>
  )
}
