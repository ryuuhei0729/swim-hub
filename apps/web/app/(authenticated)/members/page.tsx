'use client'

import MembersList from '@/components/members/MembersList'

export default function MembersPage() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          メンバー管理
        </h1>
        <p className="text-gray-600">
          選手、コーチ、監督、マネージャーの情報を管理します。
        </p>
      </div>
      
      <MembersList />
    </div>
  )
}
