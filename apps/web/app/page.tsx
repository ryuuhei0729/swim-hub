'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/contexts'
import { FullScreenLoading } from '@/components/ui/LoadingSpinner'
import { 
  CalendarDaysIcon, 
  ChartBarIcon, 
  TrophyIcon,
  ClipboardDocumentListIcon,
  UsersIcon,
  SpeakerWaveIcon,
  ArrowRightIcon,
  CheckIcon,
  SparklesIcon,
  UserIcon,
  AcademicCapIcon,
  UserGroupIcon,
  QuestionMarkCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  BellIcon
} from '@heroicons/react/24/outline'

export default function Home() {
  const { user, loading } = useAuth()
  const isAuthenticated = !!user
  const isLoading = loading
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard')
    }
  }, [isAuthenticated, isLoading, router])

  if (isLoading) {
    return <FullScreenLoading message="SwimHubを起動中..." />
  }

  if (isAuthenticated) {
    return null
  }

  // 機能一覧（個人・チーム バランスよく）
  const features = [
    {
      icon: CalendarDaysIcon,
      title: 'カレンダー記録',
      description: '練習や大会の記録を日付ごとに簡単に管理。月間サマリーで一目で確認できます。',
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      icon: TrophyIcon,
      title: 'タイム管理',
      description: 'ベストタイムの自動更新、スプリットタイムの記録、長水路・短水路別の管理に対応。',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100'
    },
    {
      icon: ChartBarIcon,
      title: '練習分析',
      description: '練習内容をタグで管理し、振り返りや分析を簡単に。自分の成長を可視化できます。',
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      icon: UsersIcon,
      title: 'チーム管理',
      description: '複数のチームに同時所属可能。チーム脱退後も個人データは保持されます。',
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      icon: SpeakerWaveIcon,
      title: 'お知らせ共有',
      description: 'チーム内のお知らせを簡単に共有。重要な連絡も見逃しません。',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100'
    },
    {
      icon: ClipboardDocumentListIcon,
      title: '出欠管理',
      description: '練習や大会の出席状況を記録・管理。チーム全体の参加状況を把握できます。',
      color: 'text-red-600',
      bgColor: 'bg-red-100'
    }
  ]

  // 利用シーン
  const useCases = [
    {
      icon: UserIcon,
      persona: '個人選手',
      title: '自分の記録を管理したい',
      description: 'マスターズスイマーや個人で練習する選手に最適。自分のペースで記録を管理できます。',
      features: ['練習記録', 'ベストタイム管理', 'タイム推移グラフ']
    },
    {
      icon: UserGroupIcon,
      persona: 'チーム選手',
      title: '個人記録とチーム活動の両立',
      description: 'チームに所属しながら個人の記録も管理。両方の良いところを活かせます。',
      features: ['個人記録管理', 'チーム練習参加', 'お知らせ確認']
    },
    {
      icon: AcademicCapIcon,
      persona: 'コーチ',
      title: 'チーム全体の記録管理',
      description: 'チームメンバーの記録を一元管理。効率的な指導をサポートします。',
      features: ['メンバー管理', '練習計画共有', '記録分析']
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

  return (
    <div className="min-h-screen bg-white">
      {/* ヒーローセクション */}
      <section className="relative overflow-hidden bg-linear-to-b from-blue-50 to-white">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center">
            {/* ロゴ */}
            <div className="flex justify-center mb-6 animate-fade-in">
              <div className="w-20 h-20 flex items-center justify-center">
                <Image 
                  src="/favicon.png" 
                  alt="SwimHub" 
                  width={80} 
                  height={80} 
                  className="w-full h-full object-contain drop-shadow-lg" 
                  priority
                />
              </div>
            </div>
            
            <p className="text-sm sm:text-base text-blue-600 font-semibold mb-4 animate-fade-in">
              スマホでらくらく
            </p>
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6 animate-fade-in">
              <span className="block text-blue-600">
                水泳記録管理
              </span>
            </h1>
            
            <p className="text-lg sm:text-xl text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed animate-fade-in">
              個人でもチームでも使える
              <br className="sm:hidden" />
              水泳選手のための記録管理サービス
            </p>
            
            {/* App Store / Google Play ボタン */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8 animate-fade-in">
              <button
                disabled
                className="inline-flex items-center justify-center px-6 py-3 bg-black text-white rounded-lg opacity-60 cursor-not-allowed"
              >
                <svg className="w-7 h-7 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                <div className="text-left">
                  <div className="text-[10px] leading-none">Coming Soon</div>
                  <div className="text-sm font-semibold">App Store</div>
                </div>
              </button>
              <button
                disabled
                className="inline-flex items-center justify-center px-6 py-3 bg-black text-white rounded-lg opacity-60 cursor-not-allowed"
              >
                <svg className="w-6 h-6 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
                </svg>
                <div className="text-left">
                  <div className="text-[10px] leading-none">Coming Soon</div>
                  <div className="text-sm font-semibold">Google Play</div>
                </div>
              </button>
            </div>
            
            {/* Webで始めるボタン */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-lg hover:shadow-xl hover:bg-blue-700 transition-all duration-200 hover-lift"
              >
                Webで無料登録
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all duration-200 hover-lift"
              >
                ログイン
              </Link>
            </div>
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
      <section className="py-16 sm:py-20 bg-blue-50">
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
            <p className="text-gray-700 text-base sm:text-lg leading-relaxed mb-6">
              <span className="font-bold text-blue-600">SwimHub（スイムハブ）</span>は、
              水泳選手の記録管理の悩みから生まれた、練習・大会記録管理サービスです。
            </p>
            <p className="text-gray-700 text-base sm:text-lg leading-relaxed mb-8">
              はじめ方はとっても簡単。
              PCやスマホから簡単なアカウント登録をしたらすぐに使い始められます。
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-6 bg-blue-50 rounded-xl">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  1
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">アカウント登録</h4>
                <p className="text-sm text-gray-600">メールアドレスだけでOK。1分で完了します。</p>
              </div>
              <div className="text-center p-6 bg-blue-50 rounded-xl">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  2
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">記録を登録</h4>
                <p className="text-sm text-gray-600">練習や大会の記録を入力するだけ。</p>
              </div>
              <div className="text-center p-6 bg-blue-50 rounded-xl">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  3
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">成長を確認</h4>
                <p className="text-sm text-gray-600">タイムの推移やベスト更新を自動で管理。</p>
              </div>
            </div>
            
            <div className="mt-8 pt-8 border-t border-gray-200">
              <p className="text-gray-600 text-sm text-center">
                チームに所属している場合は、チームに参加することで
                チーム練習への出欠登録やお知らせの確認もできます。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 特徴セクション */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              SwimHubの特徴
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              個人利用からチーム運営まで、必要な機能がすべて揃っています
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
      <section className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              こんな方におすすめ
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              様々な利用シーンに対応しています
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
      <section className="py-16 sm:py-20 bg-white">
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
          <p className="text-lg text-blue-100 mb-4 leading-relaxed">
            アカウント作成は無料。すぐに使い始められます。
          </p>
          <p className="text-base text-blue-200 mb-8">
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

      {/* フッター */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="w-10 h-10 flex items-center justify-center">
                <Image 
                  src="/favicon.png" 
                  alt="SwimHub" 
                  width={40} 
                  height={40} 
                  className="w-full h-full object-contain opacity-80" 
                />
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">
              SwimHub
            </h3>
            <p className="text-gray-400 mb-6 text-sm">
              水泳選手のための記録管理サービス
            </p>
            <div className="flex justify-center gap-6 mb-8 text-sm text-gray-400">
              <span>利用規約</span>
              <span>プライバシーポリシー</span>
            </div>
            <div className="text-xs text-gray-500">
              © 2025 SwimHub. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
