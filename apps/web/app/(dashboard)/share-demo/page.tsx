'use client'

import { useState, useRef } from 'react'
import {
  CompetitionShareCard,
  PracticeShareCard,
  ShareCardModal,
  elementToImage,
  downloadImage,
} from '@/components/share'
import type { CompetitionShareData, PracticeShareData } from '@/components/share'

// サンプルデータ：大会記録
const sampleCompetitionData: CompetitionShareData = {
  competitionName: '第45回 全国マスターズ水泳大会',
  date: '2024年8月15日',
  place: '東京辰巳国際水泳場',
  poolType: 'long',
  eventName: '100m 自由形',
  raceDistance: 100,
  time: 54.32,
  rank: 3,
  reactionTime: 0.68,
  splitTimes: [
    { id: '1', record_id: 'demo', distance: 50, split_time: 26.15, created_at: '' },
    { id: '2', record_id: 'demo', distance: 100, split_time: 54.32, created_at: '' },
  ],
  isBestTime: true,
  previousBest: 55.01,
  userName: '山田 太郎',
  teamName: '東京スイミングクラブ',
}

// サンプルデータ：練習メニュー
const samplePracticeData: PracticeShareData = {
  date: '2024年8月20日（火）',
  title: '朝練 スプリント強化',
  place: '市民プール（25m）',
  menuItems: [
    {
      style: 'Fr',
      category: 'Swim',
      distance: 100,
      repCount: 4,
      setCount: 1,
      circle: 90,
      note: 'ウォームアップ',
    },
    {
      style: 'IM',
      category: 'Swim',
      distance: 100,
      repCount: 4,
      setCount: 1,
      circle: 120,
    },
    {
      style: 'Fr',
      category: 'Kick',
      distance: 50,
      repCount: 8,
      setCount: 1,
      circle: 60,
    },
    {
      style: 'Fr',
      category: 'Pull',
      distance: 100,
      repCount: 4,
      setCount: 2,
      circle: 100,
    },
    {
      style: 'Fr',
      category: 'Swim',
      distance: 50,
      repCount: 8,
      setCount: 2,
      circle: 50,
      times: [
        { setNumber: 1, repNumber: 1, time: 28.5 },
        { setNumber: 1, repNumber: 2, time: 28.8 },
        { setNumber: 1, repNumber: 3, time: 29.1 },
        { setNumber: 1, repNumber: 4, time: 28.3 },
        { setNumber: 1, repNumber: 5, time: 28.9 },
        { setNumber: 1, repNumber: 6, time: 29.2 },
        { setNumber: 1, repNumber: 7, time: 28.6 },
        { setNumber: 1, repNumber: 8, time: 28.1 },
      ],
      note: 'メインセット - 全力',
    },
    {
      style: 'Fr',
      category: 'Swim',
      distance: 200,
      repCount: 1,
      setCount: 1,
      note: 'クールダウン',
    },
  ],
  totalDistance: 2600,
  totalSets: 7,
  userName: '山田 太郎',
  teamName: '東京スイミングクラブ',
}

export default function ShareDemoPage() {
  const [activeTab, setActiveTab] = useState<'competition' | 'practice'>('competition')
  const [showModal, setShowModal] = useState(false)
  const competitionCardRef = useRef<HTMLDivElement>(null)
  const practiceCardRef = useRef<HTMLDivElement>(null)

  const handleDirectDownload = async () => {
    const ref = activeTab === 'competition' ? competitionCardRef : practiceCardRef
    if (!ref.current) return

    try {
      const dataUrl = await elementToImage(ref.current, 3)
      const filename =
        activeTab === 'competition'
          ? `swimhub-record-${Date.now()}.png`
          : `swimhub-practice-${Date.now()}.png`
      downloadImage(dataUrl, filename)
    } catch (error) {
      console.error('画像生成に失敗しました:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            シェアカード デモ
          </h1>
          <p className="text-gray-600">
            Instagram Story用のシェアカードをプレビュー・ダウンロードできます
          </p>
        </div>

        {/* タブ切り替え */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-lg bg-gray-200 p-1">
            <button
              onClick={() => setActiveTab('competition')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'competition'
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              大会記録
            </button>
            <button
              onClick={() => setActiveTab('practice')}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'practice'
                  ? 'bg-white text-gray-900 shadow'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              練習メニュー
            </button>
          </div>
        </div>

        {/* メインコンテンツ */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* カードプレビュー */}
          <div className="flex justify-center">
            <div className="rounded-2xl shadow-2xl overflow-hidden">
              {activeTab === 'competition' ? (
                <CompetitionShareCard
                  ref={competitionCardRef}
                  data={sampleCompetitionData}
                />
              ) : (
                <PracticeShareCard
                  ref={practiceCardRef}
                  data={samplePracticeData}
                />
              )}
            </div>
          </div>

          {/* 操作パネル */}
          <div className="space-y-6">
            {/* 説明 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {activeTab === 'competition' ? '大会記録カード' : '練習メニューカード'}
              </h2>
              <p className="text-gray-600 mb-4">
                {activeTab === 'competition'
                  ? 'スプリットタイム、ラップタイム、リアクションタイムを含む大会記録をスタイリッシュにシェアできます。自己ベスト更新時は特別なバッジが表示されます。'
                  : '練習メニューと記録したタイムをまとめてシェアできます。合計距離やセット数も自動で計算されます。'}
              </p>

              {/* 含まれる情報 */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700">含まれる情報:</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  {activeTab === 'competition' ? (
                    <>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                        大会名・日付・会場
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                        種目・記録タイム・順位
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                        リアクションタイム
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                        スプリット/ラップタイム
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                        自己ベスト更新幅
                      </li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                        日付・タイトル・場所
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                        合計距離・セット数
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                        各メニューの詳細
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                        記録したタイム
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
                        今日のハイライト
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>

            {/* アクションボタン */}
            <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                アクション
              </h2>

              <button
                onClick={handleDirectDownload}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-medium transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span>画像をダウンロード</span>
              </button>

              <button
                onClick={() => setShowModal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium transition-all"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                <span>モーダルでシェア</span>
              </button>
            </div>

            {/* 仕様 */}
            <div className="bg-blue-50 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">
                Instagram Story向け仕様
              </h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>・サイズ: 1080 × 1920 px（9:16）</li>
                <li>・高解像度PNG形式</li>
                <li>・Web Share API対応</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* シェアモーダル */}
      <ShareCardModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        type={activeTab}
        data={activeTab === 'competition' ? sampleCompetitionData : samplePracticeData}
      />
    </div>
  )
}
