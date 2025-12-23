'use client'

import { UpdatePasswordForm, AuthGuard } from '@/components/auth'

export default function UpdatePasswordPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-blue-50">
        <UpdatePasswordForm />
      </div>
    </AuthGuard>
  )
}
