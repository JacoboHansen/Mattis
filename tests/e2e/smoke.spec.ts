import { expect, test } from '@playwright/test';

test('synthetic session visual-test entry works without Supabase auth', async ({
  page,
}) => {
  await page.goto('/__test/session');
  await expect(page.getByRole('heading', { name: 'Matteøkt' })).toBeVisible();
  await expect(page.getByText('2(x − 3) = 4x + 6')).toBeVisible();
  await expect(page.getByText('Oppgave 1 av 2')).toBeVisible();
  await expect(page.getByText('Hva vil du jobbe med?')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tilbake' })).toHaveAttribute(
    'href',
    '/home',
  );
  await expect(page.getByRole('link', { name: 'Avslutt økten' })).toHaveCount(
    0,
  );

  const shell = await page.locator('.app-shell').evaluate((element) => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    bodyScrollHeight: document.body.scrollHeight,
    viewportHeight: window.innerHeight,
  }));
  expect(shell.scrollHeight).toBe(shell.height);
  expect(shell.bodyScrollHeight).toBe(shell.viewportHeight);
});

test('protected routes return a new visitor to the landing page', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Mattis');
  await expect(
    page.getByRole('heading', { name: /Matte, ett steg av gangen/ }),
  ).toBeVisible();
  await expect(page.getByLabel('E-post')).toHaveValue('');
  await page.goto('/home');
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('heading', { name: /Matte, ett steg av gangen/ }),
  ).toBeVisible();
});
