import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const users = await db.user.findMany({
  where: { role: { in: ["TRUSTEE_OFFICER", "ADMIN"] } },
  select: { id: true, email: true, role: true, totpEnabled: true, totpSecret: true, name: true }
});
console.log(JSON.stringify(users, null, 2));
await db.$disconnect();
