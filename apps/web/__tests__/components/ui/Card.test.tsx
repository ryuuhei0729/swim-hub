import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../components/ui/Card'

describe('Card', () => {
  describe('Card', () => {
    it('子要素付きでカードが表示される', () => {
      render(<Card>カードコンテンツ</Card>)
      expect(screen.getByText('カードコンテンツ')).toBeInTheDocument()
    })

    it('デフォルトスタイルが適用される', () => {
      render(<Card>カード</Card>)
      const card = screen.getByText('カード')
      expect(card).toHaveClass('rounded-lg', 'border', 'border-gray-200', 'bg-white', 'shadow-sm')
    })

    it('カスタムclassNameが適用される', () => {
      render(<Card className="custom-class">カード</Card>)
      const card = screen.getByText('カード')
      expect(card).toHaveClass('custom-class')
    })
  })

  describe('CardHeader', () => {
    it('子要素付きでカードヘッダーが表示される', () => {
      render(
        <Card>
          <CardHeader>ヘッダーコンテンツ</CardHeader>
        </Card>
      )
      expect(screen.getByText('ヘッダーコンテンツ')).toBeInTheDocument()
    })

    it('デフォルトスタイルが適用される', () => {
      render(
        <Card>
          <CardHeader>ヘッダー</CardHeader>
        </Card>
      )
      const header = screen.getByText('ヘッダー')
      expect(header).toHaveClass('flex', 'flex-col', 'space-y-1.5', 'p-3', 'sm:p-6')
    })

    it('カスタムclassNameが適用される', () => {
      render(
        <Card>
          <CardHeader className="custom-header">ヘッダー</CardHeader>
        </Card>
      )
      const header = screen.getByText('ヘッダー')
      expect(header).toHaveClass('custom-header')
    })
  })

  describe('CardTitle', () => {
    it('子要素付きでカードタイトルが表示される', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>カードタイトル</CardTitle>
          </CardHeader>
        </Card>
      )
      expect(screen.getByText('カードタイトル')).toBeInTheDocument()
    })

    it('デフォルトスタイルが適用される', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>タイトル</CardTitle>
          </CardHeader>
        </Card>
      )
      const title = screen.getByText('タイトル')
      expect(title).toHaveClass('text-lg', 'font-semibold', 'leading-none', 'tracking-tight', 'text-gray-900')
    })

    it('カスタムclassNameが適用される', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle className="custom-title">タイトル</CardTitle>
          </CardHeader>
        </Card>
      )
      const title = screen.getByText('タイトル')
      expect(title).toHaveClass('custom-title')
    })
  })

  describe('CardDescription', () => {
    it('子要素付きでカード説明が表示される', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription>カード説明</CardDescription>
          </CardHeader>
        </Card>
      )
      expect(screen.getByText('カード説明')).toBeInTheDocument()
    })

    it('デフォルトスタイルが適用される', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription>説明</CardDescription>
          </CardHeader>
        </Card>
      )
      const description = screen.getByText('説明')
      expect(description).toHaveClass('text-sm', 'text-gray-600')
    })

    it('カスタムclassNameが適用される', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription className="custom-description">説明</CardDescription>
          </CardHeader>
        </Card>
      )
      const description = screen.getByText('説明')
      expect(description).toHaveClass('custom-description')
    })
  })

  describe('CardContent', () => {
    it('子要素付きでカードコンテンツが表示される', () => {
      render(
        <Card>
          <CardContent>コンテンツ</CardContent>
        </Card>
      )
      expect(screen.getByText('コンテンツ')).toBeInTheDocument()
    })

    it('デフォルトスタイルが適用される', () => {
      render(
        <Card>
          <CardContent>コンテンツ</CardContent>
        </Card>
      )
      const content = screen.getByText('コンテンツ')
      expect(content).toHaveClass('p-3', 'pt-0', 'sm:p-6', 'sm:pt-0')
    })

    it('カスタムclassNameが適用される', () => {
      render(
        <Card>
          <CardContent className="custom-content">コンテンツ</CardContent>
        </Card>
      )
      const content = screen.getByText('コンテンツ')
      expect(content).toHaveClass('custom-content')
    })
  })

  describe('CardFooter', () => {
    it('子要素付きでカードフッターが表示される', () => {
      render(
        <Card>
          <CardFooter>フッター</CardFooter>
        </Card>
      )
      expect(screen.getByText('フッター')).toBeInTheDocument()
    })

    it('デフォルトスタイルが適用される', () => {
      render(
        <Card>
          <CardFooter>フッター</CardFooter>
        </Card>
      )
      const footer = screen.getByText('フッター')
      expect(footer).toHaveClass('flex', 'items-center', 'p-3', 'pt-0', 'sm:p-6', 'sm:pt-0')
    })

    it('カスタムclassNameが適用される', () => {
      render(
        <Card>
          <CardFooter className="custom-footer">フッター</CardFooter>
        </Card>
      )
      const footer = screen.getByText('フッター')
      expect(footer).toHaveClass('custom-footer')
    })
  })

  describe('複合使用', () => {
    it('完全なカード構造が表示される', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>タイトル</CardTitle>
            <CardDescription>説明</CardDescription>
          </CardHeader>
          <CardContent>コンテンツ</CardContent>
          <CardFooter>フッター</CardFooter>
        </Card>
      )

      expect(screen.getByText('タイトル')).toBeInTheDocument()
      expect(screen.getByText('説明')).toBeInTheDocument()
      expect(screen.getByText('コンテンツ')).toBeInTheDocument()
      expect(screen.getByText('フッター')).toBeInTheDocument()
    })
  })
})
