import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'お問い合わせ | SwimHub',
  description: 'SwimHubへのお問い合わせはこちら',
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children
}
