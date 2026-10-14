/**
 * Resolve a Chromium/Chrome executable for playwright-core.
 * Order: CHROMIUM_PATH env → ms-playwright cache (mac/linux layouts) → system Chrome.
 * Throws with setup instructions when nothing is found.
 */
import { existsSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

export function resolveChromium() {
  // 1) explicit override
  if (process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }

  // 2) ms-playwright browser cache (created by `npx playwright install chromium`)
  const cacheRoot = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const linuxRoot = join(homedir(), '.cache', 'ms-playwright');
  for (const root of existsSync(cacheRoot) ? [cacheRoot] : existsSync(linuxRoot) ? [linuxRoot] : []) {
    const dirs = readdirSync(root)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort()
      .reverse(); // newest build first
    for (const d of dirs) {
      const macPath = join(root, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      const macIntelPath = join(root, d, 'chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      const linuxPath = join(root, d, 'chrome-linux', 'chrome');
      for (const p of [macPath, macIntelPath, linuxPath]) {
        if (existsSync(p)) return p;
      }
      // headless shell fallback (still fine for our tests)
      const shellMac = join(root, `chromium_headless_shell-${d.split('-')[1]}`, 'chrome-mac-arm64', 'headless_shell');
      const shellLinux = join(root, `chromium_headless_shell-${d.split('-')[1]}`, 'chrome-linux', 'headless_shell');
      if (existsSync(shellLinux)) return shellLinux;
      if (existsSync(shellMac)) return shellMac;
    }
  }

  // 3) system Chrome / Chromium
  if (platform() === 'darwin') {
    for (const p of [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]) {
      if (existsSync(p)) return p;
    }
  } else {
    for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
      if (existsSync(p)) return p;
    }
  }

  throw new Error(
    'No Chromium found. Set CHROMIUM_PATH or run: npx playwright install chromium'
  );
}