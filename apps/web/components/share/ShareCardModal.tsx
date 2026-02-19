'use client'

import { useState, useRef, useCallback } from 'react'
import { CompetitionShareCard } from './CompetitionShareCard'
import { PracticeShareCard } from './PracticeShareCard'
import type { CompetitionShareData, PracticeShareData } from './types'
import { elementToImage, downloadImage } from './utils'

type ShareCardType = 'competition' | 'practice'

interface ShareCardModalProps {
  isOpen: boolean
  onClose: () => void
  type: ShareCardType
  data: CompetitionShareData | PracticeShareData
}

/**
 * シェアカードモーダル
 * プレビューと画像ダウンロード機能を提供
 */
export function ShareCardModal({
  isOpen,
  onClose,
  type,
  data,
}: ShareCardModalProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return

    setIsGenerating(true)
    try {
      const dataUrl = await elementToImage(cardRef.current, 3) // 高解像度用に3倍スケール
      const filename =
        type === 'competition'
          ? `swimhub-record-${Date.now()}.png`
          : `swimhub-practice-${Date.now()}.png`
      downloadImage(dataUrl, filename)
    } catch (error) {
      console.error('画像生成に失敗しました:', error)
    } finally {
      setIsGenerating(false)
    }
  }, [type])

  const handleShare = useCallback(async () => {
    if (!cardRef.current) return

    // Web Share APIが利用可能かチェック
    if (!navigator.share || !navigator.canShare) {
      // フォールバック：ダウンロードを促す
      handleDownload()
      return
    }

    setIsGenerating(true)
    try {
      const dataUrl = await elementToImage(cardRef.current, 3)
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'swimhub-share.png', { type: 'image/png' })

      if (navigator.canShare({ files: [file] })) {
        const shareText =
          type === 'competition'
            ? '【Swimhub】\n大会記録をシェアしました！\n\n水泳記録管理アプリ「SwimHub」で記録を管理しよう!\nhttps://swim-hub.app'
            : '【Swimhub】\n練習記録をシェアしました！\n\n水泳記録管理アプリ「SwimHub」で練習を記録しよう!\nhttps://swim-hub.app'

        await navigator.share({
          files: [file],
          title: 'SwimHub',
          text: shareText,
        })
      } else {
        // ファイル共有がサポートされていない場合はダウンロード
        handleDownload()
      }
    } catch (error) {
      // ユーザーがキャンセルした場合はエラーを無視
      if ((error as Error).name !== 'AbortError') {
        console.error('共有に失敗しました:', error)
      }
    } finally {
      setIsGenerating(false)
    }
  }, [type, handleDownload])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        tabIndex={0}
        aria-label="モーダルを閉じる"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onClose()
          }
        }}
      />

      {/* モーダルコンテンツ */}
      <div className="relative z-10 bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">
            {type === 'competition' ? '記録をシェア' : '練習メニューをシェア'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
            aria-label="閉じる"
          >
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* プレビュー */}
        <div className="p-4 flex justify-center overflow-y-auto max-h-[60vh]">
          <div className="transform scale-[0.8] origin-top">
            {type === 'competition' ? (
              <CompetitionShareCard
                ref={cardRef}
                data={data as CompetitionShareData}
              />
            ) : (
              <PracticeShareCard
                ref={cardRef}
                data={data as PracticeShareData}
              />
            )}
          </div>
        </div>

        {/* アクションボタン */}
        <div className="p-4 border-t border-gray-800 flex gap-3">
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <svg
                className="w-5 h-5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
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
            )}
            <span>保存</span>
          </button>

          <button
            onClick={handleShare}
            disabled={isGenerating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-800 hover:bg-blue-700 text-white font-medium transition-all disabled:opacity-50"
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
            <span>シェア</span>
          </button>
        </div>
      </div>
    </div>
  )
}
