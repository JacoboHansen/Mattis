import { expect, test } from '@playwright/test';

test('Nora can start the M1 main flow', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Mattis');
  await expect(page.getByRole('heading', { name: /Matte, ett steg av gangen/ })).toBeVisible();
  await expect(page.getByLabel('E-post')).toHaveValue('jacob.oskar.hansen+nora@gmail.com');

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
  await page.goto('/onboarding');
  await page.getByRole('button', { name: /Lagre og fortsett/ }).click();
  await expect(page).toHaveURL(/home/);
  await page.getByRole('link', { name: /Start økt/ }).click();
  await expect(page).toHaveURL(/session\/new/);
  await page.getByRole('link', { name: /Fortsett til lekser/ }).click();
  await expect(page).toHaveURL(/capture/);
  await page.getByRole('link', { name: 'Ferdig' }).click();
  await expect(page).toHaveURL(/review/);
  await page.getByRole('link', { name: /Start med oppgave 1/ }).click();
  await expect(page).toHaveURL(/session\/demo$/);
  await expect(page.getByRole('heading', { name: 'Likninger' })).toBeVisible();
});
