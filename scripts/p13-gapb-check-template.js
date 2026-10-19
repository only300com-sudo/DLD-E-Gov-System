import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const sysUser = await db.user.findFirst({ where: { email: "system@trustee.local" } });
console.log("system@trustee.local:", sysUser?.id ?? "NOT FOUND");
const adminUser = await db.user.findFirst({ where: { email: "admin@trustee.ae" } });
console.log("admin@trustee.ae:", adminUser?.id ?? "NOT FOUND");
const tpl = await db.waTemplate.findFirst({ where: { name: "appointment_confirmation" } });
console.log("appointment_confirmation template:", tpl?.id ?? "NOT FOUND", "vars:", tpl?.variables);
await db.$disconnect();
