import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'パスワード更新 | SwimHub',
  description: 'SwimHubのパスワードを更新します',
}

export default function UpdatePasswordLayout({ children }: { children: React.ReactNode }) {
  return children
}
