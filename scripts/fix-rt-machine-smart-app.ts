// scripts/fix-rt-machine-smart-app.ts
// Part 8A pre-flight fix — the seed-rt-workflow.ts sets draft.allowedNext to
// ["not_received", "received"] but transition t-009 (draft → pending_smart_app)
// exists in WorkflowTransition. The machine must include pending_smart_app
// in draft.allowedNext for the smart-app path (SALE-DEL-001, LTO-REG-001,
// CMP-SALE-MORT-001) to work.
//
// This script adds pending_smart_app to draft.allowedNext (idempotent —
// only adds if missing). Run after seed-rt-workflow.ts + fix-rt-flags.ts +
// fix-rt-catalog.ts.
//
// Run: npx tsx scripts/fix-rt-machine-smart-app.ts

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  console.log("=== Fix: add pending_smart_app to draft.allowedNext ===\n");

  const draft = await db.procedureWorkflowState.findUnique({
    where: { stateCode: "draft" },
  });
  if (!draft) {
    console.error("✗ 'draft' state not found in ProcedureWorkflowState");
    process.exit(1);
  }

  const allowedNext = JSON.parse(draft.allowedNext) as string[];
  console.log(`Current draft.allowedNext: ${JSON.stringify(allowedNext)}`);

  if (allowedNext.includes("pending_smart_app")) {
    console.log("✓ pending_smart_app already present — no change needed");
    await db.$disconnect();
    return;
  }

  // Insert pending_smart_app after the draft-appropriate entries.
  // Order doesn't matter for the engine (it uses .includes()), but for
  // human readability we put it in a sensible position.
  const newAllowedNext = [
    "pending_smart_app",
    ...allowedNext,
  ];

  await db.procedureWorkflowState.update({
    where: { stateCode: "draft" },
    data: { allowedNext: JSON.stringify(newAllowedNext) },
  });

  console.log(`✓ Updated draft.allowedNext: ${JSON.stringify(newAllowedNext)}`);

  // Verify
  const updated = await db.procedureWorkflowState.findUnique({
    where: { stateCode: "draft" },
    select: { allowedNext: true },
  });
  console.log(`Verified: ${updated?.allowedNext}`);

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
