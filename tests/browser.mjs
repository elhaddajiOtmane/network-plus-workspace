import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Reuse an installed QA tool; the deployable app has no dependencies.
let playwright;
try { playwright = await import('playwright'); }
catch {
  const installed = process.env.PLAYWRIGHT_MODULE || path.join(process.env.APPDATA || '', 'npm/node_modules/@playwright/cli/node_modules/playwright/index.mjs');
  playwright = await import(pathToFileURL(installed));
}
const { CONFIG } = await import('../dist/lib/config.js');
const { chromium } = playwright;
const baseURL = process.env.APP_URL || 'http://127.0.0.1:4174';
const output = fileURLToPath(new URL('../evidence/', import.meta.url));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
const failures = [];
const checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', item => { if (item.type() === 'error') errors.push(item.text()); });
page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
const action = name => page.locator(`[data-action="${name}"]`);
const snapshot = async name => page.screenshot({ path: path.join(output, name), fullPage: true });
const state = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), CONFIG.storageKey);
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); };
const waitFor = async selector => page.locator(selector).waitFor();
async function cleanStart() {
  await page.goto(baseURL);
  await waitFor('[data-action="quick"]');
}

try {
  await cleanStart();
  await page.evaluate(() => document.fonts.ready);
  const source = await page.evaluate(async () => (await fetch('./data/network-plus-n10-009.json')).json());
  const byId = new Map(source.exams.flatMap(exam => exam.questions.map(q => [`e${q.exam}-q${String(q.number).padStart(3, '0')}`, q])));
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await snapshot(`overview-${width}.png`);
    check(`overview ${width}px has no page overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  check('not-studied state visible', (await page.locator('.domain-row').first().innerText()).includes('Not studied'));
  await page.keyboard.press('Tab');
  check('keyboard skip link receives visible focus', await page.locator('.skip').evaluate(el => el === document.activeElement && getComputedStyle(el).outlineStyle !== 'none'));
  await page.keyboard.press('Enter');
  check('skip link moves focus to main', await page.locator('#main').evaluate(el => el === document.activeElement));

  await action('quick').click();
  check('practice answers initially hidden', await page.locator('.feedback').count() === 0);
  await page.locator('[name="answer"][value="A"]').focus();
  await page.keyboard.press('ArrowRight');
  check('native radio keyboard selection', await page.locator('[name="answer"][value="B"]').isChecked());
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  check('practice check reveals explanation', (await page.locator('.feedback').innerText()).includes('Why this answer'));
  check('checked answer is locked', await page.locator('[name="answer"]').first().isDisabled());
  await action('bookmark').click();
  check('bookmark saved by stable ID', (await state()).bookmarks.includes('e1-q001'));
  await action('next').click();
  await page.locator('[name="answer"][value="B"]').check();
  await page.reload();
  await waitFor('#question-title');
  check('refresh silently restores question and selected answer', (await page.locator('.source-id').first().innerText()).includes('e1-q002') && await page.locator('[value="B"]').isChecked());
  check('refresh opens no confirmation', !(await page.locator('dialog').evaluate(el => el.open)));
  for (let index = 1; index < 10; index++) {
    const q = byId.get(`e1-q${String(index + 1).padStart(3, '0')}`);
    await page.locator(`[name="answer"][value="${q.correctAnswers[0]}"]`).check();
    await page.getByRole('button', { name: 'Check answer', exact: true }).click();
    if (index < 9) await action('next').click();
  }
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    check(`practice ${width}px has no page overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await snapshot(`practice-${width}.png`);
  }
  await action('finish').click();
  await waitFor('.score');
  check('complete practice scores 10/10', (await page.locator('.score').innerText()).includes('10 correct out of 10'));
  await snapshot('practice-results.png');
  await page.locator('nav a[href="#bookmarks"]').click();
  check('bookmark review filtering', (await page.locator('.setup-summary').innerText()).includes('1 questions match'));
  await page.locator('nav a[href="#missed"]').click();
  check('missed review provides useful empty state', (await page.locator('.empty').innerText()).includes('No matching questions'));

  await page.locator('nav a[href="#exam"]').click();
  await page.getByRole('button', { name: 'Start 90-minute exam' }).click();
  check('timed exam has 90 navigable questions', await page.locator('.node').count() === 90);
  check('timer starts from absolute 90-minute deadline', /^89:|^90:/.test(await page.locator('#timer').innerText()));
  const initialDeadline = (await state()).active.deadline;
  for (let index = 0; index < 90; index++) {
    const q = byId.get(`e1-q${String(index + 1).padStart(3, '0')}`);
    await page.locator(`[name="answer"][value="${q.correctAnswers[0]}"]`).check();
    check(`exam question ${index + 1} feedback hidden`, await page.locator('.feedback,.choice-status').count() === 0);
    if (index < 89) await action('next').click();
  }
  await page.reload();
  await waitFor('#timer');
  check('exam refresh retains deadline, position and answers', (await state()).active.deadline === initialDeadline && (await state()).active.index === 89 && Object.keys((await state()).active.answers).length === 90);
  await action('jump').first().click();
  await page.locator('[name="answer"][value="A"]').check();
  await page.locator('[name="answer"][value="B"]').check();
  check('exam answers can change before submission', (await state()).active.answers['e1-q001'][0] === 'B');
  await snapshot('exam-desktop.png');
  await page.locator('nav a[href="#practice"]').click();
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  check('unfinished session replacement asks for confirmation', await page.locator('dialog').evaluate(el => el.open));
  await page.locator('dialog [value="cancel"]').click();
  check('cancel replacement preserves exam', (await state()).active.deadline === initialDeadline);
  await page.locator('nav a[href="#overview"]').click();
  await action('continue').click();
  await action('finish').click();
  check('exam submission asks for confirmation', await page.locator('dialog').evaluate(el => el.open));
  await page.locator('dialog [value="confirm"]').click();
  await waitFor('.score');
  check('complete exam scores 90/90', (await page.locator('.score').innerText()).includes('90 correct out of 90'));
  await page.locator('.review-item').first().locator('summary').click();
  check('submitted exam review reveals explanation', await page.locator('.review-item').first().locator('.feedback').isVisible());
  await snapshot('exam-results.png');

  await page.locator('nav a[href="#practice"]').click();
  await page.locator('[name="exam"]').selectOption('4');
  await page.locator('[name="size"]').selectOption('all');
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await page.locator('[data-action="jump"][data-index="71"]').click();
  check('source multi-answer question uses checkboxes', await page.locator('input[type=checkbox][name=answer]').count() === byId.get('e4-q072').choices.length);
  await page.locator('[value="D"]').check();
  await page.locator('[value="E"]').check();
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  check('multi-answer exact set scores correctly in browser', (await page.locator('.feedback h2').innerText()) === 'Correct.');

  await page.locator('nav a[href="#progress"]').click();
  const downloadPromise = page.waitForEvent('download');
  await action('export').click();
  const download = await downloadPromise;
  await download.saveAs(path.join(output, 'qa-export.json'));
  const backup = await state();
  const beforeInvalid = JSON.stringify(backup);
  await page.locator('#import-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await page.locator('#message').filter({ hasText: 'not valid JSON' }).waitFor();
  check('malformed import displays error and preserves progress', JSON.stringify(await state()) === beforeInvalid);
  await page.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.locator('dialog[open]').waitFor();
  await page.locator('dialog [value="confirm"]').click();
  await waitFor('#question-title');
  check('valid import restores checked multi-answer session', await page.locator('[value="D"]').isChecked() && await page.locator('[value="E"]').isChecked() && await page.locator('.feedback').count() === 1);

  await page.locator('nav a[href="#exam"]').click();
  await page.getByRole('button', { name: 'Start 90-minute exam' }).click();
  await page.locator('dialog[open]').waitFor();
  await page.locator('dialog [value="confirm"]').click();
  await waitFor('#timer');
  const sessionBeforeExpiry = (await state()).sessions.length;
  // Model time passage only in this isolated QA browser: keep the real 90-minute duration intact.
  await page.evaluate(key => {
    const value = JSON.parse(localStorage.getItem(key));
    value.active.startedAt = Date.now() - 5_400_100;
    value.active.deadline = value.active.startedAt + 5_400_000;
    localStorage.setItem(key, JSON.stringify(value));
  }, CONFIG.storageKey);
  await page.reload();
  await waitFor('.score');
  check('expired exam auto-submits on refresh', (await state()).active === null && (await state()).sessions.length === sessionBeforeExpiry + 1);
  check('unanswered expired exam scores 0/90', (await page.locator('.score').innerText()).includes('0 correct out of 90'));
  check('automatic expiry explains result', (await page.locator('#message').innerText()).includes('submitted automatically'));

  const blockedContext = await browser.newContext();
  await blockedContext.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('QA: storage denied'); }; });
  const blockedPage = await blockedContext.newPage();
  await blockedPage.goto(baseURL);
  await blockedPage.locator('#storage-warning').filter({ hasText: 'only in this tab' }).waitFor();
  check('browser storage failure is visible before studying', await blockedPage.locator('#storage-warning').isVisible());
  await blockedContext.close();

  check('local fonts actually loaded', await page.evaluate(() => document.fonts.check('16px Outfit') && document.fonts.check('16px "Work Sans"')));
  check('no application console errors or CSP violations', errors.length === 0);
  check('no failed HTTP resources', failures.length === 0);
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ baseURL, passed: checks.length, checks, errors, failedRequests: failures, browser: await browser.version() }, null, 2));
  console.log(`Browser checks passed: ${checks.length}`);
} catch (error) {
  await snapshot('browser-failure.png').catch(() => {});
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ baseURL, passed: checks.length, checks, errors, failedRequests: failures, failure: error.message }, null, 2));
  throw error;
} finally { await browser.close(); }
