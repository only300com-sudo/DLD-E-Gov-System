// Generate HTML reports for each Lighthouse JSON
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = require('/home/z/my-project/node_modules/lighthouse/report/generator/report-generator.js');
const RG = mod.ReportGenerator || mod.default || mod;
console.log('RG keys:', Object.keys(RG).slice(0,15));

const PAGES = ['login', 'dashboard', 'clients', 'cases', 'case-detail', 'client-profile'];
for (const page of PAGES) {
  const jsonPath = `/home/z/my-project/download/screenshots/phase17.8/lighthouse-reports/${page}.report.json`;
  try {
    const lhr = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    let html;
    // Try various methods
    if (typeof RG.generateReportHtml === 'function') {
      html = RG.generateReportHtml(lhr);
    } else if (RG.default && typeof RG.default.generateReportHtml === 'function') {
      html = RG.default.generateReportHtml(lhr);
    } else {
      // Look for method
      const methods = Object.keys(RG).filter(k => typeof RG[k] === 'function');
      console.log(`${page} methods:`, methods);
      // Use the first method that produces HTML
      for (const m of methods) {
        try {
          const r = RG[m](lhr, 'html');
          if (typeof r === 'string' && r.includes('<html')) {
            html = r;
            console.log(`  used method: ${m}`);
            break;
          }
        } catch {}
      }
    }
    if (html) {
      writeFileSync(`/home/z/my-project/download/screenshots/phase17.8/lighthouse-reports/${page}.report.html`, html);
      console.log(`${page}: HTML saved`);
    } else {
      console.error(`${page}: no HTML method found`);
    }
  } catch (e) {
    console.error(`${page}: ${e.message}`);
  }
}
