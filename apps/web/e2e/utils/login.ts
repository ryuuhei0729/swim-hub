import type { Page } from '@playwright/test'
import { TEST_USERS } from './test-helpers'

const DEFAULT_BASE_URL = 'http://localhost:3000'

function resolveUrl(path: string): string {
  const base =
    process.env.E2E_BASE_URL ||
    process.env.PLAYWRIGHT_BASE_URL ||
    process.env.BASE_URL ||
    DEFAULT_BASE_URL

  return new URL(path, base).toString()
}

export async function memberLogin(page: Page): Promise<void> {
  await page.goto(resolveUrl('/login'))
  await page.getByTestId('email-input').fill(TEST_USERS.VALID_USER.email)
  await page.getByTestId('password-input').fill(TEST_USERS.VALID_USER.password)
  await page.getByTestId('login-button').click()
  await page.waitForURL(resolveUrl('/dashboard'), { timeout: 10_000 })
  await page.waitForLoadState('networkidle')
}

