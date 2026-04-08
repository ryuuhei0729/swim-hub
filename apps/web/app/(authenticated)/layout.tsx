import { redirect } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { SubscriptionHydrator } from "@/components/auth/SubscriptionHydrator";
import { getServerUser, getServerSubscription } from "@/lib/supabase-server-auth";

export default async function AuthenticatedGroupLayout({ children }: { children: React.ReactNode }) {
  // サーバー側で user + subscription を取得
  // Middleware が未認証ユーザーを /login にリダイレクト済みのため、
  // ここに到達する時点でユーザーは認証済み
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const subscription = await getServerSubscription(user.id);

  return (
    <SubscriptionHydrator userId={user.id} subscription={subscription}>
      <DashboardLayout>{children}</DashboardLayout>
    </SubscriptionHydrator>
  );
}
