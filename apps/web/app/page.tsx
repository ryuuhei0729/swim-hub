import Link from 'next/link'
import Image from 'next/image'
import StaticFooter from '@/components/layout/StaticFooter'
import {
  CalendarDaysIcon,
  ChartBarIcon,
  TrophyIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  ArrowRightIcon,
  CheckIcon,
  SparklesIcon,
  UserIcon,
  UserGroupIcon,
  QuestionMarkCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  BellIcon
} from '@heroicons/react/24/outline'
import AuthRedirect from './_components/AuthRedirect'
import ScrollNavButtons from './_components/ScrollNavButtons'
import DeviceMockup from './_components/DeviceMockup'

// 手が届かなかったかゆい機能
const features = [
  {
    icon: CheckIcon,
    title: 'チームを抜けても記録は残る',
    description: '全ての記録は個人に紐づくため、チームを転々とする選手でも記録が途切れることはありません。あなたの成長の軌跡をずっと残せます。',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100'
  },
  {
    icon: TrophyIcon,
    title: '短水路・長水路・引き継ぎ有無も管理',
    description: '「この記録は短水路？長水路？リレーの引き継ぎはあった？」そんな疑問を解決。記録の詳細情報をしっかり管理できます。',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100'
  },
  {
    icon: ClockIcon,
    title: 'ラップタイムの自由入力',
    description: '25m、50mはもちろん、5m、12.5m、15mなど、細かい間隔でのラップタイムも自由に入力可能。あなたのスタイルに合わせた柔軟な記録管理ができます。',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100'
  },
  {
    icon: ClipboardDocumentListIcon,
    title: '大会エントリー集計',
    description: 'エントリー種目とエントリータイムを集計可能。大会へのエントリー作業を大幅に効率化し、エントリーミスを防ぎます。',
    color: 'text-green-600',
    bgColor: 'bg-green-100'
  },
  {
    icon: CalendarDaysIcon,
    title: 'YouTubeリンクで泳ぎと記録を紐付け',
    description: '動画はYouTubeで管理。記録にYouTubeリンクを紐付けることで、泳ぎのフォームと記録を簡単に結びつけられます。',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100'
  },
  {
    icon: ChartBarIcon,
    title: 'Excelファイルで一括入力',
    description: 'チームのスケジュールをExcelファイルから一括インポート可能。手入力の手間を大幅に削減できます。',
    color: 'text-red-600',
    bgColor: 'bg-red-100'
  }
]

// 利用パターン（3種類）
const useCases = [
  {
    icon: UserIcon,
    persona: 'パターン1',
    title: '個人で使う',
    description: '練習記録や大会の結果を自分で入力して、データを蓄積。マスターズスイマーや個人で練習する選手に最適です。',
    features: ['練習記録の蓄積', '大会結果の記録', 'ベストタイムの自動更新']
  },
  {
    icon: UserGroupIcon,
    persona: 'パターン2',
    title: 'スイミングクラブや部活内で使う',
    description: 'チーム機能で練習記録や大会結果を共有。マネージャーやコーチが代理で全員分の記録を入力でき、出欠管理やエントリー集計も効率化。複数チームへの所属も可能です。',
    features: ['代理入力機能', '出欠管理', '大会エントリー集計', 'お知らせ共有', '複数チーム所属可能']
  },
  {
    icon: UsersIcon,
    persona: 'パターン3',
    title: '友達同士で使う',
    description: 'チーム機能は友達同士でも使えます。お互いの記録を見られるので、切磋琢磨してモチベーションを高め合えます。',
    features: ['仲間の記録を閲覧', '記録で切磋琢磨', 'モチベーション向上']
  }
]

// お知らせ（将来的にはSupabaseから取得）
const announcements = [
  {
    date: '2025.01.15',
    title: 'SwimHub v1.0 リリース',
    description: '水泳記録管理システム SwimHub の正式版をリリースしました。'
  },
  {
    date: '2025.01.10',
    title: 'チーム機能を追加',
    description: 'チーム作成・メンバー管理・出欠管理機能を追加しました。'
  },
  {
    date: '2025.01.05',
    title: 'モバイルアプリ開発中',
    description: 'iOS/Android向けアプリを開発中です。リリースまでしばらくお待ちください。'
  }
]

export default function Home() {
  return (
    <AuthRedirect>
      <div className="min-h-screen bg-white">
        {/* 固定ヘッダーナビゲーション */}
        <header className="fixed top-0 left-0 right-0 z-50 bg-white/60 backdrop-blur-sm shadow-sm">
          <nav className="max-w-7xl mx-auto px-2 sm:px-3 lg:px-4">
            <div className="flex items-center justify-between h-20">
              {/* ロゴ */}
              <Link href="/" className="flex items-center space-x-3">
                <Image src="/favicon.png" alt="SwimHub" width={50} height={50} className="w-16 h-16" />
                <span className="text-3xl font-bold text-gray-900">SwimHub</span>
              </Link>

              <ScrollNavButtons />
            </div>
          </nav>
        </header>

        {/* ヒーローセクション（背景画像 + スマホモック） */}
        <section className="relative isolate overflow-hidden bg-gray-900 text-white pt-20">
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
                <div className="inline-flex items-center gap-2 bg-white/10 text-blue-100 px-3 py-1 rounded-full text-md font-semibold tracking-wide">
                  <SparklesIcon className="w-6 h-8" />
                  スマホでらくらくチーム管理
                </div>

                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
                  <span className="text-cyan-400">個人でもチームでも、</span>
                  <span className="block text-blue-100">水泳の記録管理を</span>
                  <span className="block text-blue-100">これひとつで。</span>
                </h1>

                <p className="text-md sm:text-xl md:text-xl text-blue-50 leading-relaxed max-w-2xl mx-auto lg:mx-0">
                  練習記録・大会記録・チームの出欠、エントリー収集までまとめて管理。スマホでもブラウザでもすぐに始められます。
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                  <button
                    disabled
                    className="inline-flex items-center justify-center px-4 sm:px-5 py-2.5 sm:py-3 bg-white/20 text-white rounded-lg backdrop-blur-sm cursor-not-allowed text-sm sm:text-base"
                  >
                    <svg className="w-7 h-7 sm:w-6 sm:h-6 mr-2" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                    </svg>
                    <div className="text-left">
                      <div className="text-[15px] leading-none opacity-80">Coming Soon</div>
                      <div className="text-xl sm:text-md font-semibold">App Store</div>
                    </div>
                  </button>
                  <button
                    disabled
                    className="inline-flex items-center justify-center px-4 sm:px-5 py-2.5 sm:py-3 bg-white/20 text-white rounded-lg backdrop-blur-sm cursor-not-allowed text-sm sm:text-base"
                  >
                    <svg className="w-7 h-7 sm:w-6 sm:h-6 mr-2" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
                    </svg>
                    <div className="text-left">
                      <div className="text-[15px] leading-none opacity-80">Coming Soon</div>
                      <div className="text-xl sm:text-md font-semibold">Google Play</div>
                    </div>
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center lg:justify-start">
                  <Link
                    href="/signup"
                    className="inline-flex items-center justify-center px-6 sm:px-8 py-2.5 sm:py-3 text-base sm:text-lg font-semibold text-blue-600 bg-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 hover-lift"
                  >
                    Webで無料登録
                    <ArrowRightIcon className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center px-6 sm:px-8 py-2.5 sm:py-3 text-base sm:text-lg font-semibold text-white border border-white/60 rounded-lg hover:bg-white/10 transition-all duration-200 hover-lift"
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

        {/* 問題提起セクション */}
        <section className="py-16 sm:py-20 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                水泳の記録管理って<br className="sm:hidden" />大変ですよね？
              </h2>
            </div>

            <div className="bg-gray-50 rounded-2xl p-6 sm:p-10">
              <p className="text-gray-700 text-base sm:text-lg leading-relaxed mb-6">
                水泳の記録管理って大変です。
              </p>
              <p className="text-gray-700 text-base sm:text-lg leading-relaxed mb-6">
                練習内容をどう記録する？大会のタイムはどこにメモした？ベストタイムは更新した？
                スプリットタイムは？長水路と短水路、どっちの記録だっけ？
              </p>
              <p className="text-gray-700 text-base sm:text-lg leading-relaxed mb-6">
                ノートやスプレッドシートで管理しようとしても、
                続かなかったり、どこに書いたか分からなくなったり...
              </p>
              <p className="text-gray-700 text-base sm:text-lg leading-relaxed mb-8">
                <span className="font-semibold text-blue-600">もっと簡単に記録を管理したい！</span>
                <br />
                そんな悩めるスイマーの方には<span className="font-bold">SwimHub</span>がオススメです。
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-start gap-3 bg-white rounded-lg p-4">
                  <ExclamationCircleIcon className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">記録がバラバラ</p>
                    <p className="text-gray-600 text-xs">ノート、アプリ、メモ帳...</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-white rounded-lg p-4">
                  <QuestionMarkCircleIcon className="w-6 h-6 text-yellow-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">ベストがわからない</p>
                    <p className="text-gray-600 text-xs">いつのタイムが最速？</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 bg-white rounded-lg p-4">
                  <ClockIcon className="w-6 h-6 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">管理が面倒</p>
                    <p className="text-gray-600 text-xs">続かない、忘れる...</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SwimHubとは？セクション */}
        <section id="about" className="py-16 sm:py-20 bg-blue-50 scroll-mt-[100px]">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                SwimHubとは？
              </h2>
              <p className="text-lg text-gray-600">
                スイマーのための記録管理サービスです
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 sm:p-10 shadow-sm">
              <p className="text-gray-700 text-base sm:text-lg leading-relaxed mb-8">
                <span className="font-bold text-blue-600">SwimHub（スイムハブ）</span>は、
                水泳選手の記録管理の悩みから生まれた、練習・大会記録管理サービスです。
                PCやスマホから簡単にアクセスでき、個人利用からチーム運営まで幅広く対応しています。
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-4">
                    <CalendarDaysIcon className="w-6 h-6" />
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-3 text-center">練習記録の管理</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    練習内容を日付ごとに記録し、サークルの変遷や練習タイムの変遷を可視化。自分の成長をグラフで確認できます。
                  </p>
                </div>
                <div className="p-6 bg-yellow-50 rounded-xl border border-yellow-100">
                  <div className="w-12 h-12 rounded-full bg-yellow-600 text-white flex items-center justify-center mx-auto mb-4">
                    <TrophyIcon className="w-6 h-6" />
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-3 text-center">大会記録の管理</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    種目別タイムの変遷を追跡し、ラップタイム分析で泳ぎの改善点を発見。ベストタイムの自動更新も可能です。
                  </p>
                </div>
                <div className="p-6 bg-green-50 rounded-xl border border-green-100">
                  <div className="w-12 h-12 rounded-full bg-green-600 text-white flex items-center justify-center mx-auto mb-4">
                    <UsersIcon className="w-6 h-6" />
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-3 text-center">チーム管理</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    出欠管理、練習・大会のスケジュール登録、エントリー集計機能など、チーム運営に必要な機能を一括管理できます。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 特徴セクション */}
        <section id="features" className="py-16 sm:py-20 bg-white scroll-mt-[100px]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                手が届かなかったかゆい機能を追加！
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                他のアプリでは実現できなかった、本当に欲しかった機能を実装しました
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-lg hover:border-blue-200 transition-all duration-300 animate-fade-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4`}>
                    <feature.icon className={`w-6 h-6 ${feature.color}`} />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">
                    {feature.title}
                  </h4>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-12 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full text-sm text-gray-600">
                <SparklesIcon className="w-4 h-4" />
                <span>すべての機能を<span className="font-semibold text-blue-600">無料</span>で利用できます</span>
              </div>
            </div>
          </div>
        </section>

        {/* 利用シーンセクション */}
        <section id="usecases" className="py-16 sm:py-20 bg-gray-50 scroll-mt-[100px]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                SwimHubの使い方（3つの利用パターン）
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                個人利用からチーム運営、友達同士での利用まで、様々なシーンに対応しています
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {useCases.map((useCase, index) => (
                <div
                  key={useCase.persona}
                  className="bg-white rounded-2xl p-8 hover:shadow-lg transition-all duration-300 animate-fade-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mb-6">
                    <useCase.icon className="w-7 h-7 text-blue-600" />
                  </div>
                  <div className="text-sm font-semibold text-blue-600 mb-2">
                    {useCase.persona}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">
                    {useCase.title}
                  </h3>
                  <p className="text-gray-600 mb-6 leading-relaxed text-sm">
                    {useCase.description}
                  </p>
                  <div className="space-y-2">
                    {useCase.features.map((feature) => (
                      <div key={feature} className="flex items-center text-sm text-gray-700">
                        <CheckIcon className="w-4 h-4 text-green-500 mr-2 shrink-0" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* お知らせセクション */}
        <section id="announcements" className="py-16 sm:py-20 bg-white scroll-mt-[100px]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                お知らせ・更新情報
              </h2>
            </div>

            <div className="space-y-4">
              {announcements.map((announcement, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <BellIcon className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-sm text-gray-500">{announcement.date}</span>
                      <span className="font-semibold text-gray-900">{announcement.title}</span>
                    </div>
                    <p className="text-sm text-gray-600">{announcement.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTAセクション */}
        <section className="py-16 sm:py-20 bg-blue-600">
          <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-6">
              今すぐ記録を始めよう
            </h2>
            <p className="text-lg text-white mb-4 font-bold leading-relaxed">
              アカウント作成は無料。すぐに使い始められます。
            </p>
            <p className="text-base text-white font-bold mb-8">
              チームに所属していなくても大丈夫。
              <br className="hidden sm:block" />
              まずは個人で始めて、後からチーム機能を追加することもできます。
            </p>

            {/* App Store / Google Play ボタン */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
              <button
                disabled
                className="inline-flex items-center justify-center px-6 py-3 bg-white/20 text-white rounded-lg cursor-not-allowed"
              >
                <svg className="w-7 h-7 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                <div className="text-left">
                  <div className="text-[10px] leading-none opacity-80">Coming Soon</div>
                  <div className="text-sm font-semibold">App Store</div>
                </div>
              </button>
              <button
                disabled
                className="inline-flex items-center justify-center px-6 py-3 bg-white/20 text-white rounded-lg cursor-not-allowed"
              >
                <svg className="w-6 h-6 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
                </svg>
                <div className="text-left">
                  <div className="text-[10px] leading-none opacity-80">Coming Soon</div>
                  <div className="text-sm font-semibold">Google Play</div>
                </div>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center bg-white text-blue-600 hover:bg-blue-50 px-8 py-4 rounded-lg text-lg font-semibold transition-all duration-200 shadow-xl hover:shadow-2xl hover-lift"
              >
                Webで無料登録
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center border-2 border-white text-white hover:bg-white hover:text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold transition-all duration-200 hover-lift"
              >
                ログイン
              </Link>
            </div>
          </div>
        </section>

        {/* 静的フッター（Google OAuth審査対応） */}
        <StaticFooter />
      </div>
    </AuthRedirect>
  )
}
