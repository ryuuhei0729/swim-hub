import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'パスワードリセット | SwimHub',
  description: 'SwimHubのパスワードをリセットします',
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
