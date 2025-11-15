import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Input from '../../../components/ui/Input'

describe('Input', () => {
  describe('レンダリング', () => {
    it('should render input without label', () => {
      render(<Input placeholder="プレースホルダー" />)
      const input = screen.getByPlaceholderText('プレースホルダー')
      expect(input).toBeInTheDocument()
    })

    it('should render input with label', () => {
      render(<Input label="テストラベル" />)
      expect(screen.getByText('テストラベル')).toBeInTheDocument()
      expect(screen.getByLabelText('テストラベル')).toBeInTheDocument()
    })

    it('should render required indicator', () => {
      render(<Input label="必須フィールド" required />)
      expect(screen.getByText('*')).toBeInTheDocument()
    })
  })

  describe('入力', () => {
    it('should handle text input', async () => {
      const user = userEvent.setup()
      
      render(<Input placeholder="入力してください" />)
      
      const input = screen.getByPlaceholderText('入力してください')
      await user.type(input, 'テスト入力')
      
      expect(input).toHaveValue('テスト入力')
    })

    it('should handle controlled input', () => {
      const handleChange = vi.fn()
      
      render(<Input value="初期値" onChange={handleChange} />)
      
      const input = screen.getByDisplayValue('初期値')
      expect(input).toHaveValue('初期値')
    })
  })

  describe('エラー状態', () => {
    it('should show error message', () => {
      render(<Input error="エラーメッセージ" />)
      expect(screen.getByText('エラーメッセージ')).toBeInTheDocument()
    })

    it('should apply error styles', () => {
      render(<Input error="エラーメッセージ" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('border-red-500', 'focus:ring-red-500')
    })

    it('should not show helper text when error is present', () => {
      render(<Input error="エラーメッセージ" helperText="ヘルプテキスト" />)
      expect(screen.queryByText('ヘルプテキスト')).not.toBeInTheDocument()
    })
  })

  describe('ヘルパーテキスト', () => {
    it('should show helper text when no error', () => {
      render(<Input helperText="ヘルプテキスト" />)
      expect(screen.getByText('ヘルプテキスト')).toBeInTheDocument()
    })

    it('should not show helper text when error is present', () => {
      render(<Input error="エラーメッセージ" helperText="ヘルプテキスト" />)
      expect(screen.queryByText('ヘルプテキスト')).not.toBeInTheDocument()
    })
  })

  describe('無効状態', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Input disabled />)
      const input = screen.getByRole('textbox')
      expect(input).toBeDisabled()
    })

    it('should have disabled styles when disabled', () => {
      render(<Input disabled />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50')
    })
  })

  describe('イベントハンドリング', () => {
    it('should call onChange when input changes', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()
      
      render(<Input onChange={handleChange} />)
      
      const input = screen.getByRole('textbox')
      await user.type(input, 'テスト')
      
      expect(handleChange).toHaveBeenCalled()
    })

    it('should call onFocus when focused', async () => {
      const user = userEvent.setup()
      const handleFocus = vi.fn()
      
      render(<Input onFocus={handleFocus} />)
      
      const input = screen.getByRole('textbox')
      await user.click(input)
      
      expect(handleFocus).toHaveBeenCalled()
    })

    it('should call onBlur when blurred', async () => {
      const user = userEvent.setup()
      const handleBlur = vi.fn()
      
      render(<Input onBlur={handleBlur} />)
      
      const input = screen.getByRole('textbox')
      await user.click(input)
      await user.tab()
      
      expect(handleBlur).toHaveBeenCalled()
    })
  })

  describe('タイプ', () => {
    it('should render email input', () => {
      render(<Input type="email" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('type', 'email')
    })

    it('should render password input', () => {
      render(<Input type="password" />)
      const input = screen.getByDisplayValue('')
      expect(input).toHaveAttribute('type', 'password')
    })

    it('should render number input', () => {
      render(<Input type="number" />)
      const input = screen.getByRole('spinbutton')
      expect(input).toHaveAttribute('type', 'number')
    })
  })

  describe('カスタムクラス', () => {
    it('should apply custom className', () => {
      render(<Input className="custom-class" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('custom-class')
    })
  })

  describe('ref', () => {
    it('should forward ref', () => {
      const ref = vi.fn()
      render(<Input ref={ref} />)
      expect(ref).toHaveBeenCalled()
    })
  })

  describe('ID生成', () => {
    it('should generate unique ID when not provided', () => {
      render(<Input label="ラベル" />)
      const input = screen.getByLabelText('ラベル')
      expect(input).toHaveAttribute('id')
    })

    it('should use provided ID', () => {
      render(<Input id="custom-id" label="ラベル" />)
      const input = screen.getByLabelText('ラベル')
      expect(input).toHaveAttribute('id', 'custom-id')
    })
  })
})
