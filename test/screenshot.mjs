/** Capture EN + PL screenshots of the app for visual verification. */
import { chromium } from 'playwright-core';
import { resolveChromium } from './chromium.mjs';
import { mkdirSync } from 'node:fs';

const CHROMIUM = resolveChromium();
const URL = process.env.E2E_URL || 'http://localhost:4173/';
const OUT = process.env.SHOTS_DIR || '/tmp/i18n-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e));

await page.goto(URL);
await page.waitForSelector('.lang-btn');

// EN screenshot (default fresh state)
await page.screenshot({ path: `${OUT}/app-en.png`, fullPage: true });

// Fill some content in EN, then switch to PL (content preserved?)
await page.locator('.header-text').fill('Rozczarowani\nScenka 1');
await page.locator('.srt-paste').fill(
  `1
00:00:00,000 --> 00:00:16,240
[Lucy] Okay watch your posture. No slouch more.

2
00:00:16,240 --> 00:00:25,120
[Demon] What kind of demon are you?
[Bean] Me? Oh I'm just like you know`
);
await page.waitForSelector('.summary');

// PL screenshot with content
await page.click('.lang-btn:has-text("PL")');
await page.waitForFunction(() => document.documentElement.lang === 'pl');
await page.screenshot({ path: `${OUT}/app-pl.png`, fullPage: true });

// content preserved across language switch?
const headerVal = await page.inputValue('.header-text');
console.log('header preserved across lang switch:', headerVal.includes('Rozczarowani') ? 'YES' : 'NO');
const previewStill = await page.textContent('.script-preview');
console.log('preview still renders in PL:', previewStill.includes('[00:00:00]') ? 'YES' : 'NO');

await browser.close();
console.log('screenshots in', OUT);