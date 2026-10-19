// scripts/backfill-case-workflow-state.ts
// Part 7 / Issue 2 — Backfill Case.workflowState from the existing status field.
//
// Every existing Case row has workflowState = NULL (the field was added without
// a default). Null → "draft" is wrong for cases that finished last year.
// This script infers the correct workflow state from Case.status (CaseStatus
// enum) and writes it back.
//
// Mapping (CaseStatus enum → workflowState):
//   DRAFT, NEW_INTAKE_COMPLETED, AWAITING_CLIENT_DOCUMENTS, DOCUMENTS_UPLOADED,
//   UNDER_OFFICER_REVIEW, AWAITING_CLIENT_APPOINTMENT, AWAITING_PAYMENT,
//   ACCOUNTS_LOCKED, REJECTED_TO_DESK_BY_ACCOUNTS  →  draft
//   RETURNED_FOR_CORRECTION                            →  requires_modification
//   READY_FOR_MANAGER_REVIEW, MANAGER_APPROVED_READY_FOR_DLD,
//   SUBMITTED_TO_DLD_MANUALLY                          →  not_received
//   DLD_PROCESSING_IN_PROGRESS                         →  received
//   REJECTED_ON_HOLD                                   →  rejected
//   CANCELLED                                          →  cancelled
//   COMPLETED, CLOSED, ARCHIVED                        →  completed
//
// Run: npx tsx scripts/backfill-case-workflow-state.ts
// Idempotent: only updates rows where workflowState is null.
// After this script reports 0 remaining nulls, the schema can be tightened:
//   workflowState String @default("draft")  (non-nullable)

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Mapping from CaseStatus enum value to RT workflow state code.
// Conservative: anything ambiguous defaults to "draft" (the safest non-terminal
// state — the user can re-drive it through the workflow).
const STATUS_TO_WORKFLOW: Record<string, string> = {
  // Draft family — case is being prepared, not yet submitted to TABU
  DRAFT:                          "draft",
  NEW_INTAKE_COMPLETED:           "draft",
  AWAITING_CLIENT_DOCUMENTS:      "draft",
  DOCUMENTS_UPLOADED:             "draft",
  UNDER_OFFICER_REVIEW:           "draft",
  AWAITING_CLIENT_APPOINTMENT:    "draft",
  AWAITING_PAYMENT:               "draft",
  ACCOUNTS_LOCKED:                "draft",
  REJECTED_TO_DESK_BY_ACCOUNTS:   "draft",

  // Returned — officer needs to fix something before resubmitting
  RETURNED_FOR_CORRECTION:        "requires_modification",

  // Approved/Submitted — ready for or already at TABU, awaiting receipt
  READY_FOR_MANAGER_REVIEW:       "not_received",
  MANAGER_APPROVED_READY_FOR_DLD: "not_received",
  SUBMITTED_TO_DLD_MANUALLY:      "not_received",

  // In TABU's hands, being processed
  DLD_PROCESSING_IN_PROGRESS:     "received",

  // Terminal states
  REJECTED_ON_HOLD:               "rejected",
  CANCELLED:                      "cancelled",
  COMPLETED:                      "completed",
  CLOSED:                         "completed",
  ARCHIVED:                       "completed",
};

async function main() {
  console.log("=== Case.workflowState backfill ===\n");

  // Pre-flight: count rows by status for the deployment report
  const cases = await db.case.findMany({
    where: { workflowState: null },
    select: { id: true, caseRef: true, status: true },
  });

  console.log(`Cases with null workflowState: ${cases.length}\n`);

  if (cases.length === 0) {
    console.log("✓ All cases already have workflowState set — nothing to backfill");
    const stillNull = await db.case.count({ where: { workflowState: null } });
    console.log(`\nFinal null count: ${stillNull}`);
    if (stillNull === 0) {
      console.log("→ Schema can be tightened: workflowState String @default(\"draft\")  (non-nullable)");
    }
    await db.$disconnect();
    return;
  }

  // Pre-flight distribution (for the deployment report)
  const preFlight: Record<string, number> = {};
  for (const c of cases) {
    const target = STATUS_TO_WORKFLOW[c.status] ?? "draft";
    preFlight[target] = (preFlight[target] ?? 0) + 1;
  }
  console.log("Pre-flight distribution (inferred from Case.status):");
  for (const [state, count] of Object.entries(preFlight)) {
    console.log(`  ${state.padEnd(22)} ${count}`);
  }
  console.log("");

  let updated = 0;
  const unmapped: { caseId: string; caseRef: string; status: string }[] = [];

  for (const c of cases) {
    const target = STATUS_TO_WORKFLOW[c.status];
    if (!target) {
      // Unknown status — default to "draft" but report for manual review
      unmapped.push({ caseId: c.id, caseRef: c.caseRef, status: c.status });
      await db.case.update({
        where: { id: c.id },
        data: { workflowState: "draft" },
      });
      updated++;
      continue;
    }

    await db.case.update({
      where: { id: c.id },
      data: { workflowState: target },
    });
    updated++;
  }

  console.log(`Updated: ${updated} rows`);

  if (unmapped.length > 0) {
    console.warn(`\n⚠ ${unmapped.length} cases had an unknown CaseStatus value (defaulted to "draft"):`);
    for (const u of unmapped.slice(0, 20)) {
      console.warn(`    • ${u.caseRef}  status=${u.status}`);
    }
    if (unmapped.length > 20) console.warn(`    ... and ${unmapped.length - 20} more`);
    console.warn(`\nAdd the missing status values to STATUS_TO_WORKFLOW in this script and re-run.`);
  }

  // Final verification — no nulls should remain
  const stillNull = await db.case.count({ where: { workflowState: null } });
  if (stillNull > 0) {
    console.error(`\n✗ ${stillNull} cases still have null workflowState — backfill failed`);
    await db.$disconnect();
    process.exit(1);
  }

  console.log(`\n✓ All cases now have a non-null workflowState`);
  console.log(`\nNext step: tighten the schema:`);
  console.log(`  workflowState String @default("draft")  (was String?)`);
  console.log(`Then run: npx prisma migrate dev --name tighten_workflow_state`);

  // Post-backfill distribution
  const postFlight = await db.case.groupBy({
    by: ["workflowState"],
    _count: { _all: true },
  });
  console.log(`\nPost-backfill distribution:`);
  for (const row of postFlight) {
    console.log(`  ${(row.workflowState ?? "null").padEnd(22)} ${row._count._all}`);
  }

  await db.$disconnect();
}

main().catch(e => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
