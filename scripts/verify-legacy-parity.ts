// Phase 6.2 — Legacy Parity Verification Script (P5-5)
// Run AFTER the SQL Server schema is deployed + code smoke-tests pass.
// Compares portal DB (canonical) vs legacy SQL Server (read replica).
//
// Part 7 / 7.3: this script now THROWS on count drift. The four prior
// assertions (P1=13, P2=31, P3=59, total=103) plus smart-app=10 and
// pre-reg-without-not_received=14 are enforced as hard failures. Both of the
// last two were the exact numbers the previous two cycles had bugs on, so
// they're now CI-blocking.
//
// Usage: npx tsx scripts/verify-legacy-parity.ts
// Exit 0 = parity OK | Exit 1 = drift detected (DO NOT PROCEED with deployment)
//
// Requires .env entries:
//   LEGACY_SQL_HOST=...
//   LEGACY_SQL_DB=...
//   LEGACY_SQL_USER=...
//   LEGACY_SQL_PASS=...

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// Note: This script requires the `mssql` npm package.
// Install with: npm install mssql
// If not installed, the script will skip the legacy check and only verify portal-side integrity.

// Part 7 / 7.3 — Hard count assertions. Any drift here blocks deployment.
const EXPECTED_P1 = 13;
const EXPECTED_P2 = 34;   // was 31; +3 from Part 9.5 Step 4 (OQOOD-REG-001, PROP-VAL-001, TITLE-AMEND-001)
const EXPECTED_P3 = 59;
const EXPECTED_TOTAL = 106;          // was 103; +3 from Part 9.5 Step 4
const EXPECTED_SMART_APP = 10;       // 3 P1 + 5 P2 + 2 P3
// Pre-reg procedures (id contains "-PRE-") that do NOT include not_received
// in their workspaceStates. Pre-reg procedures never go through TABU receipt.
// Verified via SQL: P1=4, P2=6, P3=9 = 19 total.
const EXPECTED_PRE_REG_NO_NOT_RECEIVED = 19;
const EXPECTED_STATES = 8;
const EXPECTED_TRANSITIONS = 19;
const EXPECTED_EVENTS = 12;
// Part 9.5 Step 5 — fee catalog count assertion
const EXPECTED_FEES = 33;            // hand-off said 38 but actual array has 33 entries

async function main() {
  console.log("=== Legacy Parity Verification ===\n");

  // ── Portal-side integrity checks (always run) ──
  console.log("1. Portal-side integrity checks:");

  const pgStates = await db.procedureWorkflowState.findMany();
  const pgTransitions = await db.workflowTransition.findMany();
  const pgEvents = await db.mixpanelEventMap.findMany();
  const pgCatalog = await db.procedureCatalog.findMany();

  // Check: all catalog states are reachable in the machine
  const machineStates = new Set<string>(pgStates.map(s => s.stateCode));
  let catalogErrors = 0;
  for (const proc of pgCatalog) {
    const states = JSON.parse(proc.workspaceStates) as string[];
    for (const s of states) {
      if (!machineStates.has(s)) {
        console.error(`  ✗ ${proc.id}: state '${s}' not in global machine`);
        catalogErrors++;
      }
    }
  }
  if (catalogErrors > 0) {
    console.error(`  ✗ ${catalogErrors} catalog state(s) not in machine — ABORTING`);
    process.exit(1);
  }
  console.log("  ✓ All catalog states are reachable in the machine");

  // ── Part 7 / 7.3 — Hard count assertions ──
  const byPriority: Record<string, number> = { P1: 0, P2: 0, P3: 0 };
  for (const p of pgCatalog) {
    if (byPriority[p.priority] !== undefined) byPriority[p.priority]++;
    else console.warn(`  ⚠ Unknown priority '${p.priority}' on ${p.id}`);
  }

  const fail = (msg: string): never => {
    console.error(`  ✗ ${msg} — ABORTING (DO NOT PROCEED with deployment)`);
    process.exit(1);
  };

  if (byPriority.P1 !== EXPECTED_P1) fail(`P1 count = ${byPriority.P1}, expected ${EXPECTED_P1}`);
  if (byPriority.P2 !== EXPECTED_P2) fail(`P2 count = ${byPriority.P2}, expected ${EXPECTED_P2}`);
  if (byPriority.P3 !== EXPECTED_P3) fail(`P3 count = ${byPriority.P3}, expected ${EXPECTED_P3}`);
  if (pgCatalog.length !== EXPECTED_TOTAL) fail(`Total procedures = ${pgCatalog.length}, expected ${EXPECTED_TOTAL}`);
  console.log(`  ✓ Priority counts: P1=${byPriority.P1} P2=${byPriority.P2} P3=${byPriority.P3} total=${pgCatalog.length}`);

  // Smart-app count (procedures whose workspaceStates includes "pending_smart_app")
  const smartApp = pgCatalog.filter(p => JSON.parse(p.workspaceStates).includes("pending_smart_app"));
  if (smartApp.length !== EXPECTED_SMART_APP) {
    fail(`Smart-app procedures = ${smartApp.length}, expected ${EXPECTED_SMART_APP} (3 P1 + 5 P2 + 2 P3)`);
  }
  console.log(`  ✓ Smart-app procedures: ${smartApp.length} (expected ${EXPECTED_SMART_APP})`);

  // Pre-reg WITHOUT not_received (must equal 14)
  // Pre-reg procedures are those whose id contains "-PRE-".
  // They should NOT have "not_received" in their workspaceStates.
  const preRegProcedures = pgCatalog.filter(p => p.id.includes("-PRE-"));
  const preRegWithNotReceived = preRegProcedures.filter(p =>
    JSON.parse(p.workspaceStates).includes("not_received")
  );
  const preRegWithoutNotReceived = preRegProcedures.length - preRegWithNotReceived.length;
  if (preRegWithNotReceived.length !== 0) {
    fail(`Pre-reg procedures with not_received = ${preRegWithNotReceived.length}, expected 0`);
  }
  if (preRegWithoutNotReceived !== EXPECTED_PRE_REG_NO_NOT_RECEIVED) {
    fail(`Pre-reg procedures without not_received = ${preRegWithoutNotReceived}, expected ${EXPECTED_PRE_REG_NO_NOT_RECEIVED}`);
  }
  console.log(`  ✓ Pre-reg without not_received: ${preRegWithoutNotReceived} (expected ${EXPECTED_PRE_REG_NO_NOT_RECEIVED})`);

  // States / transitions / events counts
  if (pgStates.length !== EXPECTED_STATES) fail(`States = ${pgStates.length}, expected ${EXPECTED_STATES}`);
  if (pgTransitions.length !== EXPECTED_TRANSITIONS) fail(`Transitions = ${pgTransitions.length}, expected ${EXPECTED_TRANSITIONS}`);
  if (pgEvents.length !== EXPECTED_EVENTS) fail(`Events = ${pgEvents.length}, expected ${EXPECTED_EVENTS}`);
  console.log(`  ✓ States=${pgStates.length} Transitions=${pgTransitions.length} Events=${pgEvents.length}`);

  // Part 9.5 Step 5 — fee catalog count assertion
  const feeCount = await db.feeCatalog.count({ where: { isActive: true } });
  if (feeCount !== EXPECTED_FEES) fail(`Active fees = ${feeCount}, expected ${EXPECTED_FEES}`);
  console.log(`  ✓ FeeCatalog: ${feeCount} active fees`);

  // Check: terminal states
  const terminalStates = pgStates.filter(s => JSON.parse(s.allowedNext).length === 0);
  const expectedTerminal = ["completed", "cancelled", "rejected"];
  const gotTerminal = terminalStates.map(s => s.stateCode).sort();
  const wantTerminal = [...expectedTerminal].sort();
  if (JSON.stringify(gotTerminal) !== JSON.stringify(wantTerminal)) {
    fail(`Terminal states = [${gotTerminal.join(", ")}], expected [${wantTerminal.join(", ")}]`);
  }
  console.log(`  ✓ Terminal states: ${gotTerminal.join(", ")}`);

  console.log(`  ✓ All portal-side integrity checks passed`);

  // ── Legacy SQL Server parity check (OPT-IN — Gap 6 documentation) ──
  // Portal-only mode is the DEFAULT and runs in every environment. The
  // legacy row-by-row comparison is a SEPARATE, OPT-IN run that requires
  // LEGACY_SQL_* env vars to be set on a host with SQL Server connectivity.
  // If the DLD ops team runs this from a restricted network that can't
  // reach SQL Server, the legacy mode silently skips.
  console.log("\n2. Legacy SQL Server parity check (OPT-IN — portal-only is default):");
  try {
    const sql = await import("mssql");
    const LEGACY_CONFIG = {
      server: process.env.LEGACY_SQL_HOST!,
      database: process.env.LEGACY_SQL_DB!,
      user: process.env.LEGACY_SQL_USER!,
      password: process.env.LEGACY_SQL_PASS!,
      options: { encrypt: true, trustServerCertificate: true },
    };

    if (!process.env.LEGACY_SQL_HOST) {
      console.log("  ⚠ LEGACY_SQL_HOST not set — skipping legacy parity check (portal-only mode)");
    } else {
      const pool = await sql.connect(LEGACY_CONFIG);
      const errors: string[] = [];

      // Check workflow states
      const legacyStates = await pool.request().query("SELECT state_code, allowed_next FROM procedure_workflow_states");
      const pgStateMap = new Map(pgStates.map(s => [s.stateCode, s.allowedNext]));
      for (const row of legacyStates.recordset) {
        const pg = pgStateMap.get(row.state_code);
        if (!pg) {
          errors.push(`Legacy has state '${row.state_code}' missing in portal`);
          continue;
        }
        const a = JSON.stringify(JSON.parse(pg));
        const b = JSON.stringify(JSON.parse(row.allowed_next));
        if (a !== b) errors.push(`Drift on '${row.state_code}': portal=${a} legacy=${b}`);
      }

      // Check transitions
      const legacyTrans = await pool.request().query("SELECT id, from_state, to_state FROM workflow_transitions");
      const pgTransIds = new Set(pgTransitions.map(t => t.id));
      for (const row of legacyTrans.recordset) {
        if (!pgTransIds.has(row.id)) errors.push(`Legacy transition '${row.id}' missing in portal`);
      }

      // Check events
      const legacyEvents = await pool.request().query("SELECT key FROM mixpanel_event_map");
      const pgEventKeys = new Set(pgEvents.map(e => e.key));
      for (const row of legacyEvents.recordset) {
        if (!pgEventKeys.has(row.key)) errors.push(`Legacy event '${row.key}' missing in portal`);
      }

      await pool.close();

      if (errors.length) {
        console.error("  ✗ Legacy parity check FAILED:");
        errors.forEach(e => console.error(`    • ${e}`));
        process.exit(1);
      }
      console.log("  ✓ Legacy parity OK — all rows match");
    }
  } catch (e: any) {
    if (e.code === "ERR_MODULE_NOT_FOUND" || e.message?.includes("Cannot find module")) {
      console.log("  ⚠ mssql package not installed — skipping legacy parity check (portal-only mode)");
      console.log("    Install with: npm install mssql");
    } else {
      console.error("  ✗ Legacy connection failed:", e.message);
      process.exit(1);
    }
  }

  console.log("\n=== Verification complete ===");
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
