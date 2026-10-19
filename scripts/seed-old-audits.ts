// scripts/seed-old-audits.ts
// Seed some older AuditLog entries so the dashboard filter visibly changes numbers
// when the user switches period (1d vs 7d vs 14d vs 30d).

import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const ACTIONS = [
  "LOGIN_SUCCESS", "LOGIN_FAILED", "DOCUMENT_VIEWED", "DOCUMENT_DOWNLOADED",
  "CASE_OPENED", "FEE_ADJUSTED", "PREFLIGHT_ITEM_CHECKED", "WHATSAPP_MESSAGE_SENT",
  "USER_ROLE_CHANGED", "BACKUP_STARTED", "CSRF_INVALID", "LEGAL_HOLD_SET",
];

const USER_IDS: string[] = [];

async function main() {
  const users = await p.user.findMany({ select: { id: true, name: true, role: true } });
  console.log(`Found ${users.length} users`);
  const adminId = users.find((u) => u.role === "ADMIN")?.id;
  const managerId = users.find((u) => u.role === "TRUSTEE_MANAGER")?.id;
  if (!adminId || !managerId) throw new Error("Admin or Manager user not found");

  const now = Date.now();
  // Spread 80 audit entries across 60 days
  for (let i = 0; i < 80; i++) {
    const daysAgo = Math.floor(Math.random() * 60) + 1; // 1-60 days ago
    const ts = new Date(now - daysAgo * 86400000 - Math.floor(Math.random() * 86400000));
    const action = ACTIONS[i % ACTIONS.length];
    const userId = (i % 3 === 0) ? managerId : adminId;
    const details = `[seed-old] ${action} — synthetic entry from ${daysAgo}d ago for dashboard filter verification`;
    try {
      await p.auditLog.create({
        data: {
          userId,
          action,
          entity: "Seed",
          entityId: `seed-old-${i}`,
          details,
          hash: `seed-old-${i}-${ts.getTime()}`,
          createdAt: ts,
        },
      });
    } catch (e) {
      // ignore — hash may collide if re-run; safe to skip
    }
  }
  console.log("Seeded 80 old audit log entries spread across 60 days");
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
