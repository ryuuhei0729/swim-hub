'use client'

import React from 'react'
import { CheckIcon } from '@heroicons/react/24/solid'
import { cn } from '@/utils'

export interface FormStep {
  id: string
  label: string
  description?: string
}

interface FormStepperProps {
  steps: FormStep[]
  currentStep: number
  onStepClick?: (stepIndex: number) => void
  allowClickNavigation?: boolean
  className?: string
}

export default function FormStepper({
  steps,
  currentStep,
  onStepClick,
  allowClickNavigation = false,
  className
}: FormStepperProps) {
  const handleStepClick = (index: number) => {
    if (!allowClickNavigation || !onStepClick) return
    // 完了済みのステップのみクリック可能
    if (index < currentStep) {
      onStepClick(index)
    }
  }

  return (
    <nav aria-label="フォームの進捗" className={className}>
      {/* モバイル向け: コンパクトな表示 */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            ステップ {currentStep + 1} / {steps.length}
          </span>
          <span className="text-sm text-gray-500">
            {steps[currentStep]?.label}
          </span>
        </div>
        <div className="overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-2 rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* デスクトップ向け: ステッパー表示 */}
      <ol className="hidden sm:flex items-center w-full">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep
          const isCurrent = index === currentStep
          const isClickable = allowClickNavigation && isCompleted

          return (
            <li
              key={step.id}
              className={cn(
                'flex items-center',
                index < steps.length - 1 && 'flex-1'
              )}
            >
              <button
                type="button"
                onClick={() => handleStepClick(index)}
                disabled={!isClickable}
                className={cn(
                  'flex items-center gap-3 group',
                  isClickable && 'cursor-pointer',
                  !isClickable && 'cursor-default'
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {/* ステップ番号 / チェックマーク */}
                <span
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-full border-2 text-sm font-medium transition-colors',
                    isCompleted && 'bg-blue-600 border-blue-600 text-white',
                    isCurrent && 'border-blue-600 text-blue-600 bg-blue-50',
                    !isCompleted && !isCurrent && 'border-gray-300 text-gray-500',
                    isClickable && 'group-hover:bg-blue-700 group-hover:border-blue-700'
                  )}
                >
                  {isCompleted ? (
                    <CheckIcon className="w-5 h-5" aria-hidden="true" />
                  ) : (
                    index + 1
                  )}
                </span>

                {/* ラベル */}
                <div className="flex flex-col items-start">
                  <span
                    className={cn(
                      'text-sm font-medium transition-colors',
                      isCompleted && 'text-blue-600',
                      isCurrent && 'text-blue-600',
                      !isCompleted && !isCurrent && 'text-gray-500',
                      isClickable && 'group-hover:text-blue-700'
                    )}
                  >
                    {step.label}
                  </span>
                  {step.description && (
                    <span className="text-xs text-gray-400">
                      {step.description}
                    </span>
                  )}
                </div>
              </button>

              {/* 接続線 */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-4 transition-colors',
                    isCompleted ? 'bg-blue-600' : 'bg-gray-300'
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ステップナビゲーション用のヘルパーフック
export function useFormSteps(totalSteps: number, initialStep = 0) {
  const [currentStep, setCurrentStep] = React.useState(initialStep)

  const nextStep = React.useCallback(() => {
    setCurrentStep(prev => Math.min(prev + 1, totalSteps - 1))
  }, [totalSteps])

  const prevStep = React.useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }, [])

  const goToStep = React.useCallback((step: number) => {
    if (step >= 0 && step < totalSteps) {
      setCurrentStep(step)
    }
  }, [totalSteps])

  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === totalSteps - 1
  const progress = ((currentStep + 1) / totalSteps) * 100

  return {
    currentStep,
    nextStep,
    prevStep,
    goToStep,
    isFirstStep,
    isLastStep,
    progress
  }
}
