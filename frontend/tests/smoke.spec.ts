import { test, expect } from '@playwright/test';

test('E2E Smoke: P1 sends to P2, switch to P2, confirm receipt, verify timeline shows SENT and RECEIVED', async ({
  page
}) => {
  // 1. Visit Dashboard
  await page.goto('/');
  await expect(page).toHaveTitle(/SFG Transfer Tracker/);

  // 2. Ensure active plant is P1
  const headerPlantSelect = page.locator('header select');
  await headerPlantSelect.selectOption('P1');
  await page.waitForTimeout(500);

  // 3. Navigate to Dispatch Form
  await page.click('text=+ Dispatch New SFG');
  await expect(page).toHaveURL(/.*\/transfers\/new/);

  // 4. Fill transfer dispatch form
  // Select Job Order first
  const joSelect = page.locator('form select').nth(1);
  await joSelect.selectOption({ index: 1 });
  await page.waitForTimeout(500);

  // Now explicitly select Destination Plant P2 (index 1)
  const destSelect = page.locator('form select').first();
  await destSelect.selectOption({ index: 1 });
  await page.waitForTimeout(300);

  // Quantity Sent
  const qtyInput = page.locator('form input[type="number"]').first();
  await qtyInput.fill('12');

  // Remarks
  const remarksTextarea = page.locator('form textarea');
  await remarksTextarea.fill('Playwright automated smoke dispatch');

  // Submit dispatch
  await page.click('button[type="submit"]');

  // 5. Verify redirect to Transfer Detail
  await expect(page).toHaveURL(/.*\/transfers\/TRF-\d{8}-\d{4}/, { timeout: 20000 });
  await expect(page.locator('text=IN TRANSIT')).toBeVisible();
  await expect(page.locator('text=SENT').first()).toBeVisible();

  // 6. Switch Active Plant to P2 in header (triggers reload)
  await Promise.all([
    page.waitForNavigation(),
    page.locator('header select').selectOption('P2')
  ]);

  // 7. Verify Receive form is available for destination plant P2
  await expect(
    page.locator('text=Active plant (P2) is the designated receiving plant')
  ).toBeVisible({ timeout: 15000 });

  const receiveQtyInput = page.locator('input[type="number"]').first();
  await receiveQtyInput.fill('12');

  const notesInput = page.locator('input[placeholder*="crates verified"]');
  await notesInput.fill('Playwright confirmed 12 units intact');

  // Click Acknowledge Receipt
  await page.click('button:has-text("Acknowledge Receipt")');

  // 8. Verify status updates to FULLY RECEIVED
  await expect(page.locator('text=FULLY RECEIVED')).toBeVisible({ timeout: 20000 });

  // 9. Verify Audit Trail displays both SENT and RECEIVED events
  await expect(page.locator('text=SENT').first()).toBeVisible();
  await expect(page.locator('text=RECEIVED').first()).toBeVisible();
});
