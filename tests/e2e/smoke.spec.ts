import { expect, test } from '@playwright/test';

test('synthetic session visual-test entry works without Supabase auth', async ({ page }) => {
  await page.goto('/__test/session');
  await expect(page.getByRole('heading', { name: 'Likninger' })).toBeVisible();
  await expect(page.getByText('2(x − 3) = 4x + 6')).toBeVisible();
});

test('Nora can start the M1 main flow', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Mattis');
  await expect(page.getByRole('heading', { name: /Matte, ett steg av gangen/ })).toBeVisible();
  await expect(page.getByLabel('E-post')).toHaveValue('');

  await page.context().addCookies([
    {
      name: 'mattis_access_token',
      value: 'synthetic-e2e-session',
      url: 'http://127.0.0.1:3000',
    },
  ]);
  await page.route('**/api/profile/onboarding', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/api/sessions', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000001' }),
    });
  });
  await page.goto('/onboarding');
  await page.getByRole('button', { name: /Lagre og fortsett/ }).click();
  await expect(page).toHaveURL(/home/);
  await page.getByRole('link', { name: /Start økt/ }).click();
  await expect(page).toHaveURL(/session\/new/);
  await page.getByRole('button', { name: /Fortsett til lekser/ }).click();
  await expect(page).toHaveURL(/capture/);
  await page.getByRole('link', { name: 'Ferdig' }).click();
  await expect(page).toHaveURL(/review/);
  await page.getByRole('link', { name: /Start med oppgave 1/ }).click();
  await expect(page).toHaveURL(/session\/00000000-0000-4000-8000-000000000001$/);
  await expect(page.getByRole('heading', { name: 'Likninger' })).toBeVisible();
});
