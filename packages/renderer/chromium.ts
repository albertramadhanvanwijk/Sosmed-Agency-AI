/**
 * Peluncur Chromium.
 *
 * Chromium yang dipakai adalah versi yang sudah ada di mesin ini, supaya
 * proyek tidak perlu mengunduh browser (folder cache Playwright sering sudah
 * terisi oleh proyek lain). Urutan pencarian:
 *
 *   1. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH (variabel lingkungan, jalur manual)
 *   2. Cache Playwright standar di sistem pengguna (chromium-* / headless shell)
 *   3. Google Chrome yang terpasang
 *   4. Microsoft Edge yang terpasang (hampir selalu ada di Windows)
 *
 * Bila semuanya gagal, galat yang dikembalikan menjelaskan cara memperbaikinya
 * alih-alih gagal dengan pesan yang membingungkan.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

export interface ChromiumPlan {
  /** Jalur executable yang akan dipakai. */
  executablePath: string;
  /** Dari mana jalur ini ditemukan, untuk ditampilkan di log. */
  source: string;
}

function browserCacheDir(): string {
  const os = platform();
  if (os === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
    return join(local, 'ms-playwright');
  }
  if (os === 'darwin') return join(homedir(), 'Library', 'Caches', 'ms-playwright');
  return join(homedir(), '.cache', 'ms-playwright');
}

/** Mendaftar direktori cache, terbaru lebih dulu. */
function listCacheDirs(prefix: string): string[] {
  const base = browserCacheDir();
  if (!existsSync(base)) return [];
  try {
    return readdirSync(base)
      .filter((name) => name.startsWith(prefix))
      .map((name) => ({ name, path: join(base, name) }))
      .filter((e) => {
        try {
          return statSync(e.path).isDirectory();
        } catch {
          return false;
        }
      })
      // Nomor revisi di akhir nama; urutkan menurun agar versi terbaru dipakai.
      .sort((a, b) => {
        const num = (s: string) => Number(s.match(/(\d+)$/)?.[1] ?? 0);
        return num(b.name) - num(a.name);
      })
      .map((e) => e.path);
  } catch {
    return [];
  }
}

const CHROMIUM_RELATIVE_PATHS = [
  ['chrome-win64', 'chrome.exe'],
  ['chrome-win', 'chrome.exe'],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
  ['chrome-linux', 'chrome'],
  ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
  ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
];

const EDGE_PATHS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

/** Menemukan executable Chromium yang akan dipakai beserta asalnya. */
export function resolveChromium(): ChromiumPlan {
  const manual = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (manual) {
    if (!existsSync(manual)) {
      throw new Error(
        `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH menunjuk ke berkas yang tidak ada: ${manual}`,
      );
    }
    return { executablePath: manual, source: 'variabel lingkungan PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH' };
  }

  // Cache Playwright: utamakan Chromium penuh (mendukung PDF), lalu headless shell.
  for (const prefix of ['chromium-', 'chromium_headless_shell-']) {
    for (const dir of listCacheDirs(prefix)) {
      for (const rel of CHROMIUM_RELATIVE_PATHS) {
        const candidate = join(dir, ...rel);
        if (existsSync(candidate)) {
          return { executablePath: candidate, source: `cache Playwright (${join(dir).split(/[\\/]/).pop()})` };
        }
      }
    }
  }

  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return { executablePath: p, source: 'Google Chrome terpasang' };
  }
  for (const p of EDGE_PATHS) {
    if (existsSync(p)) return { executablePath: p, source: 'Microsoft Edge terpasang' };
  }

  throw new Error(
    [
      'Tidak menemukan browser Chromium untuk merender slide.',
      '',
      'Perbaiki dengan salah satu cara berikut:',
      '  1. Pasang browser Playwright:  npx playwright install chromium',
      '  2. Setel jalur manual di .env.local:',
      '     PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=C:\\path\\ke\\chrome.exe',
      '  3. Pasang Google Chrome atau Microsoft Edge.',
      '',
      `Lokasi cache yang sudah diperiksa: ${browserCacheDir()}`,
    ].join('\n'),
  );
}
