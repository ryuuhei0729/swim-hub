import Link from "next/link";
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
import ScrollNavButtons from "./_components/ScrollNavButtons";
import DeviceMockup from "./_components/DeviceMockup";

export default function Home() {
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

            <ScrollNavButtons />
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
                スマホでらくらくチーム管理
              </div>

              <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
                <span className="text-cyan-400">個人でもチームでも、</span>
                <span className="block text-blue-100">水泳の記録管理を</span>
                <span className="block text-blue-100">これひとつで。</span>
              </h1>

              <p className="text-base sm:text-xl md:text-xl text-blue-50 leading-relaxed max-w-2xl mx-auto lg:mx-0">
                練習記録・大会記録・代理入力、エントリー収集までまとめて管理。スマホでもブラウザでもすぐに始められます。
              </p>

              <div className="flex flex-row gap-2 sm:gap-3 justify-center lg:justify-start">
                <a
                  href="https://apps.apple.com/us/app/swimhub/id6756808731/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="App Store からダウンロード"
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
                    <div className="text-[9px] sm:text-[15px] leading-none opacity-80">Coming Soon</div>
                    <div className="text-sm sm:text-base font-semibold">Google Play</div>
                  </div>
                </button>
              </div>

              <div className="flex flex-row gap-2 sm:gap-4 justify-center lg:justify-start">
                <Link
                  href="/signup"
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center px-3 sm:px-8 py-2 sm:py-3 text-sm sm:text-lg font-semibold text-blue-600 bg-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 hover-lift"
                >
                  無料登録
                  <ArrowRightIcon className="ml-1 sm:ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                </Link>
                <Link
                  href="/login"
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center px-3 sm:px-8 py-2 sm:py-3 text-sm sm:text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-lg hover:bg-blue-700 transition-all duration-200 hover-lift"
                >
                  ログイン
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
                機能 1
              </span>
              練習記録・タイムを管理
            </h2>
            <p className="text-sm sm:text-lg text-gray-600 sm:whitespace-nowrap">
              サークル・本数・セット数、タイムの記録を蓄積。
              <br />
              次回はもう1本多く回る、サークルを5秒短くする、平均タイムを上げるなど
              <br />
              次回の練習目標を立てやすくします。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <ClipboardDocumentListIcon className="w-6 h-6 text-blue-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">
                サークル・本数・セット数を記録
              </h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <ClockIcon className="w-6 h-6 text-amber-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">平均タイムも自動で計算</h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                <TagIcon className="w-6 h-6 text-green-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">タグでフィルタリング可能</h4>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden shadow-2xl border border-gray-200">
            <Image
              src="/screenshots/lp-practice.png"
              alt="練習記録画面のスクリーンショット"
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
                機能 2
              </span>
              レース結果を記録
            </h2>
            <p className="text-sm sm:text-lg text-gray-600 sm:whitespace-nowrap">
              種目、タイム、長水路/短水路、途中タイムなどを記録。
              <br />
              記録に合わせてベストタイム表も自動更新。
              <br />
              短水路/長水路、引き継ぎあり/なしまでデータに反映されます。
              <br />
              ※ベストタイム表は手動で直接入力もできます
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <ClockIcon className="w-6 h-6 text-blue-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">
                途中タイムからラップを自動計算
              </h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <TrophyIcon className="w-6 h-6 text-amber-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">ベストタイム表の自動更新</h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                <ClipboardDocumentListIcon className="w-6 h-6 text-green-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">大会エントリーも管理可能</h4>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden shadow-2xl border border-gray-200">
            <Image
              src="/screenshots/lp-competition.png"
              alt="大会記録画面のスクリーンショット"
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
                機能 3
              </span>
              コーチやマネージャーが代理で記録を入力
            </h2>
            <p className="text-sm sm:text-lg text-gray-600 sm:whitespace-nowrap">
              練習記録や大会記録は、選手本人だけでなく、コーチやマネージャーが一括で登録できます。
              <br />
              記録はあくまでも個人に紐付くので、そのチームを引退した後も記録は蓄積され続けます。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <UserGroupIcon className="w-6 h-6 text-blue-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">
                コーチ・マネージャーが一括登録
              </h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <ClipboardDocumentListIcon className="w-6 h-6 text-amber-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">記録は個人に紐付いて蓄積</h4>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                <SparklesIcon className="w-6 h-6 text-green-600" />
              </div>
              <h4 className="text-sm sm:text-xl font-semibold text-gray-900">一生使えるアプリ</h4>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden shadow-2xl border border-gray-200">
            <Image
              src="/screenshots/lp-proxy.png"
              alt="チーム管理・代理入力画面のスクリーンショット"
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
              イチオシ便利機能
            </h2>
            <p className="text-sm sm:text-lg text-gray-600 max-w-2xl mx-auto">
              手書きの練習記録をAIで解析。入力の手間を大幅に省けます。
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
                    <p className="text-gray-700 text-base sm:text-lg leading-relaxed mb-4">
                      手書きの練習記録画像をAIで解析することで入力の手間を省けます。この機能が便利なため、
                      <strong className="text-gray-900">SwimHub Scanner</strong>{" "}
                      というアプリとしても個別にリリースしています。
                    </p>
                    <a
                      href="https://scanner.swim-hub.app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-green-600 font-semibold hover:underline"
                    >
                      SwimHub Scanner を試す
                      <ArrowRightIcon className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden shadow-lg border border-gray-200">
              <Image
                src="/screenshots/lp-scanner.png"
                alt="SwimHub Scanner のスクリーンショット"
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
              料金表
            </h2>
            <p className="text-sm sm:text-lg text-gray-600">
              シンプルな2プラン。まずは無料で始められます。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            {/* Free プラン */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 flex flex-col">
              <h3 className="text-base sm:text-xl font-bold text-gray-900 mb-2">Free</h3>
              <div className="mb-4">
                <span className="text-4xl font-bold text-gray-900">¥0</span>
                <span className="text-sm text-gray-500">/月</span>
              </div>
              <ul className="space-y-3 mb-6 flex-1">
                {[
                  "Split-time: 最大3個/記録",
                  "PracticeTime: 最大18個/練習ログ",
                  "画像・動画アップロード: 不可",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                    <svg className="h-5 w-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                無料で始める
              </Link>
            </div>

            {/* Premium プラン */}
            <div className="bg-white rounded-2xl border-2 border-blue-600 p-6 sm:p-8 flex flex-col relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center px-3 py-0.5 rounded-full text-xs font-semibold bg-blue-600 text-white">
                7日間無料トライアル
              </span>
              <h3 className="text-base sm:text-xl font-bold text-gray-900 mb-2">Premium</h3>
              <div className="mb-1">
                <span className="text-4xl font-bold text-gray-900">¥500</span>
                <span className="text-sm text-gray-500">/月</span>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                年払い: ¥5,000/年（2ヶ月分お得）
              </p>
              <ul className="space-y-3 mb-6 flex-1">
                {[
                  "全機能無制限",
                  "Split-time: 無制限",
                  "PracticeTime: 無制限",
                  "画像・動画アップロード: 可",
                  "7日間の無料トライアル",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                    <svg className="h-5 w-5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                無料トライアルを始める
              </Link>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center text-sm font-semibold text-blue-600 hover:underline"
            >
              料金プランの詳細を見る
              <ArrowRightIcon className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTAセクション */}
      <section className="py-16 sm:py-20 bg-blue-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-lg sm:text-3xl md:text-4xl font-bold text-white mb-6">
            今すぐ記録を始めよう
          </h2>
          <p className="text-sm sm:text-lg text-white mb-4 font-bold leading-relaxed">
            アカウント作成は無料。すぐに使い始められます。
          </p>
          <p className="text-base text-white font-bold mb-8">
            チームに所属していなくても大丈夫。
            <br className="hidden sm:block" />
            まずは個人で始めて、後からチーム機能を追加することもできます。
          </p>

          {/* App Store / Google Play ボタン */}
          <div className="flex flex-row gap-2 sm:gap-3 justify-center mb-8">
            <a
              href="https://apps.apple.com/us/app/swimhub/id6756808731/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="App Store からダウンロード"
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
                <div className="text-[9px] sm:text-[10px] leading-none opacity-80">Coming Soon</div>
                <div className="text-sm font-semibold">Google Play</div>
              </div>
            </button>
          </div>

          <div className="flex flex-row gap-2 sm:gap-4 justify-center">
            <Link
              href="/signup"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center bg-white text-blue-600 hover:bg-blue-50 px-3 sm:px-8 py-2.5 sm:py-4 rounded-lg text-sm sm:text-lg font-semibold transition-all duration-200 shadow-xl hover:shadow-2xl hover-lift"
            >
              無料登録
              <ArrowRightIcon className="ml-1 sm:ml-2 h-4 w-4 sm:h-5 sm:w-5" />
            </Link>
            <Link
              href="/login"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center border-2 border-white text-white hover:bg-white hover:text-blue-600 px-3 sm:px-8 py-2.5 sm:py-4 rounded-lg text-sm sm:text-lg font-semibold transition-all duration-200 hover-lift"
            >
              ログイン
            </Link>
          </div>
        </div>
      </section>

      {/* SwimHub ファミリーセクション */}
      <section className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-lg sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              SwimHub サービス一覧
            </h2>
            <p className="text-sm sm:text-lg text-gray-600">水泳をもっと便利にするツール群</p>
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
                  <p className="text-sm font-semibold text-blue-600">動画にタイムをオーバーレイ</p>
                </div>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                水泳の動画にストップウォッチを重ねて表示。スタート信号の自動検出やスプリットタイム記録に対応しています。
              </p>
              <span className="inline-flex items-center text-sm font-semibold text-blue-600 group-hover:underline">
                試してみる
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
                  <p className="text-sm font-semibold text-green-600">手書きの記録表をAIで解析</p>
                </div>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                手書きの練習記録をAIで読み取り、画像・CSV・Excelに変換。手入力の手間を大幅に削減できます。
              </p>
              <span className="inline-flex items-center text-sm font-semibold text-green-600 group-hover:underline">
                試してみる
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
