import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Button from '../../../components/ui/Button'

describe('Button', () => {
  describe('レンダリング', () => {
    it('should render button with children', () => {
      render(<Button>テストボタン</Button>)
      expect(screen.getByRole('button', { name: 'テストボタン' })).toBeInTheDocument()
    })

    it('should render with default props', () => {
      render(<Button>デフォルト</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-blue-600', 'text-white', 'h-10', 'px-4')
    })
  })

  describe('バリアント', () => {
    it('should render primary variant', () => {
      render(<Button variant="primary">プライマリ</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-blue-600', 'text-white', 'hover:bg-blue-700')
    })

    it('should render secondary variant', () => {
      render(<Button variant="secondary">セカンダリ</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-gray-600', 'text-white', 'hover:bg-gray-700')
    })

    it('should render outline variant', () => {
      render(<Button variant="outline">アウトライン</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('border', 'border-gray-300', 'bg-white', 'text-gray-700')
    })

    it('should render ghost variant', () => {
      render(<Button variant="ghost">ゴースト</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('text-gray-700', 'hover:bg-gray-100')
    })

    it('should render danger variant', () => {
      render(<Button variant="danger">危険</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('bg-red-600', 'text-white', 'hover:bg-red-700')
    })
  })

  describe('サイズ', () => {
    it('should render small size', () => {
      render(<Button size="sm">小</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('h-8', 'px-3', 'text-sm')
    })

    it('should render medium size', () => {
      render(<Button size="md">中</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('h-10', 'px-4', 'py-2')
    })

    it('should render large size', () => {
      render(<Button size="lg">大</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('h-12', 'px-6', 'text-lg')
    })
  })

  describe('ローディング状態', () => {
    it('should show loading spinner when loading', () => {
      render(<Button loading>ローディング</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
      expect(button.querySelector('svg')).toBeInTheDocument()
    })

    it('should be disabled when loading', () => {
      render(<Button loading>ローディング</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })
  })

  describe('無効状態', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Button disabled>無効</Button>)
      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('should have disabled styles when disabled', () => {
      render(<Button disabled>無効</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('disabled:pointer-events-none', 'disabled:opacity-50')
    })
  })

  describe('イベントハンドリング', () => {
    it('should call onClick when clicked', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      
      render(<Button onClick={handleClick}>クリック</Button>)
      
      const button = screen.getByRole('button')
      await user.click(button)
      
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('should not call onClick when disabled', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      
      render(<Button disabled onClick={handleClick}>無効</Button>)
      
      const button = screen.getByRole('button')
      await user.click(button)
      
      expect(handleClick).not.toHaveBeenCalled()
    })

    it('should not call onClick when loading', async () => {
      const user = userEvent.setup()
      const handleClick = vi.fn()
      
      render(<Button loading onClick={handleClick}>ローディング</Button>)
      
      const button = screen.getByRole('button')
      await user.click(button)
      
      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe('カスタムクラス', () => {
    it('should apply custom className', () => {
      render(<Button className="custom-class">カスタム</Button>)
      const button = screen.getByRole('button')
      expect(button).toHaveClass('custom-class')
    })
  })

  describe('ref', () => {
    it('should forward ref', () => {
      const ref = vi.fn()
      render(<Button ref={ref}>リファレンス</Button>)
      expect(ref).toHaveBeenCalled()
    })
  })
})
