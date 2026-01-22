import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Button from '../../../components/ui/Button'

describe('Button', () => {
  describe('レンダリング', () => {
    it('子要素付きでボタンが表示される', () => {
      render(<Button>テストボタン</Button>)
      expect(screen.getByRole('button', { name: 'テストボタン' })).toBeInTheDocument()
    })

    it('デフォルトプロパティでボタンが表示される', () => {
      render(<Button>デフォルト</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-blue-600', 'text-white', 'h-10', 'px-4')
    })
  })

  describe('バリアント', () => {
    it('プライマリバリアントが表示される', () => {
      render(<Button variant="primary">プライマリ</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-blue-600', 'text-white', 'hover:bg-blue-700')
    })

    it('セカンダリバリアントが表示される', () => {
      render(<Button variant="secondary">セカンダリ</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-gray-600', 'text-white', 'hover:bg-gray-700')
    })

    it('アウトラインバリアントが表示される', () => {
      render(<Button variant="outline">アウトライン</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('border', 'border-gray-300', 'bg-white', 'text-gray-700')
    })

    it('ゴーストバリアントが表示される', () => {
      render(<Button variant="ghost">ゴースト</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('text-gray-700', 'hover:bg-gray-100')
    })

    it('危険バリアントが表示される', () => {
      render(<Button variant="danger">危険</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-red-600', 'text-white', 'hover:bg-red-700')
    })
  })

  describe('サイズ', () => {
    it('小サイズが表示される', () => {
      render(<Button size="sm">小</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('h-8', 'px-3', 'text-xs', 'sm:text-sm')
    })

    it('中サイズが表示される', () => {
      render(<Button size="md">中</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('h-10', 'px-4', 'py-2')
    })

    it('大サイズが表示される', () => {
      render(<Button size="lg">大</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('h-12', 'px-6', 'text-base', 'sm:text-lg')
    })
  })

  describe('ローディング状態', () => {
    it('ローディング中はスピナーが表示される', () => {
      render(<Button loading>ローディング</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
      expect(button.querySelector('svg')).toBeInTheDocument()
    })

    it('ローディング中は無効になる', () => {
      render(<Button loading>ローディング</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })
  })

  describe('無効状態', () => {
    it('disabledプロパティがtrueのとき無効になる', () => {
      render(<Button disabled>無効</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('無効のとき無効スタイルが適用される', () => {
      render(<Button disabled>無効</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('disabled:pointer-events-none', 'disabled:opacity-50')
    })
  })

  describe('イベントハンドリング', () => {
    it('クリックされたときonClickが呼ばれる', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      
      render(<Button onClick={handleClick}>クリック</Button>)
      
      const button = screen.getByRole('button')
      await user.click(button)
      
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('無効のときonClickが呼ばれない', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      
      render(<Button disabled onClick={handleClick}>無効</Button>)
      
      const button = screen.getByRole('button')
      await user.click(button)
      
      expect(handleClick).not.toHaveBeenCalled()
    })

    it('ローディング中はonClickが呼ばれない', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      
      render(<Button loading onClick={handleClick}>ローディング</Button>)
      
      const button = screen.getByRole('button')
      await user.click(button)
      
      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe('カスタムクラス', () => {
    it('カスタムclassNameが適用される', () => {
      render(<Button className="custom-class">カスタム</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('custom-class')
    })
  })

  describe('ref', () => {
    it('refが転送される', () => {
      const ref = vi.fn()
      render(<Button ref={ref}>リファレンス</Button>)
      expect(ref).toHaveBeenCalled()
    })
  })
})
