'use client'

import { PasswordResetForm } from '@/components/auth'

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 to-indigo-100">
      <PasswordResetForm />
    </div>
  )
}
