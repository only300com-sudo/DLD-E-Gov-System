// scripts/phase13-seed.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("[SEED-P13] Phase 13 — starting…");
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, name: true } });
  if (!admin) throw new Error("Admin not found");

  // 1. DLD API configs (both disabled)
  for (const env of ["sandbox", "production"]) {
    const existing = await prisma.dldApiConfig.findUnique({ where: { environment: env } });
    if (!existing) {
      await prisma.dldApiConfig.create({
        data: { environment: env, baseUrl: env === "sandbox" ? "https://sandbox.dubailand.gov.ae/api" : null, isEnabled: false, healthStatus: "unknown", rateLimitPerMin: 60 },
      });
    }
  }
  console.log("[SEED-P13] 2 DLD API configs (sandbox + production, both disabled)");

  // 2. 6 WhatsApp templates for Ejari
  const templates = [
    { name: "ejari_requirements", bodyEn: "Thank you for your Ejari inquiry (Ref: {{case_number}}). Required documents: {{requirements}}. Please upload via: {{upload_link}}. This link expires in 72 hours.", bodyAr: "شكراً لاستفسارك عن إيجاري (مرجع: {{case_number}}). المستندات المطلوبة: {{requirements}}. يرجى الرفع عبر: {{upload_link}}. تنتهي صلاحية الرابط خلال 72 ساعة." },
    { name: "ejari_docs_received", bodyEn: "Dear {{client_name}}, we have received all your documents for Ejari case {{case_number}}. Our team is reviewing them. You will be notified once verification is complete.", bodyAr: "عزيزي {{client_name}}، لقد استلمنا جميع مستنداتك لحالة إيجاري {{case_number}}. فريقنا يراجعها. سيتم إبلاغك عند اكتمال التحقق." },
    { name: "ejari_under_review", bodyEn: "Your Ejari case {{case_number}} is under review. We will contact you within 24 hours if any additional information is needed.", bodyAr: "حالة إيجاري الخاصة بك {{case_number}} قيد المراجعة. سنتواصل معك خلال 24 ساعة إذا لزم الأمر أي معلومات إضافية." },
    { name: "ejari_completion", bodyEn: "Dear {{client_name}}, your Ejari registration is complete! Ejari number: {{ejari_number}}. Certificate: {{certificate_link}}", bodyAr: "عزيزي {{client_name}}، اكتمل تسجيل إيجاري الخاص بك! رقم إيجاري: {{ejari_number}}. الشهادة: {{certificate_link}}" },
    { name: "ejari_rejection", bodyEn: "Dear {{client_name}}, your Ejari case {{case_number}} was rejected. Reason: {{reason}}. Please contact our office for assistance.", bodyAr: "عزيزي {{client_name}}، تم رفض حالة إيجاري {{case_number}}. السبب: {{reason}}. يرجى الاتصال بمكتبنا للمساعدة." },
    { name: "ejari_appointment_proposed", bodyEn: "Dear {{client_name}}, we have scheduled your Ejari appointment for {{appointment_date}}. Please confirm your attendance.", bodyAr: "عزيزي {{client_name}}، تم تحديد موعد إيجاري الخاص بك في {{appointment_date}}. يرجى تأكيد الحضور." },
  ];
  for (const t of templates) {
    const existing = await prisma.waTemplate.findUnique({ where: { name: t.name } });
    if (existing) continue;
    await prisma.waTemplate.create({
      data: { name: t.name, category: "utility", language: "en", bodyEn: t.bodyEn, bodyAr: t.bodyAr, variables: JSON.stringify(["case_number", "client_name", "requirements", "upload_link", "ejari_number", "certificate_link", "reason", "appointment_date"]), metaStatus: "approved", isActive: true },
    });
  }
  console.log(`[SEED-P13] ${templates.length} Ejari WhatsApp templates ensured`);

  // 3. 4 Ejari cases with different statuses
  const contacts = await prisma.waContact.findMany({ take: 2, select: { id: true, fullName: true, mobileE164: true } });
  
  const cases = [
    { caseNumber: "EJA-2026-0001", clientCode: "C-2026-0001", contactId: contacts[0]?.id ?? null, serviceType: "new_registration", mode: "manual", status: "docs_pending" },
    { caseNumber: "EJA-2026-0002", clientCode: "C-2026-0002", contactId: contacts[1]?.id ?? null, serviceType: "renewal", mode: "manual", status: "docs_received" },
    { caseNumber: "EJA-2026-0003", clientCode: "C-2026-0003", contactId: null, serviceType: "amendment", mode: "manual", status: "certificate_issued", dldReference: "EJ-2026-ABC123", certificateUrl: "/portal/ejari/EJA-2026-0003/certificate", certificateIssuedAt: new Date() },
    { caseNumber: "EJA-2026-0004", clientCode: "C-2026-0004", contactId: null, serviceType: "new_registration", mode: "manual", status: "rejected", rejectionReason: "Incomplete documentation — tenant Emirates ID expired" },
  ];

  for (const c of cases) {
    const existing = await prisma.ejariCase.findUnique({ where: { caseNumber: c.caseNumber } });
    if (existing) continue;
    await prisma.ejariCase.create({ data: { ...c, createdBy: admin.id } });
  }
  console.log(`[SEED-P13] ${cases.length} Ejari cases ensured`);

  // 4. EjariDocument rows (3 per case = 12 total)
  const allCases = await prisma.ejariCase.findMany({ select: { id: true, caseNumber: true, status: true } });
  for (const ec of allCases) {
    const existingDocs = await prisma.ejariDocument.count({ where: { ejariCaseId: ec.id } });
    if (existingDocs > 0) continue;
    
    const docTypes = ["emirates_id_tenant", "emirates_id_landlord", "title_deed", "tenancy_contract"];
    for (const dt of docTypes) {
      const verified = ec.status === "docs_received" || ec.status === "certificate_issued";
      await prisma.ejariDocument.create({
        data: {
          ejariCaseId: ec.id,
          documentType: dt,
          verificationStatus: verified ? "verified" : "pending",
          verifiedBy: verified ? admin.id : null,
          verifiedAt: verified ? new Date() : null,
          uploadedBy: admin.id,
        },
      });
    }
  }
  console.log("[SEED-P13] EjariDocument rows ensured (4 per case)");

  // 5. EjariStatusHistory rows
  for (const ec of allCases) {
    const existingHistory = await prisma.ejariStatusHistory.count({ where: { ejariCaseId: ec.id } });
    if (existingHistory > 0) continue;
    
    const transitions = [
      { from: null, to: "inquiry", reason: "Case created", days: 5 },
      { from: "inquiry", to: "docs_pending", reason: "Requirements sent to client", days: 4 },
      { from: "docs_pending", to: "docs_received", reason: "All documents verified", days: 3 },
      { from: "docs_received", to: ec.status, reason: `Transitioned to ${ec.status}`, days: 2 },
    ];
    for (const t of transitions) {
      await prisma.ejariStatusHistory.create({
        data: {
          ejariCaseId: ec.id,
          fromStatus: t.from,
          toStatus: t.to,
          reason: t.reason,
          actorId: admin.id,
          actorRole: "system",
          createdAt: new Date(Date.now() - t.days * 86400000),
        },
      });
    }
  }
  console.log("[SEED-P13] EjariStatusHistory rows ensured (4 per case)");

  // 6. TenancyContract for case 2
  const case2 = await prisma.ejariCase.findUnique({ where: { caseNumber: "EJA-2026-0002" } });
  if (case2) {
    const existing = await prisma.tenancyContract.findUnique({ where: { ejariCaseId: case2.id } });
    if (!existing) {
      await prisma.tenancyContract.create({
        data: {
          ejariCaseId: case2.id,
          contractNumber: "TC-2026-001234",
          signedAt: new Date(),
          contractPdfPath: "/TrusteeCenterData/Clients/C-2026-0002/EJA-2026-0002/tenancy_contract.pdf",
          contractHash: crypto.randomUUID().replace(/-/g, "").slice(0, 64),
        },
      });
      console.log("[SEED-P13] 1 TenancyContract ensured");
    }
  }

  console.log("[SEED-P13] Phase 13 — done.");
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
