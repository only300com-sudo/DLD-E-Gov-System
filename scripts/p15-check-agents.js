import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const agents = await db.agent.findMany({ select: { id: true, agentCode: true, fullName: true, email: true, userId: true, status: true } });
for (const a of agents) console.log(`${a.agentCode} ${a.fullName} | email=${a.email} | userId=${a.userId ?? "NULL"} | status=${a.status}`);
const users = await db.user.findMany({ where: { role: "AGENT" }, select: { id: true, email: true, name: true, active: true } });
console.log("\nAGENT role users:");
for (const u of users) console.log(`- id=${u.id} email=${u.email} name=${u.name} active=${u.active}`);
await db.$disconnect();
