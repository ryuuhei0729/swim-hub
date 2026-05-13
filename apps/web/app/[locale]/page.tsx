// LP は localePrefix: 'always' 環境のため、locale-aware な Link を使う。
// `next/link` だと href="/signup" が middleware の 308 リダイレクトに飛ばされ
// 二重 round-trip になる。`@/i18n/navigation` の Link は現在の locale を保持する。
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import StaticFooter from "@/components/layout/StaticFooter";
import {
  ArrowRightIcon,
  SparklesIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  TagIcon,
  TrophyIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import ScrollNavButtons from "./_components/ScrollNavButtons";
import DeviceMockup from "./_components/DeviceMockup";
import { getTranslations } from "next-intl/server";

export default async function Home() {
  const tHero = await getTranslations("lp.hero");
  const tFeatures = await getTranslations("lp.features");
  const tPricing = await getTranslations("lp.pricing");
  const tCta = await getTranslations("lp.cta");
  const tFamily = await getTranslations("lp.family");
  const tNav = await getTranslations("nav");
  // LP の Free/Premium プランカードは pricing/page.tsx と同じ pricing.* namespace を共有。
  // (DRY 原則。個別ページとのキー二重定義を避ける)
  const tPricingPlan = await getTranslations("pricing");
  const tFree = await getTranslations("pricing.freePlan");
  const tPremium = await getTranslations("pricing.premiumPlan");

  return (
    <div className="min-h-screen bg-white">
      {/* 固定ヘッダーナビゲーション */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/60 backdrop-blur-sm shadow-sm">
        <nav className="relative max-w-7xl mx-auto px-2 sm:px-3 lg:px-4">
          <div className="flex items-center justify-between h-14 sm:h-20">
            {/* ロゴ */}
            <Link href="/" className="flex items-center space-x-2 sm:space-x-3">
              <Image
                src="/favicon.png"
                alt="SwimHub"
                width={64}
                height={64}
                className="w-9 h-9 sm:w-16 sm:h-16"
              />
              <span className="text-xl sm:text-3xl font-bold text-gray-900">SwimHub</span>
            </Link>

            <div className="flex items-center gap-2 sm:gap-4">
              <LanguageSwitcher />
              <ScrollNavButtons />
            </div>
          </div>
        </nav>
      </header>

      {/* ヒーローセクション（背景画像 + スマホモック） */}
      <section className="relative isolate overflow-hidden bg-gray-900 text-white pt-14 sm:pt-20">
        <Image
          src="/hero-section.png"
          alt="プールでの練習風景"
          fill
          className="object-cover opacity-70"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-black/30" />

        <div className="relative max-w-7xl mx-auto px-2 sm:px-3 lg:px-4 py-12 sm:py-16 lg:py-20">
          <div className="grid gap-8 md:gap-12 lg:grid-cols-2 items-center">
            {/* 左側: テキストコンテンツ */}
            <div className="space-y-4 sm:space-y-6 animate-fade-in text-center lg:text-left order-2 lg:order-1">
              <div className="inline-flex items-center gap-2 bg-white/10 text-blue-100 px-3 py-1 rounded-full text-base font-semibold tracking-wide">
                <SparklesIcon className="w-6 h-8" />
                {tHero("badge")}
              </div>

              <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
                <span className="text-cyan-400">{tHero("title1")}</span>
                <span className="block text-blue-100">{tHero("title2")}</span>
                <span className="block text-blue-100">{tHero("title3")}</span>
              </h1>

              <p className="text-base sm:text-xl md:text-xl text-blue-50 leading-relaxed max-w-2xl mx-auto lg:mx-0">
                {tHero("description")}
              </p>

              <div className="flex flex-row gap-2 sm:gap-3 justify-center lg:justify-start">
                <a
                  href="https://apps.apple.com/us/app/swimhub/id6756808731/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={tHero("appStoreLabel")}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center px-2 sm:px-5 py-2 sm:py-3 bg-black text-white rounded-xl border border-white/15 shadow-md hover:bg-zinc-800 active:scale-[0.98] transition-all duration-150"
                >
                  <svg
                    className="w-5 h-5 sm:w-6 sm:h-6 mr-1.5 sm:mr-2.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                  </svg>
                  <div className="text-left leading-tight">
                    <div className="text-[9px] sm:text-[10px] tracking-wide">Download on the</div>
                    <div className="text-sm sm:text-lg font-semibold -mt-0.5">App Store</div>
                  </div>
                </a>
                <button
                  disabled
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center px-2 sm:px-5 py-2 sm:py-3 bg-white/20 text-white rounded-lg backdrop-blur-sm cursor-not-allowed"
                >
                  <svg
                    className="w-5 h-5 sm:w-6 sm:h-6 mr-1.5 sm:mr-2"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
                  </svg>
                  <div className="text-left leading-tight">
                    <div className="text-[9px] sm:text-[15px] leading-none opacity-80">{tHero("comingSoon")}</div>
                    <div className="text-sm sm:text-base font-semibold">Google Play</div>
                  </div>
                </button>
              </div>

              <div className="flex flex-row gap-2 sm:gap-4 justify-center lg:justify-start">
                <Link
                  href="/signup"
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center px-3 sm:px-8 py-2 sm:py-3 text-sm sm:text-lg font-semibold text-blue-600 bg-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 hover-lift"
                >
                  {tNav("signup")}
                  <ArrowRightIcon className="ml-1 sm:ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                </Link>
                <Link
                  href="/login"
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center px-3 sm:px-8 py-2 sm:py-3 text-sm sm:text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-lg hover:bg-blue-700 transition-all duration-200 hover-lift"
                >
                  {tNav("login")}
                </Link>
              </div>
            </div>

            {/* 右側: デバイスモック */}
            <DeviceMockup />
          </div>
        </div>
      </section>

      {/* 練習のタイムを記録 */}
      <section id="practice" className="py-16 sm:py-20 bg-white scroll-mt-[100px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-lg sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4 flex items-center justify-center gap-3">
              <span className="inline-flex items-center justify-center px-4 py-1 rounded-full bg-blue-600 text-white text-xs sm:text-lg font-bold shrink-0">
                {tFeatures("feature1Badge")}
              </span>
              {tFeatures("feature1Title")}
            </h2>
            <p className="text-sm sm:text-lg text-gray-600 sm:whitespace-nowrap">
              {tFeatures("feature1Desc")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <ClipboardDocumentListIcon className="w-6 h-6 text-blue-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">
                {tFeatures("feature1Item1")}
              </h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <ClockIcon className="w-6 h-6 text-amber-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">{tFeatures("feature1Item2")}</h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                <TagIcon className="w-6 h-6 text-green-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">{tFeatures("feature1Item3")}</h4>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden shadow-2xl border border-gray-200">
            <Image
              src="/screenshots/lp-practice.png"
              alt={tFeatures("altPractice")}
              width={1600}
              height={500}
              className="w-full h-auto object-cover"
            />
          </div>
        </div>
      </section>

      {/* 大会のタイムを記録 */}
      <section id="competition" className="py-16 sm:py-20 bg-blue-50 scroll-mt-[100px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-lg sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4 flex items-center justify-center gap-3">
              <span className="inline-flex items-center justify-center px-4 py-1 rounded-full bg-blue-600 text-white text-xs sm:text-lg font-bold shrink-0">
                {tFeatures("feature2Badge")}
              </span>
              {tFeatures("feature2Title")}
            </h2>
            <p className="text-sm sm:text-lg text-gray-600 sm:whitespace-nowrap">
              {tFeatures("feature2Desc")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <ClockIcon className="w-6 h-6 text-blue-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">
                {tFeatures("feature2Item1")}
              </h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <TrophyIcon className="w-6 h-6 text-amber-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">{tFeatures("feature2Item2")}</h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                <ClipboardDocumentListIcon className="w-6 h-6 text-green-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">{tFeatures("feature2Item3")}</h4>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden shadow-2xl border border-gray-200">
            <Image
              src="/screenshots/lp-competition.png"
              alt={tFeatures("altCompetition")}
              width={1600}
              height={500}
              className="w-full h-auto object-cover"
            />
          </div>
        </div>
      </section>

      {/* コーチやマネージャーが代理で入力 */}
      <section id="proxy" className="py-16 sm:py-20 bg-white scroll-mt-[100px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-lg sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4 flex items-center justify-center gap-3">
              <span className="inline-flex items-center justify-center px-4 py-1 rounded-full bg-blue-600 text-white text-xs sm:text-lg font-bold shrink-0">
                {tFeatures("feature3Badge")}
              </span>
              {tFeatures("feature3Title")}
            </h2>
            <p className="text-sm sm:text-lg text-gray-600 sm:whitespace-nowrap">
              {tFeatures("feature3Desc")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <UserGroupIcon className="w-6 h-6 text-blue-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">
                {tFeatures("feature3Item1")}
              </h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <ClipboardDocumentListIcon className="w-6 h-6 text-amber-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">{tFeatures("feature3Item2")}</h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                <SparklesIcon className="w-6 h-6 text-green-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">{tFeatures("feature3Item3")}</h4>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden shadow-2xl border border-gray-200">
            <Image
              src="/screenshots/lp-proxy.png"
              alt={tFeatures("altProxy")}
              width={1600}
              height={500}
              className="w-full h-auto object-cover"
            />
          </div>
        </div>
      </section>

      {/* イチオシ便利機能 */}
      <section id="scanner-feature" className="py-16 sm:py-20 bg-white scroll-mt-[100px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-lg sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {tFeatures("scannerTitle")}
            </h2>
            <p className="text-sm sm:text-lg text-gray-600 max-w-2xl mx-auto">
              {tFeatures("scannerDesc")}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div>
              <div className="bg-linear-to-br from-green-50 to-blue-50 rounded-2xl p-6 sm:p-10 border border-green-100">
                <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <SparklesIcon className="w-8 h-8 text-green-600" />
                  </div>
                  <div className="text-center md:text-left flex-1">
                    <p className="text-gray-700 text-base sm:text-lg leading-relaxed mb-2">
                      {tFeatures("scannerLongDesc1")}
                    </p>
                    <p className="text-gray-700 text-base sm:text-lg leading-relaxed mb-4">
                      {tFeatures("scannerLongDesc2")}
                    </p>
                    <a
                      href="https://scanner.swim-hub.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-green-600 font-semibold hover:underline"
                    >
                      {tFeatures("scannerCta")}
                      <ArrowRightIcon className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden shadow-lg border border-gray-200">
              <Image
                src="/screenshots/lp-scanner.png"
                alt={tFeatures("altScanner")}
                width={800}
                height={500}
                className="w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 料金表 */}
      <section id="pricing" className="py-16 sm:py-20 bg-gray-50 scroll-mt-[100px]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-lg sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {tPricing("title")}
            </h2>
            <p className="text-sm sm:text-lg text-gray-600">
              {tPricing("subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            {/* Free プラン */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 flex flex-col">
              <h3 className="text-base sm:text-xl font-bold text-gray-900 mb-2">{tFree("name")}</h3>
              <div className="mb-4">
                <span className="text-4xl font-bold text-gray-900">¥0</span>
                <span className="text-sm text-gray-500">{tPricingPlan("monthSuffix")}</span>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                {(["feature4", "feature5"] as const).map((k) => (
                  <li key={k} className="flex items-start gap-2 text-sm text-gray-700">
                    <svg className="h-5 w-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {tFree(k)}
                  </li>
                ))}
                <li className="flex items-start gap-2 text-sm text-gray-700">
                  <svg className="h-5 w-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {tFree("exclude1")}
                </li>
              </ul>
              <Link
                href="/signup"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                {tFree("startButton")}
              </Link>
            </div>

            {/* Premium プラン */}
            <div className="bg-white rounded-2xl border-2 border-blue-600 p-6 sm:p-8 flex flex-col relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-blue-600 text-white">
                {tPremium("trialBadge")}
              </span>
              <h3 className="text-base sm:text-xl font-bold text-gray-900 mb-2">{tPremium("name")}</h3>
              <div className="mb-1">
                <span className="text-4xl font-bold text-gray-900">¥500</span>
                <span className="text-sm text-gray-500">{tPricingPlan("monthSuffix")}</span>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                {tPremium("annualNote")} ({tPremium("annualSaving")})
              </p>
              <ul className="space-y-3 mb-6 flex-1">
                {(["feature1", "feature2", "feature3", "feature4", "feature5"] as const).map((k) => (
                  <li key={k} className="flex items-start gap-2 text-sm text-gray-700">
                    <svg className="h-5 w-5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {tPremium(k)}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                {tPremium("startButton")}
              </Link>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center text-sm font-semibold text-blue-600 hover:underline"
            >
              {tPricing("viewDetail")}
              <ArrowRightIcon className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTAセクション */}
      <section className="py-16 sm:py-20 bg-blue-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-lg sm:text-3xl md:text-4xl font-bold text-white mb-6">
            {tCta("title")}
          </h2>
          <p className="text-sm sm:text-lg text-white mb-4 font-bold leading-relaxed">
            {tCta("subtitle")}
          </p>
          <p className="text-base text-white font-bold mb-8">
            {tCta("body")}
          </p>

          {/* App Store / Google Play ボタン */}
          <div className="flex flex-row gap-2 sm:gap-3 justify-center mb-8">
            <a
              href="https://apps.apple.com/us/app/swimhub/id6756808731/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={tHero("appStoreLabel")}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center px-3 sm:px-6 py-2 sm:py-3 bg-black text-white rounded-xl border border-white/15 shadow-md hover:bg-zinc-800 active:scale-[0.98] transition-all duration-150"
            >
              <svg className="w-5 h-5 sm:w-7 sm:h-7 mr-1.5 sm:mr-2.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              <div className="text-left leading-tight">
                <div className="text-[9px] sm:text-[10px] tracking-wide">Download on the</div>
                <div className="text-sm sm:text-base font-semibold -mt-0.5">App Store</div>
              </div>
            </a>
            <button
              disabled
              className="flex-1 sm:flex-initial inline-flex items-center justify-center px-3 sm:px-6 py-2 sm:py-3 bg-white/20 text-white rounded-lg cursor-not-allowed"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6 mr-1.5 sm:mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
              </svg>
              <div className="text-left leading-tight">
                <div className="text-[9px] sm:text-[10px] leading-none opacity-80">{tHero("comingSoon")}</div>
                <div className="text-sm font-semibold">Google Play</div>
              </div>
            </button>
          </div>

          <div className="flex flex-row gap-2 sm:gap-4 justify-center">
            <Link
              href="/signup"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center bg-white text-blue-600 hover:bg-blue-50 px-3 sm:px-8 py-2.5 sm:py-4 rounded-lg text-sm sm:text-lg font-semibold transition-all duration-200 shadow-xl hover:shadow-2xl hover-lift"
            >
              {tNav("signup")}
              <ArrowRightIcon className="ml-1 sm:ml-2 h-4 w-4 sm:h-5 sm:w-5" />
            </Link>
            <Link
              href="/login"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center border-2 border-white text-white hover:bg-white hover:text-blue-600 px-3 sm:px-8 py-2.5 sm:py-4 rounded-lg text-sm sm:text-lg font-semibold transition-all duration-200 hover-lift"
            >
              {tNav("login")}
            </Link>
          </div>
        </div>
      </section>

      {/* SwimHub ファミリーセクション */}
      <section className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-lg sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              {tFamily("title")}
            </h2>
            <p className="text-sm sm:text-lg text-gray-600">{tFamily("subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* SwimHub Timer */}
            <a
              href="https://timer.swim-hub.app"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-2xl p-8 hover:shadow-lg transition-all duration-300 group border border-gray-200"
            >
              <div className="flex items-center gap-3 mb-4">
                <Image
                  src="/timer-icon.png"
                  alt="SwimHub Timer"
                  width={128}
                  height={128}
                  className="w-12 h-12 shrink-0 object-contain"
                />
                <div>
                  <h3 className="text-base sm:text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                    SwimHub Timer
                  </h3>
                  <p className="text-sm font-semibold text-blue-600">{tFamily("timerTagline")}</p>
                </div>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                {tFamily("timerDesc")}
              </p>
              <span className="inline-flex items-center text-sm font-semibold text-blue-600 group-hover:underline">
                {tFamily("tryIt")}
                <ArrowRightIcon className="ml-1 h-4 w-4" />
              </span>
            </a>

            {/* SwimHub Scanner */}
            <a
              href="https://scanner.swim-hub.app"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-2xl p-8 hover:shadow-lg transition-all duration-300 group border border-gray-200"
            >
              <div className="flex items-center gap-3 mb-4">
                <Image
                  src="/scanner-icon.png"
                  alt="SwimHub Scanner"
                  width={128}
                  height={128}
                  className="w-12 h-12 shrink-0 object-contain"
                />
                <div>
                  <h3 className="text-base sm:text-xl font-bold text-gray-900 group-hover:text-green-600 transition-colors">
                    SwimHub Scanner
                  </h3>
                  <p className="text-sm font-semibold text-green-600">{tFamily("scannerTagline")}</p>
                </div>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                {tFamily("scannerDesc")}
              </p>
              <span className="inline-flex items-center text-sm font-semibold text-green-600 group-hover:underline">
                {tFamily("tryIt")}
                <ArrowRightIcon className="ml-1 h-4 w-4" />
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* 静的フッター（Google OAuth審査対応） */}
      <StaticFooter />
    </div>
  );
}
