import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DIST_DIR = path.resolve('dist');
const PKG = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
const BASE_NAME = (process.env.GITHUB_PAGES || 'omni-grimoire').replace(/^\/+|\/+$/g, '');
const MOUNT = `/${BASE_NAME}/`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

function startStaticServer() {
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`Dossier introuvable : ${DIST_DIR}. Lance d'abord "npm run build".`);
  }

  const server = http.createServer((req, res) => {
    const reqPath = new URL(req.url || '/', 'http://localhost').pathname;

    if (reqPath === `/${BASE_NAME}` || reqPath === '/') {
      res.writeHead(302, { Location: MOUNT });
      res.end();
      return;
    }

    if (!reqPath.startsWith(MOUNT)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const rel = decodeURIComponent(reqPath.slice(MOUNT.length));
    const target = rel === '' ? 'index.html' : rel;
    let filePath = path.resolve(DIST_DIR, target);

    if (!filePath.startsWith(DIST_DIR + path.sep) && filePath !== DIST_DIR) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      // Repli SPA uniquement pour les routes sans extension de fichier.
      if (!path.extname(target)) {
        filePath = path.join(DIST_DIR, 'index.html');
      } else {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, 'localhost', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

async function run() {
  const { server, port } = await startStaticServer();
  const origin = `http://localhost:${port}`;
  const appUrl = `${origin}${MOUNT}`;
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'allow',
    });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    const externalRequests = [];
    const badResponses = [];

    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push({
          directive: event.violatedDirective,
          blockedURI: event.blockedURI,
        });
      });
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('request', (req) => {
      const url = req.url();
      if ((url.startsWith('http://') || url.startsWith('https://')) && !url.startsWith(`${origin}/`)) {
        externalRequests.push(url);
      }
    });
    page.on('response', (res) => {
      if (res.url().startsWith(`${origin}/`) && res.status() >= 400) {
        badResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto(appUrl, { waitUntil: 'networkidle' });
    await page.locator('.topbar').waitFor({ state: 'visible', timeout: 10000 });

    // 1. Un seul <h1> visible et pas de debordement horizontal en 390x844
    const layout = await page.evaluate(() => {
      const visibleH1s = [...document.querySelectorAll('h1')].filter((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      });
      return {
        h1Count: visibleH1s.length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });
    assert(layout.h1Count === 1, `Un seul <h1> visible (trouve : ${layout.h1Count})`);
    assert(
      layout.scrollWidth <= layout.clientWidth,
      `Aucun debordement horizontal (${layout.scrollWidth} <= ${layout.clientWidth})`
    );

    // 2. Enregistrement du Service Worker
    const swReady = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const reg = await navigator.serviceWorker.ready;
      return {
        supported: true,
        active: Boolean(reg.active),
        controlled: Boolean(navigator.serviceWorker.controller),
      };
    });
    assert(swReady.supported && swReady.active, 'Service Worker enregistre et actif');
    if (!swReady.controlled) {
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('.topbar').waitFor({ state: 'visible', timeout: 10000 });
    }

    // 3. Reglages : « Vibrations » + bloc « A propos » + theme Parchemin
    await page.locator('.tabbar button', { hasText: /Réglages/i }).click();
    await page.locator('h2, h1').filter({ hasText: /Réglages/i }).first().waitFor({ state: 'visible' });

    const vibrationsVisible = await page.getByText(/Vibrations/i).first().isVisible();
    assert(vibrationsVisible, 'Reglage « Vibrations » present dans Reglages');

    const aboutCheck = await page.evaluate((version) => {
      const aboutHeading = [...document.querySelectorAll('h2, h3')].find((el) =>
        /à propos/i.test(el.textContent || '')
      );
      const section = aboutHeading?.closest('section');
      const text = section?.textContent || '';
      const licLink = section?.querySelector('a[href*="licences-tierces.txt"]');
      return {
        hasSection: Boolean(section),
        hasVersion: text.includes(version),
        hasContact: text.includes('omni-systeme.choking513@passmail.net'),
        hasLicLink: Boolean(licLink),
      };
    }, PKG.version);
    assert(aboutCheck.hasSection, 'Section « A propos » presente');
    assert(aboutCheck.hasVersion, `Version ${PKG.version} affichee dans « A propos »`);
    assert(aboutCheck.hasContact, 'Contact omni-systeme.choking513@passmail.net affiche dans « A propos »');
    assert(aboutCheck.hasLicLink, 'Lien licences-tierces.txt present dans « A propos »');

    // 4. Passage en theme Parchemin et verification du contraste du bouton primaire (>= 4,5:1)
    await page.getByRole('button', { name: /Parchemin/i }).click();
    const themeAttr = await page.evaluate(() => document.documentElement.dataset.theme);
    assert(themeAttr === 'parchemin', 'Theme Parchemin active');

    await page.locator('.tabbar button', { hasText: /Fiches/i }).click();
    await page.locator('.btn--primary:not(:disabled)').first().waitFor({ state: 'visible' });

    const contrast = await page.evaluate(() => {
      const parseColors = (str) => {
        const matches = [...String(str || '').matchAll(/rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/gi)];
        return matches.map((m) => ({
          r: Number(m[1]),
          g: Number(m[2]),
          b: Number(m[3]),
          a: m[4] === undefined ? 1 : Number(m[4]),
        }));
      };
      const luminance = ({ r, g, b }) => {
        const toLinear = (c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
      };
      const ratio = (c1, c2) => {
        const l1 = luminance(c1);
        const l2 = luminance(c2);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };

      const btn = [...document.querySelectorAll('.btn--primary:not(:disabled)')].find((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!btn) return { found: false };
      const style = getComputedStyle(btn);
      const fg = parseColors(style.color)[0];
      const gradColors = parseColors(style.backgroundImage);
      const bgColors = gradColors.length ? gradColors : parseColors(style.backgroundColor);
      const ratios = bgColors.filter((c) => c.a > 0.5).map((bg) => ratio(fg, bg));
      return {
        found: true,
        color: style.color,
        bg: gradColors.length ? style.backgroundImage : style.backgroundColor,
        minRatio: ratios.length ? Math.min(...ratios) : 0,
      };
    });
    assert(
      contrast.found && contrast.minRatio >= 4.5,
      `Contraste bouton primaire en theme Parchemin >= 4,5:1 (mesure : ${contrast.minRatio?.toFixed(2)}:1)`
    );

    // 5. Rechargement hors ligne + acces hors ligne a licences-tierces.txt
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.topbar').waitFor({ state: 'visible', timeout: 10000 });

    const offlineCheck = await page.evaluate(async () => {
      const visibleH1s = [...document.querySelectorAll('h1')].filter((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      });
      const res = await fetch('./licences-tierces.txt');
      const text = await res.text();
      return {
        h1Count: visibleH1s.length,
        licOk: res.ok,
        licStatus: res.status,
        licValid: text.includes('Licences des bibliotheques tierces'),
      };
    });
    assert(offlineCheck.h1Count === 1, 'Application rendue hors ligne apres rechargement');
    assert(
      offlineCheck.licOk && offlineCheck.licValid,
      `licences-tierces.txt accessible hors ligne (HTTP ${offlineCheck.licStatus})`
    );

    // 6. Zero erreur console, pageerror, CSP ou requete externe
    const cspViolations = await page.evaluate(() => window.__cspViolations || []);
    assert(consoleErrors.length === 0, `0 erreur console (${consoleErrors.join(' | ')})`);
    assert(pageErrors.length === 0, `0 pageerror (${pageErrors.join(' | ')})`);
    assert(cspViolations.length === 0, `0 violation CSP (${JSON.stringify(cspViolations)})`);
    assert(externalRequests.length === 0, `0 requete externe (${externalRequests.join(', ')})`);
    assert(badResponses.length === 0, `0 reponse HTTP >= 400 (${badResponses.join(', ')})`);

    console.log('\nTOUS LES TESTS SMOKE PLAYWRIGHT PASSENT');
  } finally {
    await browser?.close();
    server.close();
  }
}

run().catch((err) => {
  console.error('\nECHEC SMOKE :', err);
  process.exit(1);
});
