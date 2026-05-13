import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SubscriptionHydrator } from "@/components/auth/SubscriptionHydrator";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { type Locale, routing, stripLocale } from "@/i18n/routing";
import {
  getServerSubscription,
  getServerUser,
  getServerUserProfile,
} from "@/lib/supabase-server-auth";

export default async function AuthenticatedGroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = routing.locales.includes(rawLocale as Locale)
    ? (rawLocale as Locale)
    : routing.defaultLocale;

  // サーバー側で user + subscription を取得
  // Middleware が未認証ユーザーを /{locale}/login にリダイレクト済みのため、
  // ここに到達する時点でユーザーは認証済み
  const user = await getServerUser();

  if (!user) {
    redirect(`/${locale}/login`);
  }

  // オンボーディング未完了ユーザーを /{locale}/onboarding にリダイレクト
  // middleware が x-current-path ヘッダーでパスを渡している (locale プレフィックスを除去して判定)
  const headersList = await headers();
  const currentPath = headersList.get("x-current-path") ?? "";
  const normalizedPath = stripLocale(currentPath);
  const isOnboardingPath = normalizedPath.startsWith("/onboarding");

  if (!isOnboardingPath) {
    const profile = await getServerUserProfile(user.id);
    if (!profile || !profile.onboarding_completed) {
      redirect(`/${locale}/onboarding`);
    }
  }

  const subscription = await getServerSubscription(user.id);

  return (
    <SubscriptionHydrator userId={user.id} subscription={subscription}>
      <DashboardLayout>{children}</DashboardLayout>
    </SubscriptionHydrator>
  );
}
