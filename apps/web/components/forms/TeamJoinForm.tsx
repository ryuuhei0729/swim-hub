'use client'

import React, { useState } from 'react'

export interface TeamJoinFormProps {
  onSubmit: (inviteId: string) => Promise<void>
  isLoading?: boolean
  error?: string | null
}

export default function TeamJoinForm({ onSubmit, isLoading = false, error }: TeamJoinFormProps) {
  const [inviteId, setInviteId] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!inviteId.trim()) {
      return
    }

    await onSubmit(inviteId.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="inviteId" className="block text-sm font-medium text-gray-700 mb-2">
          招待コード
        </label>
        <input
          type="text"
          id="inviteId"
          value={inviteId}
          onChange={(e) => setInviteId(e.target.value)}
          placeholder="チームの招待コードを入力してください"
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          disabled={isLoading}
          required
        />
        <p className="mt-1 text-sm text-gray-500">
          チーム管理者から提供された招待コードを入力してください
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                エラーが発生しました
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-3">
        <button
          type="submit"
          disabled={isLoading || !inviteId.trim()}
          className="inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              参加中...
            </>
          ) : (
            'チームに参加'
          )}
        </button>
      </div>
    </form>
  )
}
