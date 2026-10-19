// scripts/lighthouse-flow.mjs — Phase 17.8 Lighthouse a11y on authenticated SPA pages
// Usage: node scripts/lighthouse-flow.mjs <page-key>

import puppeteer from 'puppeteer-core';
import lighthouse from 'lighthouse';
import { writeFileSync, readFileSync } from 'node:fs';

const CHROME_PATH = '/home/z/.agent-browser/browsers/chrome-153.0.8010.52/chrome';
const BASE = 'http://localhost:3000';

const SESSION_RAW = readFileSync('/tmp/session-portal.txt', 'utf-8').trim()
  .replace(/^"|"$/g, '').replace(/\\"/g, '"');

const PAGES = {
  'login': { authenticated: false, sidebarItem: null, clickFirstRow: false },
  'dashboard': { authenticated: true, sidebarItem: 'Dashboard', clickFirstRow: false },
  'clients': { authenticated: true, sidebarItem: 'Clients', clickFirstRow: false },
  'cases': { authenticated: true, sidebarItem: 'Cases', clickFirstRow: false },
  'case-detail': { authenticated: true, sidebarItem: 'Cases', clickFirstRow: true },
  'client-profile': { authenticated: true, sidebarItem: 'Clients', clickFirstRow: true },
};

async function run() {
  const pageKey = process.argv[2] || 'dashboard';
  const config = PAGES[pageKey];
  if (!config) {
    console.error(`Unknown page: ${pageKey}`);
    process.exit(1);
  }

  // Launch puppeteer-controlled Chrome with debugging port
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=9333'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  if (config.authenticated) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((sessionJson) => {
      localStorage.setItem('trustee-portal', sessionJson);
    }, SESSION_RAW);
    await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500));
  } else {
    await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  }

  if (config.sidebarItem) {
    await page.evaluate((label) => {
      const btn = [...document.querySelectorAll('aside button')].find(b => b.textContent?.trim() === label || b.textContent?.includes(label));
      btn?.click();
    }, config.sidebarItem);
    await new Promise(r => setTimeout(r, 2000));
  }

  if (config.clickFirstRow) {
    await page.evaluate(() => {
      const row = document.querySelector('tbody tr');
      row?.click();
    });
    await new Promise(r => setTimeout(r, 4000));
  }

  // Run Lighthouse via the puppeteer-controlled browser
  // Lighthouse accepts a URL or a Page object
  console.log(`Running Lighthouse a11y on ${pageKey}...`);
  const result = await lighthouse(page.url() || BASE, {
    port: 9333,
    onlyCategories: ['accessibility'],
    output: 'json',
  });

  const score = Math.round((result.lhr.categories.accessibility.score || 0) * 100);
  console.log(`${pageKey} a11y score: ${score}`);

  // Save JSON + HTML report
  writeFileSync(`/home/z/my-project/download/screenshots/phase17.8/lighthouse-reports/${pageKey}.report.json`, result.report);
  // Lighthouse returns JSON when output='json'. To get HTML, run again with output='html' OR use a different method.
  // For now, write the JSON report; HTML report we'll generate separately.

  const failedAudits = [];
  const audits = result.lhr.audits;
  const a11yRefs = result.lhr.categories.accessibility.auditRefs || [];
  for (const [k, v] of Object.entries(audits)) {
    if (v.score !== null && v.score < 1) {
      if (a11yRefs.some(r => r.id === k)) {
        failedAudits.push(`  - ${k}: ${v.title} | ${v.description?.slice(0,100) || ''}`);
      }
    }
  }
  if (failedAudits.length > 0) {
    console.log('Failed a11y audits:');
    failedAudits.forEach(a => console.log(a));
  }

  await browser.close();
}

run().catch(e => { console.error('Lighthouse error:', e.message); process.exit(1); });
