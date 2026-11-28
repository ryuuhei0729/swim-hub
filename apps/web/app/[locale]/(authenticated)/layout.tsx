import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { GuardianAppOnlyNotice } from "@/components/auth/GuardianAppOnlyNotice";
import { SubscriptionHydrator } from "@/components/auth/SubscriptionHydrator";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { type Locale, routing, stripLocale } from "@/i18n/routing";
import { isGuardianUser } from "@/lib/guardian-guard";
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

  // プロフィール (オンボーディング判定用) とサブスクリプションと保護者かどうかは
  // 互いに依存しないので、順番に待たずに同時に取得する。オンボーディング未完了で
  // リダイレクトする場合はサブスクリプションの取得が無駄になるが、それは初回の一度だけ。
  const [profile, subscription, isGuardian] = await Promise.all([
    isOnboardingPath ? Promise.resolve(null) : getServerUserProfile(user.id),
    getServerSubscription(user.id),
    resolveIsGuardian(user.id),
  ]);

  // 保護者アカウント (閲覧専用・アプリ専用) には、どのページでも中身を一切出さず
  // 「アプリでご利用ください」だけを出す。children (各ページ) は描画しない。
  // オンボーディング (プロフィールの保存) も書き込みなので、その判定より先に行う。
  if (isGuardian) {
    return <GuardianAppOnlyNotice />;
  }

  if (!isOnboardingPath && (!profile || !profile.onboarding_completed)) {
    redirect(`/${locale}/onboarding`);
  }

  return (
    <SubscriptionHydrator userId={user.id} subscription={subscription}>
      <DashboardLayout>{children}</DashboardLayout>
    </SubscriptionHydrator>
  );
}

/**
 * 保護者アカウントかどうか。判定に失敗したときは通常の画面を出す
 * (保護者の書き込みは DB のトリガと API ルートで拒否されるので、ここは表示の出し分けだけ)。
 */
async function resolveIsGuardian(userId: string): Promise<boolean> {
  try {
    return await isGuardianUser(userId);
  } catch (error) {
    console.error("保護者アカウントの判定に失敗しました:", error);
    return false;
  }
}
