'use client'

import { UpdatePasswordForm, AuthGuard } from '@/components/auth'

export default function UpdatePasswordPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              パスワード変更
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              新しいパスワードを設定してください
            </p>
          </div>
          
          <UpdatePasswordForm />
        </div>
      </div>
    </AuthGuard>
  )
}
