'use client'

import React from 'react'
import { useAuth } from '@/contexts'
import { useBulkRegister } from '@/hooks/useBulkRegister'
import { TemplateDownload } from '@/components/bulk-register/TemplateDownload'
import { FileUpload } from '@/components/bulk-register/FileUpload'
import { DataPreview } from '@/components/bulk-register/DataPreview'
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

export interface TeamBulkRegisterProps {
  teamId: string
  isAdmin?: boolean
}

export default function TeamBulkRegister({ teamId, isAdmin = false }: TeamBulkRegisterProps) {
  const { supabase } = useAuth()
  const {
    selectedFile,
    parsedData,
    loading,
    error,
    success,
    registerResult,
    handleFileSelect,
    handleBulkRegister,
    setLoading,
    setError
  } = useBulkRegister(supabase, teamId)

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
      <TemplateDownload
        loading={loading}
        onLoadingChange={setLoading}
        onError={setError}
      />

      {/* ファイルアップロード */}
      <FileUpload
        selectedFile={selectedFile}
        loading={loading}
        onFileSelect={handleFileSelect}
      />

      {/* プレビュー */}
      {parsedData && (
        <DataPreview
          parsedData={parsedData}
          loading={loading}
          onRegister={handleBulkRegister}
        />
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
