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
  /** スキップされたステップのインデックス配列（グレーアウト＋取り消し線で表示） */
  skippedSteps?: number[]
}

const EMPTY_SKIPPED_STEPS: number[] = []

export default function FormStepper({
  steps,
  currentStep,
  onStepClick,
  allowClickNavigation = false,
  className,
  skippedSteps = EMPTY_SKIPPED_STEPS
}: FormStepperProps) {
  // Guard: return null if no steps
  if (steps.length === 0) {
    return null
  }

  // Clamp currentStep to valid range [0, steps.length - 1]
  const clampedStep = Math.max(0, Math.min(currentStep, steps.length - 1))

  const handleStepClick = (index: number) => {
    if (!allowClickNavigation || !onStepClick) return
    // 完了済みのステップのみクリック可能
    if (index < clampedStep) {
      onStepClick(index)
    }
  }

  // Safe division for progress width
  const progressWidth = ((clampedStep + 1) / Math.max(1, steps.length)) * 100

  return (
    <nav aria-label="フォームの進捗" className={className}>
      {/* モバイル向け: コンパクトな表示 */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            ステップ {clampedStep + 1} / {steps.length}
          </span>
          <span className="text-sm text-gray-500">
            {steps[clampedStep]?.label}
          </span>
        </div>
        <div className="overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-2 rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>

      {/* デスクトップ向け: ステッパー表示 */}
      <ol className="hidden sm:flex items-center w-full">
        {steps.map((step, index) => {
          const isSkipped = skippedSteps.includes(index)
          const isCompleted = index < clampedStep && !isSkipped
          const isCurrent = index === clampedStep
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
                disabled={!isClickable || isSkipped}
                className={cn(
                  'flex items-center gap-3 group',
                  isClickable && !isSkipped && 'cursor-pointer',
                  (!isClickable || isSkipped) && 'cursor-default'
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {/* ステップ番号 / チェックマーク */}
                <span
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-full border-2 text-sm font-medium transition-colors',
                    isSkipped && 'bg-gray-100 border-gray-300 text-gray-400',
                    !isSkipped && isCompleted && 'bg-blue-600 border-blue-600 text-white',
                    !isSkipped && isCurrent && 'border-blue-600 text-blue-600 bg-blue-50',
                    !isSkipped && !isCompleted && !isCurrent && 'border-gray-300 text-gray-500',
                    isClickable && !isSkipped && 'group-hover:bg-blue-700 group-hover:border-blue-700'
                  )}
                >
                  {isCompleted && !isSkipped ? (
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
                      isSkipped && 'text-gray-400 line-through',
                      !isSkipped && isCompleted && 'text-blue-600',
                      !isSkipped && isCurrent && 'text-blue-600',
                      !isSkipped && !isCompleted && !isCurrent && 'text-gray-500',
                      isClickable && !isSkipped && 'group-hover:text-blue-700'
                    )}
                  >
                    {step.label}
                  </span>
                  {step.description && (
                    <span className={cn(
                      'text-xs',
                      isSkipped ? 'text-gray-300 line-through' : 'text-gray-400'
                    )}>
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
                    isCompleted && !isSkipped ? 'bg-blue-600' : 'bg-gray-300'
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
  // Ensure totalSteps is at least 0
  const safeTotalSteps = Math.max(0, totalSteps)
  // Clamp initialStep to valid range
  const safeInitialStep = safeTotalSteps > 0
    ? Math.max(0, Math.min(initialStep, safeTotalSteps - 1))
    : 0

  const [currentStep, setCurrentStep] = React.useState(safeInitialStep)

  const nextStep = React.useCallback(() => {
    setCurrentStep(prev => Math.min(prev + 1, Math.max(0, safeTotalSteps - 1)))
  }, [safeTotalSteps])

  const prevStep = React.useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0))
  }, [])

  const goToStep = React.useCallback((step: number) => {
    if (safeTotalSteps > 0 && step >= 0 && step < safeTotalSteps) {
      setCurrentStep(step)
    }
  }, [safeTotalSteps])

  const isFirstStep = currentStep === 0
  const isLastStep = safeTotalSteps > 0 ? currentStep === safeTotalSteps - 1 : true
  const progress = ((currentStep + 1) / Math.max(1, safeTotalSteps)) * 100

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
