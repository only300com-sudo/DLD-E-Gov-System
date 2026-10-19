// src/lib/auth/branch-scope.ts
// Enhancement 1 — Multi-Branch Auto-Isolation
// Server-side helper that returns a Prisma where-filter scoped to the user's branch.
// Admin (super_admin) gets no filter (sees all branches). All other roles get
// { branchId: user.branchId } — they only see their own branch's data.
//
// Usage in API routes:
//   import { withBranchScope } from "@/lib/auth/branch-scope";
//   const scope = withBranchScope(user);
//   const cases = await db.case.findMany({ where: { ...scope, status: "DRAFT" } });
//
// Cross-branch access attempts (requesting a resource from another branch)
// are logged to the audit hash chain.

import { logAudit } from "@/lib/audit";

interface SessionUser {
  id: string;
  role: string;
  branchId?: string | null;
}

/**
 * Returns a Prisma where-filter that scopes queries to the user's branch.
 * ADMIN role → {} (no filter, sees all branches)
 * All other roles → { branchId: user.branchId } (sees only their branch)
 */
export function withBranchScope(user: SessionUser): Record<string, unknown> {
  if (user.role === "ADMIN") {
    return {};
  }
  return { branchId: user.branchId ?? null };
}

/**
 * Verify that a resource belongs to the user's branch.
 * If not, log a cross-branch access attempt to the audit chain and return false.
 *
 * Usage:
 *   const allowed = await assertBranchAccess(user, resource.branchId, "case", resource.id);
 *   if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
 */
export async function assertBranchAccess(
  user: SessionUser,
  resourceBranchId: string | null | undefined,
  entityType: string,
  entityId: string,
  req?: { headers: { get: (n: string) => string | null } },
): Promise<boolean> {
  // Admin can access any branch
  if (user.role === "ADMIN") return true;

  // If resource has no branchId, allow (legacy data)
  if (!resourceBranchId) return true;

  // If user has no branchId, deny
  if (!user.branchId) {
    await logAudit({
      userId: user.id,
      action: "CROSS_BRANCH_ACCESS_DENIED",
      entity: entityType,
      entityId,
      details: `User ${user.id} (no branch) attempted to access ${entityType} ${entityId} (branchId=${resourceBranchId})`,
      ipAddress: req?.headers?.get("x-forwarded-for") ?? undefined,
    }).catch(() => {});
    return false;
  }

  // If branch matches, allow
  if (user.branchId === resourceBranchId) return true;

  // Cross-branch access — log to audit chain
  await logAudit({
    userId: user.id,
    action: "CROSS_BRANCH_ACCESS_DENIED",
    entity: entityType,
    entityId,
    details: `User ${user.id} (branchId=${user.branchId}) attempted to access ${entityType} ${entityId} (branchId=${resourceBranchId}) — DENIED`,
    ipAddress: req?.headers?.get("x-forwarded-for") ?? undefined,
  }).catch(() => {});

  return false;
}
