import React from 'react'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { ParsedData } from '@/types/bulk-register'

interface DataPreviewProps {
  parsedData: ParsedData
  loading: boolean
  onRegister: () => void
}

export function DataPreview({ parsedData, loading, onRegister }: DataPreviewProps) {
  const errors = parsedData.type === 'practice' ? parsedData.data.errors : parsedData.data.errors
  const hasItems = parsedData.type === 'practice'
    ? parsedData.data.practices.length > 0
    : parsedData.data.competitions.length > 0

  return (
    <div className="mb-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        プレビュー
        <span className="ml-2 text-sm font-normal text-gray-500">
          ({parsedData.type === 'practice' ? '練習' : '大会'}データ)
        </span>
      </h3>

      {/* エラー一覧 */}
      {errors.length > 0 && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
            <div className="ml-3 flex-1">
              <h4 className="text-sm font-medium text-yellow-800 mb-2">
                エラー ({errors.length}件)
              </h4>
              <div className="max-h-40 overflow-y-auto">
                <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                  {errors.slice(0, 20).map((err, index) => (
                    <li key={index}>
                      {err.sheet}シート {err.row}行目: {err.message}
                    </li>
                  ))}
                  {errors.length > 20 && (
                    <li className="text-yellow-600">
                      他 {errors.length - 20}件のエラーがあります
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 登録予定データ */}
      <div className="space-y-4">
        {/* 練習データ */}
        {parsedData.type === 'practice' && parsedData.data.practices.length > 0 && (
          <div>
            <h4 className="text-md font-medium text-gray-800 mb-2">
              練習 ({parsedData.data.practices.length}件)
            </h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      日付
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      タイトル
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      場所
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      備考
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {parsedData.data.practices.slice(0, 10).map((practice, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {format(new Date(practice.date), 'yyyy年MM月dd日', { locale: ja })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {practice.title || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {practice.place || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {practice.note || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedData.data.practices.length > 10 && (
                <p className="mt-2 text-sm text-gray-600">
                  他 {parsedData.data.practices.length - 10}件の練習データがあります
                </p>
              )}
            </div>
          </div>
        )}

        {/* 大会データ */}
        {parsedData.type === 'competition' && parsedData.data.competitions.length > 0 && (
          <div>
            <h4 className="text-md font-medium text-gray-800 mb-2">
              大会 ({parsedData.data.competitions.length}件)
            </h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      開始日
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      終了日
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      大会名
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      場所
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      プール種別
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      備考
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {parsedData.data.competitions.slice(0, 10).map((competition, index) => (
                    <tr key={index}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {format(new Date(competition.date), 'yyyy年MM月dd日', { locale: ja })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {competition.end_date
                          ? format(new Date(competition.end_date), 'yyyy年MM月dd日', { locale: ja })
                          : '-'
                        }
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {competition.title || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {competition.place || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {competition.pool_type === 0 ? '25m' : '50m'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {competition.note || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedData.data.competitions.length > 10 && (
                <p className="mt-2 text-sm text-gray-600">
                  他 {parsedData.data.competitions.length - 10}件の大会データがあります
                </p>
              )}
            </div>
          </div>
        )}

        {/* 登録ボタン */}
        {hasItems && (
          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={onRegister}
              disabled={loading}
              className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  登録中...
                </>
              ) : (
                `${parsedData.type === 'practice' ? '練習' : '大会'}を一括登録`
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
