'use client'

import React, { useState, useMemo } from 'react'
import { useAuth } from '@/contexts'
import { TeamBulkRegisterAPI, BulkRegisterInput } from '@apps/shared/api/teams/bulkRegister'
import { downloadPracticeExcelTemplate, parsePracticeExcelFile, type ParsedPracticeData } from '@/utils/practiceExcel'
import { downloadCompetitionExcelTemplate, parseCompetitionExcelFile, type ParsedCompetitionData } from '@/utils/competitionExcel'
import {
  ArrowDownTrayIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  TrophyIcon
} from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

export interface TeamBulkRegisterProps {
  teamId: string
  isAdmin?: boolean
}

// パース結果の共通型
type ParsedData = {
  type: 'practice'
  data: ParsedPracticeData
} | {
  type: 'competition'
  data: ParsedCompetitionData
}

export default function TeamBulkRegister({ teamId, isAdmin = false }: TeamBulkRegisterProps) {
  const { supabase } = useAuth()
  const [selectedPracticeYear, setSelectedPracticeYear] = useState<number>(new Date().getFullYear())
  const [selectedCompetitionYear, setSelectedCompetitionYear] = useState<number>(new Date().getFullYear())
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [registerResult, setRegisterResult] = useState<{
    practicesCreated: number
    competitionsCreated: number
    errors: string[]
  } | null>(null)

  const bulkRegisterAPI = useMemo(() => {
    if (!supabase) return null
    return new TeamBulkRegisterAPI(supabase)
  }, [supabase])

  // 管理者以外はアクセス不可
  if (!isAdmin) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          一括登録
        </h2>
        <div className="text-center py-8">
          <p className="text-gray-600">
            一括登録機能を使用するには管理者権限が必要です。
          </p>
        </div>
      </div>
    )
  }

  const handleDownloadPracticeTemplate = async () => {
    try {
      setLoading(true)
      await downloadPracticeExcelTemplate(selectedPracticeYear)
      setError(null)
    } catch (err) {
      setError('練習テンプレートのダウンロードに失敗しました')
      console.error('テンプレートダウンロードエラー:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadCompetitionTemplate = async () => {
    try {
      setLoading(true)
      await downloadCompetitionExcelTemplate(selectedCompetitionYear)
      setError(null)
    } catch (err) {
      setError('大会テンプレートのダウンロードに失敗しました')
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
      // ファイル名で練習か大会かを判別
      const fileName = file.name.toLowerCase()
      
      if (fileName.includes('練習') || fileName.includes('practice')) {
        // 練習ファイルとしてパース
        const data = await parsePracticeExcelFile(file)
        setParsedData({ type: 'practice', data })
        
        if (data.errors.length > 0) {
          setError(`${data.errors.length}件のエラーが見つかりました。プレビューを確認してください。`)
        }
      } else if (fileName.includes('大会') || fileName.includes('competition')) {
        // 大会ファイルとしてパース
        const data = await parseCompetitionExcelFile(file)
        setParsedData({ type: 'competition', data })
        
        if (data.errors.length > 0) {
          setError(`${data.errors.length}件のエラーが見つかりました。プレビューを確認してください。`)
        }
      } else {
        // 自動判別：両方試してみる
        try {
          const practiceData = await parsePracticeExcelFile(file)
          if (practiceData.practices.length > 0) {
            setParsedData({ type: 'practice', data: practiceData })
            if (practiceData.errors.length > 0) {
              setError(`${practiceData.errors.length}件のエラーが見つかりました。プレビューを確認してください。`)
            }
            return
          }
        } catch {
          // 練習パースに失敗
        }
        
        try {
          const competitionData = await parseCompetitionExcelFile(file)
          if (competitionData.competitions.length > 0) {
            setParsedData({ type: 'competition', data: competitionData })
            if (competitionData.errors.length > 0) {
              setError(`${competitionData.errors.length}件のエラーが見つかりました。プレビューを確認してください。`)
            }
            return
          }
        } catch {
          // 大会パースに失敗
        }
        
        setError('ファイルの形式を判別できませんでした。「練習一括登録」または「大会一括登録」のテンプレートを使用してください。')
        setParsedData(null)
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
    if (!parsedData || !bulkRegisterAPI) return

    const totalItems = parsedData.type === 'practice' 
      ? parsedData.data.practices.length 
      : parsedData.data.competitions.length

    if (totalItems === 0) {
      setError('登録するデータがありません')
      return
    }

    const errors = parsedData.type === 'practice' 
      ? parsedData.data.errors 
      : parsedData.data.errors

    if (errors.length > 0) {
      const confirmed = window.confirm(
        `${errors.length}件のエラーがありますが、エラーのないデータのみ登録しますか？`
      )
      if (!confirmed) return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)
    setRegisterResult(null)

    try {
      // 登録データを構築
      const input: BulkRegisterInput = {
        practices: parsedData.type === 'practice' ? parsedData.data.practices : [],
        competitions: parsedData.type === 'competition' ? parsedData.data.competitions : []
      }

      const result = await bulkRegisterAPI.bulkRegister(teamId, input)

      setRegisterResult({
        practicesCreated: result.practicesCreated,
        competitionsCreated: result.competitionsCreated,
        errors: result.errors
      })

      if (result.success) {
        const message = parsedData.type === 'practice'
          ? `練習 ${result.practicesCreated}件の登録が完了しました`
          : `大会 ${result.competitionsCreated}件の登録が完了しました`
        setSuccess(message)
        // ファイル選択をリセット
        setSelectedFile(null)
        setParsedData(null)
      } else {
        setError(`一部の登録に失敗しました: ${result.errors.join(', ')}`)
      }
    } catch (err) {
      setError('一括登録に失敗しました')
      console.error('一括登録エラー:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        スケジュール一括登録
      </h2>

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

      {/* テンプレートダウンロード */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Excelテンプレートのダウンロード
        </h3>
        
        {/* 練習・大会テンプレート（横並び） */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 練習テンプレート */}
          <div className="p-4 bg-white rounded-lg border border-gray-200">
            <div className="flex items-center mb-3">
              <ClockIcon className="h-5 w-5 text-green-600 mr-2" />
              <h4 className="text-md font-medium text-gray-800">練習一括登録</h4>
            </div>
            <div className="flex items-center space-x-2 mb-3">
              <select
                id="year-select-practice"
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
                id="year-select-competition"
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

      {/* ファイルアップロード */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          ファイルをインポート
        </h3>
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
        <p className="mt-2 text-sm text-gray-500">
          上記テンプレートからファイルを作成し、アップロードしてください
        </p>
        {loading && (
          <p className="mt-2 text-sm text-gray-600">
            ファイルを読み込んでいます...
          </p>
        )}
      </div>

      {/* プレビュー */}
      {parsedData && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            プレビュー
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({parsedData.type === 'practice' ? '練習' : '大会'}データ)
            </span>
          </h3>

          {/* エラー一覧 */}
          {((parsedData.type === 'practice' && parsedData.data.errors.length > 0) ||
            (parsedData.type === 'competition' && parsedData.data.errors.length > 0)) && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start">
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
                <div className="ml-3 flex-1">
                  <h4 className="text-sm font-medium text-yellow-800 mb-2">
                    エラー ({parsedData.type === 'practice' ? parsedData.data.errors.length : parsedData.data.errors.length}件)
                  </h4>
                  <div className="max-h-40 overflow-y-auto">
                    <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                      {(parsedData.type === 'practice' ? parsedData.data.errors : parsedData.data.errors).slice(0, 20).map((err, index) => (
                        <li key={index}>
                          {err.sheet}シート {err.row}行目: {err.message}
                        </li>
                      ))}
                      {(parsedData.type === 'practice' ? parsedData.data.errors : parsedData.data.errors).length > 20 && (
                        <li className="text-yellow-600">
                          他 {(parsedData.type === 'practice' ? parsedData.data.errors : parsedData.data.errors).length - 20}件のエラーがあります
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
                            {practice.place}
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
                            {competition.title}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {competition.place}
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
            {((parsedData.type === 'practice' && parsedData.data.practices.length > 0) || 
              (parsedData.type === 'competition' && parsedData.data.competitions.length > 0)) && (
              <div className="pt-4 border-t border-gray-200">
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
                    `${parsedData.type === 'practice' ? '練習' : '大会'}を一括登録`
                  )}
                </button>
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
            {registerResult.practicesCreated > 0 && (
              <li>練習: {registerResult.practicesCreated}件登録</li>
            )}
            {registerResult.competitionsCreated > 0 && (
              <li>大会: {registerResult.competitionsCreated}件登録</li>
            )}
            {registerResult.errors.length > 0 && (
              <li className="text-red-700">
                エラー: {registerResult.errors.join(', ')}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
