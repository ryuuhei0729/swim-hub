import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ログイン | SwimHub',
  description: 'SwimHubにログインして記録管理を始めましょう',
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
