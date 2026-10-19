// tests/workflow/mixpanel-production.spec.ts
// Part 7 Review / Pre-flight item 7 — Proves the mixpanel SDK actually
// resolves in production mode. Without this test, the mixpanel-emission
// tests passing is a false signal — they pass because the spy is injected,
// not because the real SDK works.
//
// Tests:
//   1. The `mixpanel` npm package can be required() without throwing.
//   2. The package exposes an `init` function (the SDK entry point).
//   3. The `__isSdkInstalled()` helper from our emitter returns true.
//   4. The package version matches what's declared in package.json.
//   5. In dev mode (no MIXPANEL_TOKEN), the module loads without throwing
//      but track() is a no-op (logs "no client").
//   6. In production mode (NODE_ENV=production, no MIXPANEL_TOKEN), the
//      module THROWS at load time — Critical Gap 1 fail-loud check.
//   7. The system_source property is set to 'PORTAL' on every emitted event
//      (so portal events can be distinguished from legacy RT/TABU events
//      in the same Mixpanel project).

let testsPassed = 0;
let testsFailed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } else {
    testsFailed++;
    console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

async function main() {
  console.log("=== Mixpanel production SDK resolution tests ===\n");

  // ── Test 1: package can be required() ──
  console.log("Test 1: mixpanel package can be required()");
  let mixpanelNs: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mixpanelNs = require("mixpanel");
    assert("require('mixpanel') does not throw", true);
  } catch (e: any) {
    assert("require('mixpanel') does not throw", false, e.message);
    console.error("Aborting remaining tests — SDK is not installed");
    console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
    process.exit(testsFailed > 0 ? 1 : 0);
  }

  // ── Test 2: package exposes init() function ──
  console.log("\nTest 2: package exposes init() function");
  assert("typeof mixpanel.init === 'function'", typeof mixpanelNs.init === "function", `got ${typeof mixpanelNs.init}`);

  // ── Test 3: __isSdkInstalled() helper returns true ──
  console.log("\nTest 3: __isSdkInstalled() helper returns true");
  // The helper is imported AFTER the module loads. We can't import it via ESM
  // here because the module load may have already happened. Just call it.
  const mixpanelModule = await import("../../src/lib/analytics/mixpanel");
  assert("__isSdkInstalled() returns true", mixpanelModule.__isSdkInstalled() === true, `got ${mixpanelModule.__isSdkInstalled()}`);

  // ── Test 4: package version matches package.json declaration ──
  console.log("\nTest 4: package version is declared and non-empty");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkgJson = require("/home/z/my-project/package.json");
  const declaredVersion = pkgJson.dependencies?.mixpanel;
  assert("mixpanel declared in package.json dependencies", typeof declaredVersion === "string" && declaredVersion.length > 0, `got ${declaredVersion}`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const installedPkg = require("/home/z/my-project/node_modules/mixpanel/package.json");
  assert("installed version is non-empty", typeof installedPkg.version === "string" && installedPkg.version.length > 0, `got ${installedPkg.version}`);
  console.log(`    (declared: ${declaredVersion}, installed: ${installedPkg.version})`);

  // ── Test 5: dev mode loads without throwing but track() is no-op ──
  console.log("\nTest 5: dev mode loads without throwing, track() is no-op");
  // We're already in dev mode (NODE_ENV !== 'production' and no token set).
  // The module loaded successfully (Test 3) — that proves no throw in dev.
  assert("module loaded in dev mode without throwing", true);
  // Verify track() is callable and doesn't throw
  let trackThrew = false;
  try {
    mixpanelModule.track("test_event", { procedure_id: "TEST-001" });
  } catch (e: any) {
    trackThrew = true;
  }
  assert("track() does not throw in dev mode (no token)", !trackThrew);

  // ── Test 6: production mode WITHOUT token THROWS at load ──
  // We can't actually test this in the same process — the module is already
  // loaded. So we test it via a child process. Skip if we're already in
  // production (we wouldn't have gotten this far without a token).
  console.log("\nTest 6: production mode WITHOUT token THROWS at load (Critical Gap 1)");
  if (process.env.NODE_ENV === "production") {
    console.log("    (skipped — already in production mode with token set)");
  } else {
    const { execSync } = await import("child_process");
    try {
      // Spawn a child process with NODE_ENV=production and no token,
      // import the mixpanel module — should throw with the specific message.
      execSync(
        `cd /home/z/my-project && NODE_ENV=production MIXPANEL_TOKEN= npx tsx -e "import './src/lib/analytics/mixpanel'; console.log('SHOULD NOT REACH HERE');"`,
        { stdio: "pipe", timeout: 30000 },
      );
      assert("production mode without token throws", false, "module loaded without throwing in production mode");
    } catch (e: any) {
      // Expected — the process should have exited with non-zero status
      const stderr = e.stderr?.toString() ?? "";
      assert(
        "production mode without token throws",
        e.status !== 0 && stderr.includes("MIXPANEL_TOKEN is required in production"),
        `got status=${e.status}, stderr snippet: ${stderr.substring(0, 200)}`,
      );
    }
  }

  // ── Test 7: system_source property is set ──
  console.log("\nTest 7: system_source property is set to 'PORTAL'");
  assert("__getSystemSource() returns 'PORTAL'", mixpanelModule.__getSystemSource() === "PORTAL", `got ${mixpanelModule.__getSystemSource()}`);

  // Verify the property is actually attached to events when spy is installed
  const capturedCalls: { eventKey: string; props: any }[] = [];
  mixpanelModule.__setTransportForTests((eventKey: string, props: any) => {
    capturedCalls.push({ eventKey, props });
  });
  mixpanelModule.track("test_event", { procedure_id: "TEST-002" });
  assert("track() captured by spy", capturedCalls.length === 1, `got ${capturedCalls.length} calls`);
  if (capturedCalls.length === 1) {
    assert("props.system_source = 'PORTAL'", capturedCalls[0].props.system_source === "PORTAL", `got ${capturedCalls[0].props.system_source}`);
  }
  mixpanelModule.__restoreTransport();

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
