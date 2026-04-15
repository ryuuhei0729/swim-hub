import { redirect } from "next/navigation";
import { headers } from "next/headers";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { SubscriptionHydrator } from "@/components/auth/SubscriptionHydrator";
import { getServerUser, getServerSubscription, getServerUserProfile } from "@/lib/supabase-server-auth";

export default async function AuthenticatedGroupLayout({ children }: { children: React.ReactNode }) {
  // サーバー側で user + subscription を取得
  // Middleware が未認証ユーザーを /login にリダイレクト済みのため、
  // ここに到達する時点でユーザーは認証済み
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  // オンボーディング未完了ユーザーを /onboarding にリダイレクト
  // middleware が x-current-path ヘッダーでパスを渡している
  const headersList = await headers();
  const currentPath = headersList.get("x-current-path") ?? "";
  const isOnboardingPath = currentPath.startsWith("/onboarding");

  if (!isOnboardingPath) {
    const profile = await getServerUserProfile(user.id);
    if (!profile || !profile.onboarding_completed) {
      redirect("/onboarding");
    }
  }

  const subscription = await getServerSubscription(user.id);

  return (
    <SubscriptionHydrator userId={user.id} subscription={subscription}>
      <DashboardLayout>{children}</DashboardLayout>
    </SubscriptionHydrator>
  );
}
