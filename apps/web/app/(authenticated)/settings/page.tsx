import React, { Suspense } from 'react'
import SettingsClient from './_client/SettingsClient'

/**
 * 設定ページ（Server Component）
 */
export default async function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 sm:space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/6 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            </div>
          </div>
        </div>
      }
    >
      <SettingsClient />
    </Suspense>
  )
}
