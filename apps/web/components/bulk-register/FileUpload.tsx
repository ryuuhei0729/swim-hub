import React from 'react'
import { DocumentArrowUpIcon } from '@heroicons/react/24/outline'

interface FileUploadProps {
  selectedFile: File | null
  loading: boolean
  onFileSelect: (file: File) => void
}

export function FileUpload({ selectedFile, loading, onFileSelect }: FileUploadProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onFileSelect(file)
    }
  }

  return (
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
          onChange={handleChange}
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
  )
}
