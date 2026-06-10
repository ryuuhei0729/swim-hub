import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.updatePassword" });
  return {
    title: `${t("title")} | SwimHub`,
    alternates: { canonical: `/${locale}/update-password` },
  };
}

export default function UpdatePasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
