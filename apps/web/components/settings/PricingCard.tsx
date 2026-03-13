'use client'

import React from 'react'

interface PricingCardProps {
  title: string
  price: string
  period: string
  badge?: string
  features: string[]
  onSelect: () => void
  isLoading: boolean
  isCurrentPlan: boolean
}

export default function PricingCard({
  title,
  price,
  period,
  badge,
  features,
  onSelect,
  isLoading,
  isCurrentPlan,
}: PricingCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!isCurrentPlan && !isLoading) {
        onSelect()
      }
    }
  }

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-5 sm:p-6 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        {badge && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            {badge}
          </span>
        )}
      </div>

      <div className="mb-4">
        <span className="text-3xl font-bold text-gray-900">{price}</span>
        <span className="text-sm text-gray-500">{period}</span>
      </div>

      <ul className="space-y-2 mb-6 flex-1">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
            <svg
              className="h-5 w-5 text-green-500 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {feature}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        disabled={isCurrentPlan || isLoading}
        aria-label={isCurrentPlan ? '現在のプラン' : `${title}を選択`}
        className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            処理中...
          </>
        ) : isCurrentPlan ? (
          '現在のプラン'
        ) : (
          'このプランを選択'
        )}
      </button>
    </div>
  )
}
