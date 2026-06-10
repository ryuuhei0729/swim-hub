import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.resetPassword" });
  return {
    title: `${t("title")} | SwimHub`,
    alternates: { canonical: `/${locale}/reset-password` },
  };
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
