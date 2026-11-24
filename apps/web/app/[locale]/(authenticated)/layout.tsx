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

  // プロフィール (オンボーディング判定用) とサブスクリプションは互いに依存しないので、
  // 順番に待たずに同時に取得する。オンボーディング未完了でリダイレクトする場合は
  // サブスクリプションの取得が無駄になるが、それは初回の一度だけ。
  const [profile, subscription] = await Promise.all([
    isOnboardingPath ? Promise.resolve(null) : getServerUserProfile(user.id),
    getServerSubscription(user.id),
  ]);

  if (!isOnboardingPath && (!profile || !profile.onboarding_completed)) {
    redirect(`/${locale}/onboarding`);
  }

  return (
    <SubscriptionHydrator userId={user.id} subscription={subscription}>
      <DashboardLayout>{children}</DashboardLayout>
    </SubscriptionHydrator>
  );
}
