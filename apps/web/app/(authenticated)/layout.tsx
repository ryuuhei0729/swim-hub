import { AuthGuard } from '@/components/auth'
import { DashboardLayout } from '@/components/layout'

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <DashboardLayout>
        {children}
      </DashboardLayout>
    </AuthGuard>
  )
}
