import { expect, test } from '@playwright/test';

test('synthetic session visual-test entry works without Supabase auth', async ({ page }) => {
  await page.goto('/__test/session');
  await expect(page.getByRole('heading', { name: 'Matteøkt' })).toBeVisible();
  await expect(page.getByText('2(x − 3) = 4x + 6')).toBeVisible();
  await expect(page.getByText('Oppgave 1 av 2')).toBeVisible();
  await expect(page.getByText('Hva vil du jobbe med?')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Avslutt økten' })).toBeVisible();

  const shell = await page.locator('.app-shell').evaluate((element) => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    bodyScrollHeight: document.body.scrollHeight,
    viewportHeight: window.innerHeight,
  }));
  expect(shell.scrollHeight).toBe(shell.height);
  expect(shell.bodyScrollHeight).toBe(shell.viewportHeight);
});

test('Nora can reach the real session setup', async ({ page }) => {
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
  const sessionRequest = page.waitForRequest('**/api/sessions');
  await page.getByRole('button', { name: /Fortsett til lekser/ }).click();
  expect((await sessionRequest).postDataJSON()).toMatchObject({
    durationMinutes: 45,
    startImmediately: false,
  });
});
