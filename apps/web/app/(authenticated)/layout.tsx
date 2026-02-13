import { AuthGuard } from '@/components/auth'
import DashboardLayout from '@/components/layout/DashboardLayout'

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
