import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Input from '../../../components/ui/Input'

describe('Input', () => {
  describe('レンダリング', () => {
    it('ラベルなしで入力フィールドが表示される', () => {
      render(<Input placeholder="プレースホルダー" />)
      const input = screen.getByPlaceholderText('プレースホルダー')
      expect(input).toBeInTheDocument()
    })

    it('ラベル付きで入力フィールドが表示される', () => {
      render(<Input label="テストラベル" />)
      expect(screen.getByText('テストラベル')).toBeInTheDocument()
      expect(screen.getByLabelText('テストラベル')).toBeInTheDocument()
    })

    it('必須マーカーが表示される', () => {
      render(<Input label="必須フィールド" required />)
      expect(screen.getByText('*')).toBeInTheDocument()
    })
  })

  describe('入力', () => {
    it('テキスト入力が処理される', async () => {
      const user = userEvent.setup()
      
      render(<Input placeholder="入力してください" />)
      
      const input = screen.getByPlaceholderText('入力してください')
      await user.type(input, 'テスト入力')
      
      expect(input).toHaveValue('テスト入力')
    })

    it('制御された入力が処理される', () => {
      const handleChange = vi.fn()
      
      render(<Input value="初期値" onChange={handleChange} />)
      
      const input = screen.getByDisplayValue('初期値')
      expect(input).toHaveValue('初期値')
    })
  })

  describe('エラー状態', () => {
    it('エラーメッセージが表示される', () => {
      render(<Input error="エラーメッセージ" />)
      expect(screen.getByText('エラーメッセージ')).toBeInTheDocument()
    })

    it('エラースタイルが適用される', () => {
      render(<Input error="エラーメッセージ" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('border-red-500', 'focus:ring-red-500')
    })

    it('エラーがあるときヘルパーテキストが表示されない', () => {
      render(<Input error="エラーメッセージ" helperText="ヘルプテキスト" />)
      expect(screen.queryByText('ヘルプテキスト')).not.toBeInTheDocument()
    })
  })

  describe('ヘルパーテキスト', () => {
    it('エラーがないときヘルパーテキストが表示される', () => {
      render(<Input helperText="ヘルプテキスト" />)
      expect(screen.getByText('ヘルプテキスト')).toBeInTheDocument()
    })

    it('エラーがあるときヘルパーテキストが表示されない', () => {
      render(<Input error="エラーメッセージ" helperText="ヘルプテキスト" />)
      expect(screen.queryByText('ヘルプテキスト')).not.toBeInTheDocument()
    })
  })

  describe('無効状態', () => {
    it('disabledプロパティがtrueのとき無効になる', () => {
      render(<Input disabled />)
      const input = screen.getByRole('textbox')
      expect(input).toBeDisabled()
    })

    it('無効のとき無効スタイルが適用される', () => {
      render(<Input disabled />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50')
    })
  })

  describe('イベントハンドリング', () => {
    it('入力が変更されたときonChangeが呼ばれる', async () => {
      const user = userEvent.setup()
      const handleChange = vi.fn()
      
      render(<Input onChange={handleChange} />)
      
      const input = screen.getByRole('textbox')
      await user.type(input, 'テスト')
      
      expect(handleChange).toHaveBeenCalled()
    })

    it('フォーカスされたときonFocusが呼ばれる', async () => {
      const user = userEvent.setup()
      const handleFocus = vi.fn()
      
      render(<Input onFocus={handleFocus} />)
      
      const input = screen.getByRole('textbox')
      await user.click(input)
      
      expect(handleFocus).toHaveBeenCalled()
    })

    it('フォーカスが外れたときonBlurが呼ばれる', async () => {
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
    it('メール入力フィールドが表示される', () => {
      render(<Input type="email" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('type', 'email')
    })

    it('パスワード入力フィールドが表示される', () => {
      render(<Input type="password" />)
      const input = screen.getByDisplayValue('')
      expect(input).toHaveAttribute('type', 'password')
    })

    it('数値入力フィールドが表示される', () => {
      render(<Input type="number" />)
      const input = screen.getByRole('spinbutton')
      expect(input).toHaveAttribute('type', 'number')
    })
  })

  describe('カスタムクラス', () => {
    it('カスタムclassNameが適用される', () => {
      render(<Input className="custom-class" />)
      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('custom-class')
    })
  })

  describe('ref', () => {
    it('refが転送される', () => {
      const ref = vi.fn()
      render(<Input ref={ref} />)
      expect(ref).toHaveBeenCalled()
    })
  })

  describe('ID生成', () => {
    it('IDが指定されていないときユニークなIDが生成される', () => {
      render(<Input label="ラベル" />)
      const input = screen.getByLabelText('ラベル')
      expect(input).toHaveAttribute('id')
    })

    it('指定されたIDが使用される', () => {
      render(<Input id="custom-id" label="ラベル" />)
      const input = screen.getByLabelText('ラベル')
      expect(input).toHaveAttribute('id', 'custom-id')
    })
  })
})
