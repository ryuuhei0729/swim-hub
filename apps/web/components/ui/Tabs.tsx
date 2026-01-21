'use client'

import React from 'react'

export interface Tab {
  id: string
  label: string
}

interface TabsProps {
  tabs: Tab[]
  activeTabId: string
  onTabChange: (tabId: string) => void
  className?: string
}

export function Tabs({ tabs, activeTabId, onTabChange, className = '' }: TabsProps) {
  return (
    <div className={`border-b border-gray-200 ${className}`}>
      <nav className="-mb-px flex space-x-4 sm:space-x-8" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <button
              key={tab.id}
              type="button"
              onClick={(e) => {
                e.preventDefault()
                onTabChange(tab.id)
              }}
              className={`
                whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors
                ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

