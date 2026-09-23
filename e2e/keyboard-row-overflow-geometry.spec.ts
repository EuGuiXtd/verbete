import { expect, test, type Page } from '@playwright/test';

/**
 * The keyboard's whole width contract, measured in a real browser.
 *
 * Task 23 wrote this file to guard one specific trap: a row with
 * `justify-content: center` AND `overflow-x-auto` shifts its flex line so
 * part of it starts to the LEFT of the scrollport's origin when the content
 * is wider than the port, and `scrollLeft` cannot go negative to reach it.
 * Measured then, at 320px in Quarteto: "Q" sat off-screen at every reachable
 * scroll position — genuinely untappable, not merely inconvenient.
 *
 * Feedback round 1, item 5 removed the premise rather than the symptom (see
 * src/ui/keyboard/Keyboard.tsx's `KeyboardRow`): the keys now divide the
 * row's width instead of summing to a width the row must find, so no row can
 * be wider than its container at any viewport, and the scroll container is
 * gone. The first and last tests below are Task 23's own, unchanged, and
 * they still hold — they were always the right questions ("is the first key
 * reachable", "is the last one"), and a construction that cannot overflow
 * answers them the strong way.
 *
 * The middle test is NOT Task 23's. Its assertions were `scrollWidth >
 * clientWidth` and the per-side fade that overflow drove — a description of
 * the old construction, not of the requirement. Keeping it would have meant
 * asserting that the bug is still present. It is replaced by the property
 * the owner actually asked for, at more widths than anyone previously
 * targeted, including two nobody has.
 */

const KEYBOARD = '[role="group"][aria-label="Teclado"]';

async function openAt(page: Page, variant: string, width: number, height = 800): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.getByRole('button', { name: variant, exact: true }).click();
  await expect(page.locator(KEYBOARD)).toBeVisible();
}

test.describe('keyboard row overflow at 320px does not strand a key off-screen', () => {
  test('the first letter key sits flush at the row\'s own left edge at rest, not off-screen', async ({ page }) => {
    await openAt(page, 'Quarteto', 320, 568);

    const firstRow = page.locator(`${KEYBOARD} > div`).first();
    const rowBox = await firstRow.boundingBox();
    const firstKey = firstRow.getByRole('button').first();
    const keyBox = await firstKey.boundingBox();

    expect(rowBox).not.toBeNull();
    expect(keyBox).not.toBeNull();
    // At rest the very first key's left edge must be at or after the row's
    // own left edge — never negative relative to it, which is what
    // "off-screen and unreachable" looked like before Task 23's fix
    // (measured: -78px at a 320px viewport).
    expect(keyBox!.x).toBeGreaterThanOrEqual(rowBox!.x - 0.5);
  });

  /**
   * The row fits BY CONSTRUCTION, at every width, in every variant.
   *
   * Three properties per row, and all three are needed. Zero overflow says
   * the row is not scrollable; every key inside the row's own box says no
   * key is clipped even if the row somehow were; and a target size at or
   * above WCAG 2.2 AA's 24px minimum says the row did not "fit" by
   * squashing its keys into unusable slivers, which is the failure mode a
   * naive shrink-to-fit produces and which a pure overflow assertion would
   * cheerfully call a pass.
   *
   * The widths: 320 and 390 are the two this defect was previously fixed
   * "at" and came back from. 360 and 412 are the most common Android
   * portrait widths in Brazil. 280 (Galaxy Fold, folded) and 344 are
   * deliberately widths nobody on this project has ever targeted — 280 is
   * narrower than any phone still sold, and 344 is an arbitrary number
   * between two breakpoints, chosen precisely because no line of code
   * anywhere mentions it.
   */
  for (const width of [280, 320, 344, 360, 390, 412, 640, 1280]) {
    for (const variant of ['Solo', 'Quarteto']) {
      test(`${variant} fits every key inside every row at ${String(width)}px, with no horizontal scroll`, async ({
        page,
      }) => {
        await openAt(page, variant, width);

        const rows = page.locator(`${KEYBOARD} > div`);
        await expect(rows).toHaveCount(3);

        const measured = await rows.evaluateAll((nodes) =>
          nodes.map((node) => ({
            overflow: node.scrollWidth - node.clientWidth,
            row: node.getBoundingClientRect(),
            keys: Array.from(node.querySelectorAll('button')).map((key) => {
              const rect = key.getBoundingClientRect();
              return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
            }),
          })),
        );

        for (const { overflow, row, keys } of measured) {
          expect(overflow).toBeLessThanOrEqual(1);
          expect(keys.length).toBeGreaterThan(0);
          for (const key of keys) {
            expect(key.left).toBeGreaterThanOrEqual(row.left - 0.5);
            expect(key.right).toBeLessThanOrEqual(row.right + 0.5);
            // Not fitted by being crushed: WCAG 2.2 AA target size minimum.
            expect(key.width).toBeGreaterThanOrEqual(24);
            expect(key.height).toBeGreaterThanOrEqual(24);
          }
        }

        // And the page itself never gains a horizontal scroll from any of it.
        const pageOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(pageOverflow).toBeLessThanOrEqual(1);

        // Every LETTER key is the same width as every other, across all three
        // rows. This is the shape of the fix, not a cosmetic nicety: the keys
        // divide their row rather than summing to a demand, and the action
        // keys' 1.5 share is chosen so the bottom row asks for exactly the
        // ten shares the top row does (see Keyboard.tsx's `ActionKey`). A
        // future change that reintroduces a per-key width, or retunes that
        // ratio without thinking, shows up here as rows that no longer agree.
        const letterWidths = await page
          .locator(`${KEYBOARD} button:not([aria-label="Enviar tentativa"]):not([aria-label="Apagar última letra"])`)
          .evaluateAll((keys) => keys.map((key) => Math.round(key.getBoundingClientRect().width * 10) / 10));
        expect(letterWidths).toHaveLength(26);
        // 3% rather than an absolute pixel figure, and not zero: the three
        // rows hold 9, 10 and 8 gaps respectively for the same ten shares,
        // so each row spends a slightly different amount of its width on gap
        // — a fixed, known 0.2 x gap spread (measured: 0.52px at 280 rising
        // to 0.88px at 480, then exactly 0 from ~540px up once every key has
        // hit its 44px ceiling). 3% sits above that and below the ~6% an
        // actual ratio mistake produces: the 1.8 action share tried first
        // measured 5.7% here, and the un-padded middle row before that, 12%.
        const spread = Math.max(...letterWidths) - Math.min(...letterWidths);
        expect(spread).toBeLessThanOrEqual(0.03 * Math.max(...letterWidths));
      });
    }
  }

  test('the appended enviar/apagar keys are inside the last row without scrolling it', async ({ page }) => {
    await openAt(page, 'Quarteto', 320, 568);

    const lastRow = page.locator(`${KEYBOARD} > div`).last();
    const sendButton = page.getByRole('button', { name: 'Enviar tentativa' });
    await expect(sendButton).toBeVisible();

    const rowBox = await lastRow.boundingBox();
    const sendBox = await sendButton.boundingBox();
    expect(sendBox).not.toBeNull();
    expect(rowBox).not.toBeNull();
    // Fully inside the row's own visible box, not clipped off its right
    // edge — and, unlike the version of this test Task 23 wrote, WITHOUT
    // first scrolling the row all the way right to put it there.
    expect(sendBox!.x + sendBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 0.5);
    expect(sendBox!.x).toBeGreaterThanOrEqual(rowBox!.x - 0.5);
    // The label itself is inside its key, not spilling out of it: the action
    // keys are the one place where a shrink-to-fit row meets text that has a
    // width of its own (see index.css's `.tecla-acao`).
    const labelOverflow = await sendButton.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(labelOverflow).toBeLessThanOrEqual(1);
  });
});
