import { ArrowRightIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { SITE_URL } from "@/lib/constants";
import { safeJsonLd } from "@/lib/seo";

const COMPARISON_ROWS: {
  labelKey:
    | "rowPractice"
    | "rowCompetition"
    | "rowBestTime"
    | "rowTeam"
    | "rowGoals"
    | "rowSplitTime"
    | "rowPracticeTime"
    | "rowImageUpload"
    | "rowScanner"
    | "rowTimer";
  free: boolean | "valueLimitedSplit" | "valueLimitedPractice";
  premium: boolean | "valueUnlimited";
}[] = [
  { labelKey: "rowPractice", free: true, premium: true },
  { labelKey: "rowCompetition", free: true, premium: true },
  { labelKey: "rowBestTime", free: true, premium: true },
  { labelKey: "rowTeam", free: true, premium: true },
  { labelKey: "rowGoals", free: true, premium: true },
  { labelKey: "rowSplitTime", free: "valueLimitedSplit", premium: "valueUnlimited" },
  { labelKey: "rowPracticeTime", free: "valueLimitedPractice", premium: "valueUnlimited" },
  { labelKey: "rowImageUpload", free: false, premium: true },
  { labelKey: "rowScanner", free: true, premium: true },
  { labelKey: "rowTimer", free: true, premium: true },
];

const FAQ_KEYS = ["q1", "q2", "q3", "q4"] as const;
const FREE_FEATURE_KEYS = ["feature1", "feature2", "feature3", "feature4", "feature5"] as const;
const PREMIUM_FEATURE_KEYS = ["feature1", "feature2", "feature3", "feature4", "feature5"] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing" });

  return {
    title: t("metaTitle"),
    description: t("metaDesc"),
    alternates: { canonical: `${SITE_URL}/${locale}/pricing` },
    openGraph: {
      title: t("metaTitle"),
      description: t("ogDescription"),
      type: "website",
      locale: locale === "ja" ? "ja_JP" : "en_US",
    },
  };
}

function CellContent({
  value,
  comparisonValueLabel,
}: {
  value: boolean | string;
  comparisonValueLabel: (key: "valueLimitedSplit" | "valueLimitedPractice" | "valueUnlimited") => string;
}) {
  if (typeof value === "string") {
    const label =
      value === "valueLimitedSplit" || value === "valueLimitedPractice" || value === "valueUnlimited"
        ? comparisonValueLabel(value)
        : value;
    return <span className="text-sm text-gray-700">{label}</span>;
  }
  return value ? (
    <CheckIcon className="h-5 w-5 text-blue-600 shrink-0" />
  ) : (
    <XMarkIcon className="h-5 w-5 text-gray-300 shrink-0" />
  );
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Cloudflare Workers では request context 経由のロケール解決が不安定なため、
  // すべての getTranslations 呼び出しに { locale } を明示的に渡す。
  const t = await getTranslations({ locale, namespace: "pricing" });
  const tFree = await getTranslations({ locale, namespace: "pricing.freePlan" });
  const tPremium = await getTranslations({ locale, namespace: "pricing.premiumPlan" });
  const tComparison = await getTranslations({ locale, namespace: "pricing.comparison" });
  const tFaq = await getTranslations({ locale, namespace: "pricing.faq" });
  const tCta = await getTranslations({ locale, namespace: "pricing.cta" });
  const tNav = await getTranslations({ locale, namespace: "nav" });

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_KEYS.map((qKey, idx) => ({
      "@type": "Question",
      name: tFaq(qKey),
      acceptedAnswer: {
        "@type": "Answer",
        text: tFaq(`a${idx + 1}` as "a1" | "a2" | "a3" | "a4"),
      },
    })),
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: t("metaTitle"),
    description: t("ogDescription"),
    url: `${SITE_URL}/${locale}/pricing`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
      />

      <div className="min-h-screen bg-white">
        {/* ヘッダー */}
        <header className="bg-white border-b border-gray-200">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center space-x-2">
                <span className="text-2xl font-bold text-gray-900">SwimHub</span>
              </Link>
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {tNav("login")}
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {tNav("signup")}
                </Link>
              </div>
            </div>
          </nav>
        </header>

        {/* ヒーロー */}
        <section className="py-16 sm:py-20 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              {t("title")}
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto whitespace-pre-line">
              {t("subtitle")}
            </p>
          </div>
        </section>

        {/* プランカード */}
        <section className="py-12 sm:py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
              {/* Free */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 flex flex-col shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{tFree("name")}</h2>
                <div className="mb-6">
                  <span className="text-5xl font-bold text-gray-900">¥0</span>
                  <span className="text-base text-gray-500 ml-1">{t("monthSuffix")}</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {FREE_FEATURE_KEYS.map((k) => (
                    <li key={k} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckIcon className="h-5 w-5 text-gray-400 shrink-0" />
                      {tFree(k)}
                    </li>
                  ))}
                  <li className="flex items-start gap-2 text-sm text-gray-400">
                    <XMarkIcon className="h-5 w-5 text-gray-300 shrink-0" />
                    {tFree("exclude1")}
                  </li>
                </ul>
                <Link
                  href="/signup"
                  className="w-full inline-flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  {tFree("startButton")}
                </Link>
              </div>

              {/* Premium */}
              <div className="bg-white rounded-2xl border-2 border-blue-600 p-6 sm:p-8 flex flex-col shadow-sm relative">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-600 text-white whitespace-nowrap">
                  {tPremium("trialBadge")}
                </span>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{tPremium("name")}</h2>
                <div className="mb-1">
                  <span className="text-5xl font-bold text-gray-900">¥500</span>
                  <span className="text-base text-gray-500 ml-1">{t("monthSuffix")}</span>
                </div>
                <p className="text-sm text-gray-500 mb-6">
                  {tPremium("annualNote")}
                  <span className="inline-flex items-center ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    {tPremium("annualSaving")}
                  </span>
                </p>
                <ul className="space-y-3 mb-8 flex-1">
                  {PREMIUM_FEATURE_KEYS.map((k) => (
                    <li key={k} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckIcon className="h-5 w-5 text-blue-600 shrink-0" />
                      {tPremium(k)}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className="w-full inline-flex items-center justify-center px-4 py-3 border border-transparent rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  {tPremium("startButton")}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 比較表 */}
        <section className="py-12 sm:py-16 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-8">
              {tComparison("title")}
            </h2>

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[400px]">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left py-4 px-4 sm:px-6 text-sm font-semibold text-gray-900">
                        {tComparison("featureColumn")}
                      </th>
                      <th className="text-center py-4 px-4 sm:px-6 text-sm font-semibold text-gray-900">
                        {tFree("name")}
                      </th>
                      <th className="text-center py-4 px-4 sm:px-6 text-sm font-semibold text-blue-600">
                        {tPremium("name")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {COMPARISON_ROWS.map((row) => (
                      <tr key={row.labelKey} className="hover:bg-gray-50/50">
                        <td className="py-4 px-4 sm:px-6 text-sm font-medium text-gray-900">
                          {tComparison(row.labelKey)}
                        </td>
                        <td className="py-4 px-4 sm:px-6 text-center">
                          <span className="inline-flex justify-center">
                            <CellContent value={row.free} comparisonValueLabel={tComparison} />
                          </span>
                        </td>
                        <td className="py-4 px-4 sm:px-6 text-center">
                          <span className="inline-flex justify-center">
                            <CellContent value={row.premium} comparisonValueLabel={tComparison} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-12 sm:py-16">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-8">
              {tFaq("title")}
            </h2>

            <div className="space-y-6">
              {FAQ_KEYS.map((qKey, idx) => {
                const aKey = `a${idx + 1}` as "a1" | "a2" | "a3" | "a4";
                return (
                  <div key={qKey} className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-base font-semibold text-gray-900 mb-2">{tFaq(qKey)}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{tFaq(aKey)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-20 bg-blue-600">
          <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">{tCta("title")}</h2>
            <p className="text-base text-blue-100 mb-8">{tCta("subtitle")}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center bg-white text-blue-600 hover:bg-blue-50 px-8 py-3 rounded-lg text-base font-semibold transition-colors shadow-lg"
              >
                {tNav("signup")}
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center border-2 border-white text-white hover:bg-white hover:text-blue-600 px-8 py-3 rounded-lg text-base font-semibold transition-colors"
              >
                {tNav("login")}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
