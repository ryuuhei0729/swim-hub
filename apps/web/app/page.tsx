'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/contexts'
import { FullScreenLoading } from '@/components/ui/LoadingSpinner'
import { 
  UsersIcon, 
  CalendarDaysIcon, 
  ChartBarIcon, 
  TrophyIcon,
  ClipboardDocumentListIcon,
  FlagIcon,
  SpeakerWaveIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  CheckIcon
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
    return <FullScreenLoading message="水泳選手マネジメントシステムを起動中..." />
  }

  if (isAuthenticated) {
    return null
  }

  const features = [
    {
      icon: UsersIcon,
      title: '選手管理',
      description: 'チームメンバーの情報を一元管理し、プロフィールやパフォーマンスを追跡',
      color: 'text-blue-600'
    },
    {
      icon: CalendarDaysIcon,
      title: 'スケジュール管理',
      description: '練習・大会のスケジュールを効率的に管理し、チーム全体で共有',
      color: 'text-green-600'
    },
    {
      icon: ChartBarIcon,
      title: '練習記録',
      description: '日々の練習内容、タイム記録、進捗を詳細に記録・分析',
      color: 'text-purple-600'
    },
    {
      icon: TrophyIcon,
      title: '大会管理',
      description: '大会エントリーから結果管理まで、競技会関連業務を効率化',
      color: 'text-yellow-600'
    },
    {
      icon: ClipboardDocumentListIcon,
      title: '出欠管理',
      description: '練習や大会の出席状況を正確に管理し、統計データを提供',
      color: 'text-red-600'
    },
    {
      icon: FlagIcon,
      title: '目標管理',
      description: '個人・チーム目標を設定し、達成度を可視化してモチベーション向上',
      color: 'text-indigo-600'
    }
  ]

  const benefits = [
    'チーム運営の効率化',
    'データに基づく指導',
    'コミュニケーション向上',
    'パフォーマンス向上',
    '管理業務の自動化',
    'モチベーション向上'
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* ヒーローセクション */}
      <section className="relative overflow-hidden bg-gradient-to-br from-swim-50 via-blue-50 to-indigo-100">
        <div className="absolute inset-0 bg-hero-pattern opacity-5"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
          <div className="text-center">
            {/* ロゴ */}
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 flex items-center justify-center">
                <Image src="/favicon.png" alt="SwimHub" width={80} height={80} className="w-full h-full object-contain" />
              </div>
            </div>
            
            <h1 className="text-4xl sm:text-6xl font-bold text-gray-900 mb-6 animate-fade-in">
              <span className="block text-transparent bg-clip-text bg-gradient-swim">
                SwimHub
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed">
              水泳チームの選手、コーチ、監督、マネージャーが効率的にチーム運営を行える
              <br className="hidden sm:block" />
              包括的なWebアプリケーション
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <Link
                href="/login"
                className="btn-primary btn-lg group hover-lift"
              >
                ログイン
                <ArrowRightIcon className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform duration-200" />
              </Link>
              <Link
                href="/signup"
                className="btn-outline btn-lg hover-lift"
              >
                新規登録
              </Link>
            </div>

            {/* 統計情報 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-2xl mx-auto">
              <div className="text-center">
                <div className="text-3xl font-bold text-swim-600 mb-2">100+</div>
                <div className="text-gray-600">チーム導入実績</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-swim-600 mb-2">1000+</div>
                <div className="text-gray-600">アクティブユーザー</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-swim-600 mb-2">99.9%</div>
                <div className="text-gray-600">稼働率</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 機能紹介セクション */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              主要機能
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              水泳チーム運営に必要なすべての機能を一つのプラットフォームで提供
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="card hover-lift hover-glow animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="card-body">
                  <div className={`${feature.color} mb-6`}>
                    <feature.icon className="w-12 h-12" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-4">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* メリットセクション */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8">
                なぜ選ばれるのか
              </h2>
              <div className="space-y-6">
                {benefits.map((benefit, index) => (
                  <div
                    key={benefit}
                    className="flex items-center animate-fade-in"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center mr-4">
                      <CheckIcon className="w-4 h-4 text-green-600" />
                    </div>
                    <span className="text-lg text-gray-700">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="bg-gradient-to-br from-swim-500 to-swim-600 rounded-2xl p-8 text-white shadow-swim">
                <SpeakerWaveIcon className="w-12 h-12 mb-6 opacity-80" />
                <h3 className="text-2xl font-bold mb-4">
                  チーム運営を次のレベルへ
                </h3>
                <p className="text-swim-100 leading-relaxed">
                  データドリブンなアプローチで選手のパフォーマンス向上を支援し、
                  チーム全体の成長を促進します。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTAセクション */}
      <section className="py-24 bg-gradient-to-r from-swim-600 to-swim-700">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <ShieldCheckIcon className="w-16 h-16 text-swim-200 mx-auto mb-8" />
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            今すぐ始めませんか？
          </h2>
          <p className="text-xl text-swim-100 mb-10 leading-relaxed">
            無料でアカウントを作成して、チーム運営の効率化を体験してください
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="bg-white text-swim-600 hover:bg-swim-50 px-8 py-4 rounded-lg text-lg font-semibold transition-colors duration-200 hover-lift"
            >
              無料で始める
            </Link>
            <Link
              href="/login"
              className="border-2 border-swim-200 text-white hover:bg-swim-200 hover:text-swim-800 px-8 py-4 rounded-lg text-lg font-semibold transition-colors duration-200 hover-lift"
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
              <div className="w-12 h-12 flex items-center justify-center mr-1">
                <Image src="/favicon.png" alt="SwimHub" width={48} height={48} className="w-full h-full object-contain" />
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-4">
              水泳選手マネジメントシステム
            </h3>
            <p className="text-gray-400 mb-8">
              すべての水泳チームの成功をサポートします
            </p>
            <div className="text-sm text-gray-500">
              © 2025 水泳選手マネジメントシステム. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
