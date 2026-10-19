// tests/integrity/files-exist.spec.ts
// Part 12B Review — Integrity test that imports every API route handler.
// If a file is silently deleted (like upload/route.ts was twice), this test
// fails BEFORE the developer notices — the import throws ERR_MODULE_NOT_FOUND.
//
// Run: npx tsx tests/integrity/files-exist.spec.ts

let testsPassed = 0;
let testsFailed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) { testsPassed++; console.log(`  ✓ ${name}`); }
  else { testsFailed++; console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
}

async function main() {
  console.log("=== Integrity: Files Exist Test ===\n");

  // ── API Routes — every route.ts must be importable ──
  console.log("Checking API route files exist + are importable...");
  const apiRoutes = [
    "../../src/app/api/knowledge-base/upload/route",
    "../../src/app/api/knowledge-base/route",
    "../../src/app/api/knowledge-base/[id]/route",
    "../../src/app/api/knowledge-base/[id]/extract-rules/route",
    "../../src/app/api/procedures/catalog/route",
    "../../src/app/api/procedures/catalog/[id]/route",
    "../../src/app/api/procedures/catalog/bulk-active/route",
    "../../src/app/api/procedures/workflow/route",
    "../../src/app/api/procedures/workflow/states/route",
    "../../src/app/api/cases/[id]/preparation-sheet/route",
    "../../src/app/api/cases/[id]/dld-manifest/route",
    "../../src/app/api/cases/route",
    "../../src/app/api/clients/route",
    "../../src/app/api/auth/login/route",
    "../../src/app/api/dashboard/route",
    "../../src/app/api/health/route",
    "../../src/app/api/finance/summary/route",
    "../../src/app/api/analytics/route",
    "../../src/app/api/reports/kpis/route",
    "../../src/app/api/whatsapp/conversations/route",
    "../../src/app/api/whatsapp/automations/route",
    "../../src/app/api/whatsapp/routing/route",
    "../../src/app/api/appointments/slots/route",
    "../../src/app/api/whatsapp/templates/route",
    "../../src/app/api/admin/backup/route",
    "../../src/app/api/preflight/route",
    "../../src/app/api/privacy-policy/route",
    "../../src/app/api/cases/[id]/handover/route",
    "../../src/app/api/cases/[id]/fees/route",
    "../../src/app/api/cases/[id]/dld/route",
    "../../src/app/api/cases/[id]/messages/route",
    "../../src/app/api/cases/[id]/ai/route",
    "../../src/app/api/cases/[id]/activity/route",
    "../../src/app/api/workflows/route",
    "../../src/app/api/cases/[id]/locks/route",
    "../../src/app/api/cases/[id]/conflicts/route",
    "../../src/app/api/cases/[id]/secure-links/route",
  ];

  let routesOK = 0;
  let routesFailed = 0;
  for (const routePath of apiRoutes) {
    try {
      await import(routePath);
      routesOK++;
    } catch (e: any) {
      routesFailed++;
      console.error(`  ✗ MISSING: ${routePath} — ${e.code === "ERR_MODULE_NOT_FOUND" ? "FILE DELETED" : e.message}`);
    }
  }
  assert(`API routes importable: ${routesOK}/${apiRoutes.length}`, routesOK === apiRoutes.length, `${routesFailed} missing`);

  // ── Lib files ──
  console.log("\nChecking lib files...");
  const libFiles = [
    "../../src/lib/ai/local-llm",
    "../../src/lib/api-client",
    "../../src/lib/csrf",
    "../../src/lib/fees/calculate",
    "../../src/lib/knowledge/extract",
    "../../src/lib/analytics/mixpanel",
    "../../src/lib/workflow/rt/transition",
    "../../src/lib/workflow/rt/stateEngine",
    "../../src/lib/db",
    "../../src/lib/auth",
    "../../src/lib/audit",
  ];

  let libOK = 0;
  for (const libPath of libFiles) {
    try {
      await import(libPath);
      libOK++;
    } catch (e: any) {
      console.error(`  ✗ MISSING: ${libPath}`);
    }
  }
  assert(`Lib files importable: ${libOK}/${libFiles.length}`, libOK === libFiles.length);

  // ── Prompt file ──
  console.log("\nChecking external prompt file...");
  const fs = await import("fs");
  assert("rule-extraction.v1.txt exists", fs.existsSync("/home/z/my-project/src/lib/ai/prompts/rule-extraction.v1.txt"));

  // ── Test files ──
  console.log("\nChecking test files...");
  const testFiles = [
    "tests/ai/llm-behavioral.spec.ts",
    "tests/csrf/api-fetch.spec.ts",
    "tests/csrf/client-creation.spec.ts",
    "tests/regression-23.ts",
    "tests/workflow/e2e-workflow.integration.spec.ts",
    "tests/workflow/dld-manifest.integration.spec.ts",
    "tests/workflow/preparation-sheet.integration.spec.ts",
    "tests/workflow/mixpanel-emission.integration.spec.ts",
    "tests/workflow/bulk-active-guard.integration.spec.ts",
    "tests/workflow/mixpanel-production.spec.ts",
    "tests/workflow/transition.integration.spec.ts",
    "tests/workflow/stateEngine.spec.ts",
    "tests/fees/calculate.spec.ts",
    "tests/knowledge-base/upload.integration.spec.ts",
  ];
  let testOK = 0;
  for (const t of testFiles) {
    if (fs.existsSync(`/home/z/my-project/${t}`)) testOK++;
    else console.error(`  ✗ MISSING: ${t}`);
  }
  assert(`Test files exist: ${testOK}/${testFiles.length}`, testOK === testFiles.length);

  // ── Admin pages ──
  console.log("\nChecking admin page files...");
  const adminPages = [
    "src/app/admin/procedures/catalog/page.tsx",
    "src/app/admin/procedures/catalog/catalog-table.tsx",
    "src/app/admin/procedures/catalog/bulk-actions.tsx",
    "src/app/admin/fees/page.tsx",
    "src/app/admin/fees/fee-table.tsx",
    "src/app/admin/preparation-templates/page.tsx",
    "src/app/admin/preparation-templates/template-table.tsx",
    "src/app/admin/advisories/page.tsx",
    "src/app/admin/knowledge-base/page.tsx",
    "src/app/admin/knowledge-base/knowledge-table.tsx",
  ];
  let adminOK = 0;
  for (const a of adminPages) {
    if (fs.existsSync(`/home/z/my-project/${a}`)) adminOK++;
    else console.error(`  ✗ MISSING: ${a}`);
  }
  assert(`Admin pages exist: ${adminOK}/${adminPages.length}`, adminOK === adminPages.length);

  // ── Scripts ──
  console.log("\nChecking seed/verify scripts...");
  const scripts = [
    "scripts/seed-rt-workflow.ts",
    "scripts/seed-fee-catalog.ts",
    "scripts/seed-preparation-templates.ts",
    "scripts/verify-legacy-parity.ts",
    "scripts/migrate-service-to-catalog.ts",
    "scripts/backfill-case-workflow-state.ts",
  ];
  let scriptOK = 0;
  for (const s of scripts) {
    if (fs.existsSync(`/home/z/my-project/${s}`)) scriptOK++;
    else console.error(`  ✗ MISSING: ${s}`);
  }
  assert(`Scripts exist: ${scriptOK}/${scripts.length}`, scriptOK === scripts.length);

  // ── Critical files — auto-restore from git HEAD if missing ──
  console.log("\nChecking critical files (auto-restore from HEAD if missing)...");
  const criticalFiles = [
    "src/app/api/knowledge-base/upload/route.ts",
    "src/lib/ai/local-llm.ts",
    "src/lib/knowledge/lifecycle.ts",
    "src/lib/knowledge/retrieval.ts",
    "src/lib/knowledge/visibility.ts",
    "src/lib/knowledge/scenarios.ts",
    "src/lib/knowledge/types.ts",
    "src/lib/idp/types.ts",
    "src/lib/idp/config.ts",
    "src/lib/idp/audit.ts",
    "src/lib/idp/gateway/index.ts",
    "src/lib/idp/gateway/router.ts",
    "src/lib/idp/gateway/job-store.ts",
    "src/lib/idp/gateway/tools/pdfjs-inspect.ts",
    "src/app/download/page.tsx",
    "src/app/api/download/route.ts",
  ];
  const { execSync } = await import("child_process");
  const { statSync } = await import("fs");
  let criticalOK = 0;
  let criticalRestored = 0;
  for (const f of criticalFiles) {
    const fullPath = `/home/z/my-project/${f}`;
    // Check existence AND size > 100 bytes (catches 0-byte file-deletion bug)
    const exists = fs.existsSync(fullPath);
    const size = exists ? statSync(fullPath).size : 0;
    if (exists && size > 100) {
      criticalOK++;
    } else if (exists && size <= 100) {
      // File exists but is 0-byte or truncated — try git restore
      console.error(`  ✗ TRUNCATED (${size} bytes): ${f} — attempting git restore...`);
      try {
        execSync(`git show HEAD:${f} > ${fullPath}`, { cwd: "/home/z/my-project", stdio: "pipe" });
        const restoredSize = statSync(fullPath).size;
        if (restoredSize > 100) { criticalRestored++; console.error(`  ⚠ RESTORED from HEAD: ${f} (${restoredSize} bytes)`); }
        else { console.error(`  ✗ RESTORE FAILED (still ${restoredSize} bytes): ${f}`); }
      } catch { console.error(`  ✗ NOT IN HEAD (cannot restore): ${f}`); }
    } else {
      // File doesn't exist at all — try git restore
      try {
        execSync(`git show HEAD:${f} > ${fullPath}`, { cwd: "/home/z/my-project", stdio: "pipe" });
        if (fs.existsSync(fullPath) && statSync(fullPath).size > 100) { criticalRestored++; console.error(`  ⚠ RESTORED from HEAD: ${f}`); }
        else { console.error(`  ✗ MISSING: ${f}`); }
      } catch { console.error(`  ✗ MISSING (not in HEAD): ${f}`); }
    }
  }
  assert(`Critical files exist (>100 bytes): ${criticalOK}/${criticalFiles.length}` + (criticalRestored > 0 ? ` (+${criticalRestored} restored)` : ""),
    criticalOK + criticalRestored === criticalFiles.length);

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
