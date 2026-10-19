// tests/enhancements/feedback.spec.ts
// Enhancement 4 — Happiness Feedback System behavioral tests
// Run: npx tsx tests/enhancements/feedback.spec.ts

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

let testsPassed = 0;
let testsFailed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) { testsPassed++; console.log(`  ✓ ${name}`); }
  else { testsFailed++; console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
}

async function main() {
  console.log("=== Enhancement 4 — Happiness Feedback System Tests ===\n");

  // ── Setup ──
  const branch = await db.branch.findFirst({ select: { id: true } });
  const user = await db.user.findFirst({ where: { role: "TRUSTEE_OFFICER", active: true }, select: { id: true, branchId: true } });
  const manager = await db.user.findFirst({ where: { role: "TRUSTEE_MANAGER", active: true }, select: { id: true, branchId: true } });
  const testCase = await db.case.findFirst({ select: { id: true, caseRef: true } });
  if (!branch || !user || !manager || !testCase) { console.error("Setup failed"); process.exit(1); }

  // ── Test 1: Create internal feedback ──
  console.log("Test 1: Create internal feedback (officer after case completion)");
  {
    const feedback = await db.feedbackEntry.create({
      data: {
        branchId: branch.id,
        caseId: testCase.id,
        transactionType: "case_completion",
        sourceType: "internal",
        sourceUserId: user.id,
        rating: 4,
        category: "speed",
        comment: "The handover process was smooth but took longer than expected.",
        tags: JSON.stringify(["missing_docs", "slow_handover"]),
        status: "new",
      },
    });
    assert("Feedback entry created with id", !!feedback.id);
    assert("sourceType = internal", feedback.sourceType === "internal");
    assert("rating = 4", feedback.rating === 4);
    assert("category = speed", feedback.category === "speed");
    assert("status = new", feedback.status === "new");
    assert("tags parsed correctly", JSON.parse(feedback.tags).includes("missing_docs"));

    // Cleanup
    await db.feedbackEntry.delete({ where: { id: feedback.id } });
  }

  // ── Test 2: Create client feedback ──
  console.log("\nTest 2: Create client feedback (from client after case completion)");
  {
    const clientUser = await db.user.findFirst({ where: { role: "CLIENT", active: true }, select: { id: true } });
    const client = await db.client.findFirst({ select: { id: true } });
    const feedback = await db.feedbackEntry.create({
      data: {
        branchId: branch.id,
        caseId: testCase.id,
        transactionType: "case_completion",
        sourceType: "client",
        sourceClientId: client?.id,
        rating: 5,
        category: "overall",
        comment: "Excellent service, very professional.",
        tags: JSON.stringify(["professional", "fast"]),
        status: "new",
      },
    });
    assert("Client feedback created", !!feedback.id);
    assert("sourceType = client", feedback.sourceType === "client");
    assert("rating = 5", feedback.rating === 5);

    await db.feedbackEntry.delete({ where: { id: feedback.id } });
  }

  // ── Test 3: Status workflow transitions ──
  console.log("\nTest 3: Status workflow (new → acknowledged → in_review → resolved)");
  {
    const feedback = await db.feedbackEntry.create({
      data: {
        branchId: branch.id,
        transactionType: "case_completion",
        sourceType: "internal",
        sourceUserId: user.id,
        rating: 3,
        category: "clarity",
        comment: "Requirements were unclear.",
        tags: JSON.stringify(["unclear_requirements"]),
        status: "new",
      },
    });

    // new → acknowledged
    await db.feedbackEntry.update({ where: { id: feedback.id }, data: { status: "acknowledged" } });
    const ack = await db.feedbackEntry.findUnique({ where: { id: feedback.id }, select: { status: true } });
    assert("Status = acknowledged", ack?.status === "acknowledged");

    // acknowledged → in_review
    await db.feedbackEntry.update({ where: { id: feedback.id }, data: { status: "in_review", assignedToUserId: manager.id } });
    const inReview = await db.feedbackEntry.findUnique({ where: { id: feedback.id }, select: { status: true, assignedToUserId: true } });
    assert("Status = in_review", inReview?.status === "in_review");
    assert("Assigned to manager", inReview?.assignedToUserId === manager.id);

    // in_review → resolved
    await db.feedbackEntry.update({ where: { id: feedback.id }, data: { status: "resolved", resolutionNote: "Added clarification to the checklist.", resolvedAt: new Date() } });
    const resolved = await db.feedbackEntry.findUnique({ where: { id: feedback.id }, select: { status: true, resolutionNote: true, resolvedAt: true } });
    assert("Status = resolved", resolved?.status === "resolved");
    assert("Has resolution note", !!resolved?.resolutionNote);
    assert("Has resolvedAt", !!resolved?.resolvedAt);

    await db.feedbackEntry.delete({ where: { id: feedback.id } });
  }

  // ── Test 4: Dismiss feedback with reason ──
  console.log("\nTest 4: Dismiss feedback with reason");
  {
    const feedback = await db.feedbackEntry.create({
      data: {
        branchId: branch.id,
        transactionType: "case_completion",
        sourceType: "internal",
        sourceUserId: user.id,
        rating: 1,
        category: "communication",
        comment: "No communication from reception.",
        tags: JSON.stringify([]),
        status: "new",
      },
    });

    await db.feedbackEntry.update({ where: { id: feedback.id }, data: { status: "dismissed", resolutionNote: "Duplicate of existing feedback entry." } });
    const dismissed = await db.feedbackEntry.findUnique({ where: { id: feedback.id }, select: { status: true, resolutionNote: true } });
    assert("Status = dismissed", dismissed?.status === "dismissed");
    assert("Has dismissal reason", !!dismissed?.resolutionNote);

    await db.feedbackEntry.delete({ where: { id: feedback.id } });
  }

  // ── Test 5: Branch isolation on feedback ──
  console.log("\nTest 5: Feedback is branch-scoped");
  {
    const feedback = await db.feedbackEntry.create({
      data: {
        branchId: branch.id,
        transactionType: "handover",
        sourceType: "internal",
        sourceUserId: user.id,
        rating: 4,
        category: "overall",
        comment: "Good handoff.",
        tags: JSON.stringify([]),
        status: "new",
      },
    });

    // Query with branch scope
    const scoped = await db.feedbackEntry.findMany({ where: { branchId: branch.id } });
    assert("Feedback queryable by branchId", scoped.length > 0);

    // Query with different branch — should return 0
    const otherBranch = await db.feedbackEntry.findMany({ where: { branchId: "nonexistent-branch" } });
    assert("Different branch returns 0 results", otherBranch.length === 0);

    await db.feedbackEntry.delete({ where: { id: feedback.id } });
  }

  // ── Test 6: Dashboard aggregation queries ──
  console.log("\nTest 6: Dashboard aggregation queries work");
  {
    // Create 3 feedback entries with different ratings
    for (let i = 0; i < 3; i++) {
      await db.feedbackEntry.create({
        data: {
          branchId: branch.id,
          transactionType: "case_completion",
          sourceType: i === 0 ? "internal" : "client",
          sourceUserId: i === 0 ? user.id : undefined,
          rating: i + 3, // 3, 4, 5
          category: ["speed", "clarity", "overall"][i],
          comment: `Test feedback ${i}`,
          tags: JSON.stringify([`tag${i}`]),
          status: ["new", "acknowledged", "resolved"][i],
        },
      });
    }

    // Average rating
    const allFeedback = await db.feedbackEntry.findMany({ where: { branchId: branch.id } });
    const avgRating = allFeedback.reduce((s, f) => s + f.rating, 0) / allFeedback.length;
    assert("Average rating computed", avgRating > 0 && avgRating <= 5, `got ${avgRating}`);

    // Status distribution
    const byStatus = allFeedback.reduce((acc, f) => {
      acc[f.status] = (acc[f.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    assert("Status distribution has multiple statuses", Object.keys(byStatus).length >= 3, `got ${Object.keys(byStatus).join(", ")}`);

    // Category breakdown
    const byCategory = allFeedback.reduce((acc, f) => {
      acc[f.category] = (acc[f.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    assert("Category breakdown has 3 categories", Object.keys(byCategory).length >= 3);

    // Cleanup
    await db.feedbackEntry.deleteMany({ where: { branchId: branch.id } });
  }

  // ── Test 7: Permissions for feedback ──
  console.log("\nTest 7: Permissions for feedback (viewFeedback, manageFeedback)");
  {
    const { can } = await import("../../src/config/permissions");
    assert("Officer can viewFeedback", can("TRUSTEE_OFFICER", "viewFeedback") === true);
    assert("Manager can viewFeedback", can("TRUSTEE_MANAGER", "viewFeedback") === true);
    assert("Admin can viewFeedback", can("ADMIN", "viewFeedback") === true);
    assert("Reception CANNOT viewFeedback", can("RECEPTION_ADMIN", "viewFeedback") === false);
    assert("Manager can manageFeedback", can("TRUSTEE_MANAGER", "manageFeedback") === true);
    assert("Officer CANNOT manageFeedback", can("TRUSTEE_OFFICER", "manageFeedback") === false);
  }

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  await db.$disconnect();
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
