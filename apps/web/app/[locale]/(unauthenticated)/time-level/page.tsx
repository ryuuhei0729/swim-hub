import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import React from "react";

import { BackButton } from "@/components/ui/BackButton";
import { SITE_URL } from "@/lib/constants";
import TimeLevelClient from "./_client/TimeLevelClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "timeLevel" });
  return {
    title: t("metaTitle"),
    description: t("metaDesc"),
    alternates: { canonical: `${SITE_URL}/${locale}/time-level` },
  };
}

export default async function TimeLevelPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "timeLevel" });

  return (
    <div className="min-h-screen bg-blue-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <BackButton />
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">{t("title")}</h1>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed">{t("description")}</p>
        </div>
        <TimeLevelClient />
      </div>
    </div>
  );
}
