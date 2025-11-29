'use client'

import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts'
import { RecordAPI } from '@apps/shared/api/records'
import { 
  downloadBestTimeTemplate, 
  parseBestTimeExcel, 
  formatTimeFromSeconds,
  type ParsedBestTimeData 
} from '@/utils/bestTimeExcel'
import {
  ArrowDownTrayIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline'

export default function BulkBestTimeClient() {
  const router = useRouter()
  const { supabase } = useAuth()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedBestTimeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [registerResult, setRegisterResult] = useState<{
    created: number
    errors: string[]
  } | null>(null)

  const recordAPI = useMemo(() => {
    if (!supabase) return null
    return new RecordAPI(supabase)
  }, [supabase])

  const handleDownloadTemplate = async () => {
    try {
      setLoading(true)
      setError(null)
      await downloadBestTimeTemplate()
    } catch (err) {
      setError('テンプレートのダウンロードに失敗しました')
      console.error('テンプレートダウンロードエラー:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Excelファイルかチェック
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Excelファイル（.xlsx または .xls）を選択してください')
      return
    }

    setSelectedFile(file)
    setError(null)
    setSuccess(null)
    setRegisterResult(null)
    setLoading(true)

    try {
      const data = await parseBestTimeExcel(file)
      setParsedData(data)
      
      if (data.errors.length > 0) {
        setError(`${data.errors.length}件のエラーが見つかりました。プレビューを確認してください。`)
      }
    } catch (err) {
      setError('ファイルの読み込みに失敗しました')
      console.error('ファイル読み込みエラー:', err)
      setParsedData(null)
    } finally {
      setLoading(false)
    }
  }

  const handleBulkRegister = async () => {
    if (!parsedData || !recordAPI) return

    if (parsedData.records.length === 0) {
      setError('登録するデータがありません')
      return
    }

    if (parsedData.errors.length > 0) {
      const confirmed = window.confirm(
        `${parsedData.errors.length}件のエラーがありますが、エラーのないデータのみ登録しますか？`
      )
      if (!confirmed) return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)
    setRegisterResult(null)

    try {
      const result = await recordAPI.createBulkRecords(
        parsedData.records.map(record => ({
          style_id: record.styleId,
          time: record.time,
          is_relaying: record.isRelaying,
          note: record.note
        }))
      )

      setRegisterResult(result)

      if (result.errors.length === 0) {
        setSuccess(`${result.created}件の記録を登録しました`)
        // ファイル選択をリセット
        setSelectedFile(null)
        setParsedData(null)
      } else {
        setError(`一部の登録に失敗しました`)
      }
    } catch (err) {
      setError('一括登録に失敗しました')
      console.error('一括登録エラー:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    router.push('/mypage')
  }

  // プレビューデータをシート別に整理
  const groupedRecords = useMemo(() => {
    if (!parsedData) return null
    
    const groups = {
      shortCourse: parsedData.records.filter(r => r.poolType === 0 && !r.isRelaying),
      shortRelay: parsedData.records.filter(r => r.poolType === 0 && r.isRelaying),
      longCourse: parsedData.records.filter(r => r.poolType === 1 && !r.isRelaying),
      longRelay: parsedData.records.filter(r => r.poolType === 1 && r.isRelaying),
    }
    return groups
  }, [parsedData])

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBack}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="戻る"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              ベストタイム一括入力
            </h1>
            <p className="text-gray-600 mt-1">
              Excelファイルを使用して、過去のベストタイムを一括で登録できます
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        {/* エラー表示 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400 shrink-0" />
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* 成功表示 */}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex">
              <CheckCircleIcon className="h-5 w-5 text-green-400 shrink-0" />
              <div className="ml-3">
                <p className="text-sm text-green-800">{success}</p>
              </div>
            </div>
          </div>
        )}

        {/* ステップ1: テンプレートダウンロード */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-sm mr-2">1</span>
            テンプレートをダウンロード
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            まず、Excelテンプレートをダウンロードしてください。テンプレートには以下の4シートが含まれます：
          </p>
          <ul className="text-sm text-gray-600 mb-4 ml-4 list-disc">
            <li><strong>短水路</strong>：25mプールでの記録（通常）</li>
            <li><strong>短水路（引き継ぎ有）</strong>：25mプールでのリレーイング記録</li>
            <li><strong>長水路</strong>：50mプールでの記録（通常）</li>
            <li><strong>長水路（引き継ぎ有）</strong>：50mプールでのリレーイング記録</li>
          </ul>
          <button
            onClick={handleDownloadTemplate}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
            テンプレートをダウンロード
          </button>
        </div>

        {/* ステップ2: ファイルアップロード */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-sm mr-2">2</span>
            記録を入力してアップロード
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            テンプレートに記録を入力し、ファイルをアップロードしてください。
            <br />
            タイム形式：<code className="bg-gray-100 px-1 py-0.5 rounded">1:23.45</code>（分:秒.00）または <code className="bg-gray-100 px-1 py-0.5 rounded">23.45</code>（秒.00）
          </p>
          <div className="flex items-center space-x-4">
            <label
              htmlFor="file-upload"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
            >
              <DocumentArrowUpIcon className="h-5 w-5 mr-2" />
              ファイルを選択
            </label>
            <input
              id="file-upload"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
              disabled={loading}
            />
            {selectedFile && (
              <span className="text-sm text-gray-700">
                {selectedFile.name}
              </span>
            )}
          </div>
          {loading && !parsedData && (
            <p className="mt-2 text-sm text-gray-600">
              ファイルを読み込んでいます...
            </p>
          )}
        </div>

        {/* プレビュー */}
        {parsedData && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-sm mr-2">3</span>
              プレビュー
            </h2>

            {/* エラー一覧 */}
            {parsedData.errors.length > 0 && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start">
                  <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                  <div className="ml-3 flex-1">
                    <h4 className="text-sm font-medium text-yellow-800 mb-2">
                      エラー ({parsedData.errors.length}件)
                    </h4>
                    <div className="max-h-40 overflow-y-auto">
                      <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                        {parsedData.errors.slice(0, 20).map((err, index) => (
                          <li key={index}>
                            {err.sheet}シート {err.row}行目: {err.message}
                          </li>
                        ))}
                        {parsedData.errors.length > 20 && (
                          <li className="text-yellow-600">
                            他 {parsedData.errors.length - 20}件のエラーがあります
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 登録予定データ */}
            <div className="space-y-6">
              {/* 短水路 */}
              {groupedRecords?.shortCourse && groupedRecords.shortCourse.length > 0 && (
                <RecordPreviewTable 
                  title="短水路" 
                  records={groupedRecords.shortCourse} 
                />
              )}

              {/* 短水路（引き継ぎ有） */}
              {groupedRecords?.shortRelay && groupedRecords.shortRelay.length > 0 && (
                <RecordPreviewTable 
                  title="短水路（引き継ぎ有）" 
                  records={groupedRecords.shortRelay} 
                />
              )}

              {/* 長水路 */}
              {groupedRecords?.longCourse && groupedRecords.longCourse.length > 0 && (
                <RecordPreviewTable 
                  title="長水路" 
                  records={groupedRecords.longCourse} 
                />
              )}

              {/* 長水路（引き継ぎ有） */}
              {groupedRecords?.longRelay && groupedRecords.longRelay.length > 0 && (
                <RecordPreviewTable 
                  title="長水路（引き継ぎ有）" 
                  records={groupedRecords.longRelay} 
                />
              )}

              {parsedData.records.length === 0 && (
                <p className="text-gray-600 text-center py-4">
                  登録可能なデータがありません
                </p>
              )}

              {/* 登録ボタン */}
              {parsedData.records.length > 0 && (
                <div className="pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-600">
                      合計 <strong>{parsedData.records.length}件</strong> の記録を登録します
                    </p>
                    <button
                      onClick={handleBulkRegister}
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
                        '一括登録する'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 登録結果 */}
        {registerResult && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="text-md font-medium text-blue-800 mb-2">
              登録結果
            </h4>
            <ul className="list-disc list-inside text-sm text-blue-700 space-y-1">
              <li>登録件数: {registerResult.created}件</li>
              {registerResult.errors.length > 0 && (
                <li className="text-red-700">
                  エラー: {registerResult.errors.join(', ')}
                </li>
              )}
            </ul>
            {registerResult.errors.length === 0 && (
              <button
                onClick={handleBack}
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                マイページで確認する
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// プレビューテーブルコンポーネント
interface RecordPreviewTableProps {
  title: string
  records: ParsedBestTimeData['records']
}

function RecordPreviewTable({ title, records }: RecordPreviewTableProps) {
  return (
    <div>
      <h4 className="text-md font-medium text-gray-800 mb-2">
        {title} ({records.length}件)
      </h4>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                種目
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                タイム
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                備考
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {records.slice(0, 10).map((record, index) => (
              <tr key={index}>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {record.styleName}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                  {formatTimeFromSeconds(record.time)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {record.note || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {records.length > 10 && (
          <p className="mt-2 text-sm text-gray-600">
            他 {records.length - 10}件のデータがあります
          </p>
        )}
      </div>
    </div>
  )
}

