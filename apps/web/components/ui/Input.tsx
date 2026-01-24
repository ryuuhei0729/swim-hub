'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { cn } from '@/utils'
import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'

export type ValidationTrigger = 'blur' | 'change'

export interface ValidationRule {
  validate: (value: string) => boolean
  message: string
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  /** バリデーションルール（リアルタイムバリデーション用） */
  validationRules?: ValidationRule[]
  /** バリデーションのトリガータイミング */
  validateOn?: ValidationTrigger
  /** 成功状態を表示するか */
  showSuccessState?: boolean
  /** 外部からバリデーション状態を制御 */
  isValid?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({
    className,
    type,
    label,
    error: externalError,
    helperText,
    id,
    validationRules,
    validateOn = 'blur',
    showSuccessState = false,
    isValid: externalIsValid,
    onBlur,
    onChange,
    ...props
  }, ref) => {
    const [generatedId] = useState(() => `input-${Math.random().toString(36).substring(2, 9)}`)
    const inputId = id || generatedId
    const errorId = `${inputId}-error`
    const helperId = `${inputId}-helper`

    const [internalError, setInternalError] = useState<string | null>(null)
    const [touched, setTouched] = useState(false)
    const [value, setValue] = useState<string>(
      typeof props.value === 'string' ? props.value :
      typeof props.value === 'number' ? String(props.value) :
      typeof props.defaultValue === 'string' ? props.defaultValue :
      typeof props.defaultValue === 'number' ? String(props.defaultValue) : ''
    )

    // props.value が変更されたときに内部 state を同期
    useEffect(() => {
      if (props.value !== undefined) {
        const newValue = typeof props.value === 'string' ? props.value : String(props.value)
        setValue(newValue)

        // バリデーションルールがあり、touched 状態の場合は再バリデーション
        if (validationRules && touched) {
          let validationError: string | null = null
          for (const rule of validationRules) {
            if (!rule.validate(newValue)) {
              validationError = rule.message
              break
            }
          }
          setInternalError(validationError)
        }
      }
    }, [props.value, validationRules, touched])

    // バリデーション実行
    const runValidation = useCallback((inputValue: string): string | null => {
      if (!validationRules || validationRules.length === 0) return null

      for (const rule of validationRules) {
        if (!rule.validate(inputValue)) {
          return rule.message
        }
      }
      return null
    }, [validationRules])

    // blurハンドラー
    const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
      setTouched(true)
      const inputValue = e.target.value

      if (validateOn === 'blur' && validationRules) {
        const validationError = runValidation(inputValue)
        setInternalError(validationError)
      }

      onBlur?.(e)
    }, [validateOn, validationRules, runValidation, onBlur])

    // changeハンドラー
    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value
      setValue(inputValue)

      if (validateOn === 'change' && validationRules) {
        setTouched(true)
        const validationError = runValidation(inputValue)
        setInternalError(validationError)
      } else if (validateOn === 'blur' && internalError && validationRules) {
        // blur後に入力を続けた場合、エラーをリアルタイムでクリア
        const validationError = runValidation(inputValue)
        if (!validationError) {
          setInternalError(null)
        }
      }

      onChange?.(e)
    }, [validateOn, validationRules, runValidation, onChange, internalError])

    // エラー状態の決定（外部エラー優先）
    const displayError = externalError || internalError
    const hasError = !!displayError

    // 成功状態の決定
    const isValidState = externalIsValid !== undefined
      ? externalIsValid
      : (touched && !hasError && value.length > 0 && validationRules && validationRules.length > 0)

    // aria-describedbyの構築
    const describedBy = [
      hasError ? errorId : null,
      helperText && !hasError ? helperId : null
    ].filter(Boolean).join(' ') || undefined

    return (
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700"
          >
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            type={type}
            id={inputId}
            className={cn(
              'flex h-10 w-full rounded-md border bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
              hasError && 'border-red-500 focus:ring-red-500 pr-10',
              !hasError && isValidState && showSuccessState && 'border-green-500 focus:ring-green-500 pr-10',
              !hasError && !isValidState && 'border-gray-300 focus:ring-blue-500',
              className
            )}
            ref={ref}
            aria-invalid={hasError}
            aria-describedby={describedBy}
            onBlur={handleBlur}
            onChange={handleChange}
            {...props}
          />
          {/* バリデーション状態アイコン */}
          {hasError && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <ExclamationCircleIcon className="h-5 w-5 text-red-500" aria-hidden="true" />
            </div>
          )}
          {!hasError && isValidState && showSuccessState && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <CheckCircleIcon className="h-5 w-5 text-green-500" aria-hidden="true" />
            </div>
          )}
        </div>
        {hasError && (
          <p
            id={errorId}
            className="text-sm text-red-600 flex items-center gap-1"
            role="alert"
          >
            {displayError}
          </p>
        )}
        {helperText && !hasError && (
          <p id={helperId} className="text-sm text-gray-500">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export default Input

// バリデーションルールのヘルパー関数
export const validationHelpers = {
  required: (message = '必須項目です'): ValidationRule => ({
    validate: (value) => value.trim().length > 0,
    message
  }),
  minLength: (min: number, message?: string): ValidationRule => ({
    validate: (value) => value.length >= min,
    message: message || `${min}文字以上で入力してください`
  }),
  maxLength: (max: number, message?: string): ValidationRule => ({
    validate: (value) => value.length <= max,
    message: message || `${max}文字以下で入力してください`
  }),
  email: (message = '有効なメールアドレスを入力してください'): ValidationRule => ({
    validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message
  }),
  pattern: (regex: RegExp, message: string): ValidationRule => ({
    validate: (value) => regex.test(value),
    message
  }),
  numeric: (message = '数値を入力してください'): ValidationRule => ({
    validate: (value) => /^\d*$/.test(value),
    message
  })
}
