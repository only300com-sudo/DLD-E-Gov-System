import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const convs = await p.waConversation.findMany({
  where: { contactId: "cmup6o5a10087phbu9hz9wl1h" },
  select: { id: true, status: true, contactId: true },
});
console.log(`Conversations for Ahmed (z9wl1h): ${convs.length}`);
for (const c of convs) console.log(`  id=${c.id?.slice(-6)}, status=${c.status}, contactId=${c.contactId?.slice(-6)}`);

// Also check the template
const tpl = await p.waTemplate.findUnique({ where: { name: "ejari_completion" }, select: { name: true, metaStatus: true, isActive: true, bodyEn: true } });
console.log(`\nejari_completion template: name=${tpl?.name}, metaStatus=${tpl?.metaStatus}, isActive=${tpl?.isActive}`);
console.log(`bodyEn: ${tpl?.bodyEn?.slice(0, 100)}`);

// Check consent
const consent = await p.waConsentRecord.findFirst({
  where: { contactId: "cmup6o5a10087phbu9hz9wl1h", channel: "whatsapp", purpose: "service", status: "opted_in" },
  select: { id: true, status: true },
});
console.log(`\nConsent: ${consent?.status ?? "none found"}`);
await p.$disconnect();
