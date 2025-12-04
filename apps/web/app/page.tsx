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
  LockClosedIcon,
  DevicePhoneMobileIcon,
  UserIcon,
  AcademicCapIcon,
  UserGroupIcon
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

  // 個人機能を前面に
  const features = [
    {
      icon: CalendarDaysIcon,
      title: 'カレンダー記録',
      description: '練習や大会の記録を日付ごとに簡単に管理。月間サマリーで一目で確認できます。',
      color: 'text-blue-600',
      category: 'personal'
    },
    {
      icon: TrophyIcon,
      title: 'タイム管理',
      description: 'ベストタイムの自動更新、スプリットタイムの記録、長水路・短水路別の管理に対応。',
      color: 'text-yellow-600',
      category: 'personal'
    },
    {
      icon: ChartBarIcon,
      title: '練習分析',
      description: '練習内容をタグで管理し、振り返りや分析を簡単に。自分の成長を可視化できます。',
      color: 'text-purple-600',
      category: 'personal'
    },
    {
      icon: UsersIcon,
      title: 'チーム管理',
      description: '複数のチームに同時所属可能。チーム脱退後も個人データは保持されます。',
      color: 'text-green-600',
      category: 'team'
    },
    {
      icon: SpeakerWaveIcon,
      title: 'お知らせ',
      description: 'チーム内のお知らせを簡単に共有。重要な連絡も見逃しません。',
      color: 'text-indigo-600',
      category: 'team'
    },
    {
      icon: ClipboardDocumentListIcon,
      title: '出欠管理',
      description: '練習や大会の出席状況を記録・管理。チーム全体の参加状況を把握できます。',
      color: 'text-red-600',
      category: 'team'
    }
  ]

  // 3つの主要価値
  const values = [
    {
      icon: UserIcon,
      title: '個人で始められる',
      description: 'チームに所属していなくても、今すぐ自分の記録管理を始められます。',
      bgColor: 'bg-blue-500'
    },
    {
      icon: ChartBarIcon,
      title: 'データで成長を可視化',
      description: 'タイムの推移、練習記録を一目で確認。自分の成長を実感できます。',
      bgColor: 'bg-purple-500'
    },
    {
      icon: UsersIcon,
      title: 'チームにも対応',
      description: '個人利用を続けながら、必要に応じてチーム機能も追加できます。',
      bgColor: 'bg-green-500'
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

  // 特徴
  const highlights = [
    {
      icon: SparklesIcon,
      title: 'シンプル設計',
      description: '直感的で使いやすいインターフェース。初めてでもすぐに使いこなせます。'
    },
    {
      icon: LockClosedIcon,
      title: '安全なデータ',
      description: 'Supabaseで安全にデータを管理。あなたの記録をしっかり守ります。'
    },
    {
      icon: DevicePhoneMobileIcon,
      title: 'どこでもアクセス',
      description: 'Web・モバイル対応（予定）。いつでもどこでも記録を確認できます。'
    }
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* ヒーローセクション */}
      <section className="relative overflow-hidden bg-blue-50">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
          <div className="text-center">
            {/* ロゴ */}
            <div className="flex justify-center mb-8 animate-fade-in">
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
            
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 mb-6 animate-fade-in">
              <span className="block mb-2">水泳選手のための</span>
              <span className="block text-blue-600">
                記録管理システム
              </span>
            </h1>
            
            <p className="text-lg sm:text-xl text-gray-600 mb-4 max-w-3xl mx-auto leading-relaxed animate-fade-in">
              個人でもチームでも使える、あなただけの水泳記録帳
            </p>
            
            <p className="text-base sm:text-lg text-gray-500 mb-12 max-w-2xl mx-auto animate-fade-in">
              練習記録、大会記録、目標管理をシンプルに。
              <br className="hidden sm:block" />
              チーム不要、今すぐ始められます。
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-lg hover:shadow-xl hover:bg-blue-700 transition-all duration-200 hover-lift"
              >
                無料で始める
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

      {/* 価値提案セクション */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              SwimHubが選ばれる理由
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              シンプルで使いやすく、あなたの成長をサポートします
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {values.map((value, index) => (
              <div
                key={value.title}
                className="relative p-8 rounded-2xl bg-white border border-gray-200 hover:shadow-xl transition-all duration-300 hover-lift animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className={`w-14 h-14 rounded-xl ${value.bgColor} flex items-center justify-center mb-6 shadow-lg`}>
                  <value.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {value.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 機能紹介セクション */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              充実の機能
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              個人利用からチーム運営まで、必要な機能がすべて揃っています
            </p>
          </div>

          {/* 個人機能 */}
          <div className="mb-16">
            <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">
              個人機能
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.filter(f => f.category === 'personal').map((feature, index) => (
                <div
                  key={feature.title}
                  className="bg-white rounded-xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover-lift animate-fade-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`${feature.color} mb-4`}>
                    <feature.icon className="w-10 h-10" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">
                    {feature.title}
                  </h4>
                  <p className="text-gray-600 leading-relaxed text-sm">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* チーム機能 */}
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">
              チーム機能
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.filter(f => f.category === 'team').map((feature, index) => (
                <div
                  key={feature.title}
                  className="bg-white rounded-xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover-lift animate-fade-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`${feature.color} mb-4`}>
                    <feature.icon className="w-10 h-10" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">
                    {feature.title}
                  </h4>
                  <p className="text-gray-600 leading-relaxed text-sm">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 利用シーンセクション */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              こんな方におすすめ
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              様々な利用シーンに対応しています
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {useCases.map((useCase, index) => (
              <div
                key={useCase.persona}
                className="bg-white rounded-2xl p-8 border-2 border-gray-200 hover:border-blue-300 transition-all duration-300 hover-lift animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-6">
                  <useCase.icon className="w-6 h-6 text-blue-600" />
                </div>
                <div className="text-sm font-semibold text-blue-600 mb-2">
                  {useCase.persona}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">
                  {useCase.title}
                </h3>
                <p className="text-gray-600 mb-6 leading-relaxed">
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

      {/* 特徴セクション */}
      <section className="py-20 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              安心して使える理由
            </h2>
            <p className="text-lg text-white max-w-2xl mx-auto">
              使いやすさとセキュリティを両立
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {highlights.map((highlight, index) => (
              <div
                key={highlight.title}
                className="text-center animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-16 h-16 rounded-2xl bg-blue-500 flex items-center justify-center mx-auto mb-6 shadow-xl">
                  <highlight.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">
                  {highlight.title}
                </h3>
                <p className="text-white leading-relaxed">
                  {highlight.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTAセクション */}
      <section className="py-20 bg-blue-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            今すぐ記録を始めよう
          </h2>
          <p className="text-lg sm:text-xl text-blue-100 mb-4 leading-relaxed">
            アカウント作成は無料。すぐに使い始められます。
          </p>
          <p className="text-base text-blue-200 mb-10">
            チームに所属していなくても大丈夫。まずは個人で始めて、
            <br className="hidden sm:block" />
            後からチーム機能を追加することもできます。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center bg-white text-blue-600 hover:bg-blue-50 px-8 py-4 rounded-lg text-lg font-semibold transition-all duration-200 shadow-xl hover:shadow-2xl hover-lift"
            >
              無料で始める
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
            <h3 className="text-lg font-semibold mb-3">
              SwimHub
            </h3>
            <p className="text-gray-400 mb-8 text-sm">
              水泳選手のための記録管理システム
            </p>
            <div className="text-xs text-gray-500">
              © 2025 SwimHub. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
