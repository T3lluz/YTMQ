import { expect, test } from '@playwright/test'
import { gotoApp } from './helpers/ui'

test.describe('Home', () => {
  test('shows branding and navigation actions', async ({ page }) => {
    await gotoApp(page)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Everyone picks/)
    await expect(
      page.getByRole('button', { name: 'Host a lobby' }),
    ).toBeVisible()
    await expect(page.getByLabel('Lobby code')).toBeVisible()
  })

  test('a code on the homepage opens the join form with it filled in', async ({ page }) => {
    await gotoApp(page)
    await page.getByLabel('Lobby code').fill('abc123')
    await page.getByRole('button', { name: 'Join' }).click()
    await expect(page).toHaveURL(/\/ytmq\/join\?code=ABC123$/)
    await expect(page.getByRole('heading', { name: 'Join a lobby' })).toBeVisible()
    await expect(page.getByLabel('Lobby code')).toHaveValue('ABC123')
  })

  test('create lobby opens host view without asking for a name', async ({
    page,
  }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: 'Host a lobby' }).click()

    await expect(page).toHaveURL(/\/ytmq\/room\/[0-9a-f-]{36}\/?$/, {
      timeout: 15_000,
    })
    await expect(page.getByRole('button', { name: /^Admin/ })).toBeVisible()
  })
})
