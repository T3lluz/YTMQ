import { expect, test } from '@playwright/test'
import { gotoApp } from './helpers/ui'

test.describe('Home', () => {
  test('shows branding and navigation actions', async ({ page }) => {
    await gotoApp(page)

    await expect(page.getByRole('heading', { name: 'YTMQ' })).toBeVisible()
    await expect(
      page.getByText('Shared queue for YouTube Music'),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Create lobby' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Join with code' })).toBeVisible()
  })

  test('navigates to join page', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('link', { name: 'Join with code' }).click()
    await expect(page).toHaveURL(/\/YTMQ\/join\/?$/)
    await expect(page.getByRole('heading', { name: 'Join lobby' })).toBeVisible()
  })

  test('create lobby opens host view', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: 'Create lobby' }).click()

    await expect(page).toHaveURL(/\/YTMQ\/host\/[0-9a-f-]{36}\/?$/, {
      timeout: 15_000,
    })
    await expect(page.getByText('Queue mirror')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible()
  })
})
