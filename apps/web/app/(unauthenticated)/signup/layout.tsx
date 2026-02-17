import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '無料登録 | SwimHub',
  description: 'SwimHubのアカウントを無料で作成。水泳記録の管理を今すぐ始められます',
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
