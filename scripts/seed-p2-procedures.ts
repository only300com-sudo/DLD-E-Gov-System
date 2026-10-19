// scripts/seed-p2-procedures.ts
// Part 5.1 — P2 seed batch (28 new procedures)
// All P2 procedures carry correct per-procedure workspaceStates:
// - Pre-registration variants omit not_received
// - Smart-app-capable variants include pending_smart_app

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const PRE_REGISTRATION = /-PRE-/;
const SMART_APP_P2 = new Set([
  "SALE-PAY-001", "SALE-DELC-001", "LTO-MOD-001", "LTO-TRF-001", "FL-001",
]);

function statesFor(id: string, isSmartApp: boolean): string[] {
  const isPreReg = PRE_REGISTRATION.test(id);
  const s: string[] = ["draft"];
  if (isSmartApp) s.push("pending_smart_app");
  s.push("requires_modification");
  if (!isPreReg) s.push("not_received");
  s.push("received", "completed", "cancelled", "rejected");
  return s;
}

const P2_PROCEDURES = [
  // Sale (2)
  { id: "SALE-PAY-001", code: "SALE_PAYMENT_PLAN", legacy: "SALE_ON_PAYMENT_PLAN_View", cat: "Sale", en: "Sale on Payment Plan", ar: "بيع مقيد بسنوات الدفع", cplx: "M", smart: true },
  { id: "SALE-DELC-001", code: "SALE_DELAYED_COMPLETION", legacy: "CMP_SELL_DEL_View", cat: "Sale", en: "Delayed Sale Completion", ar: "استكمال بيع مؤجل", cplx: "M", smart: true },
  // LTO (5)
  { id: "LTO-REL-PRE-001", code: "LTO_RELEASE_PRE", legacy: "LEASE_TO_OWN_REL_PRE_View", cat: "LeaseToOwn", en: "LTO Release — Pre", ar: "فك إيجارة تنتهي بالتملك - تسجيل مبدئي", cplx: "M" },
  { id: "LTO-MOD-001", code: "LTO_MODIFY", legacy: "LEASE_TO_OWN_MDFY_View", cat: "LeaseToOwn", en: "LTO Modify", ar: "تعديل إيجارة تنتهى بالتملك", cplx: "M", smart: true },
  { id: "LTO-TRF-001", code: "LTO_TRANSFER", legacy: "LEASE_TO_OWN_TRNSFR_View", cat: "LeaseToOwn", en: "LTO Transfer", ar: "تحويل إيجارة تنتهى بالتملك", cplx: "M", smart: true },
  { id: "LTO-TRF-PRE-001", code: "LTO_TRANSFER_PRE", legacy: "LEASE_TO_OWN_TRNSFR_PRE_View", cat: "LeaseToOwn", en: "LTO Transfer — Pre", ar: "تحويل إيجارة تنتهى بالتملك - تسجيل مبدئى", cplx: "M" },
  { id: "LTO-MOD-PRE-001", code: "LTO_MODIFY_PRE", legacy: "LEASE_TO_OWN_MDFY_PRE_View", cat: "LeaseToOwn", en: "LTO Modify — Pre", ar: "تعديل إيجارة تنتهى بالتملك - تسجيل مبدئى", cplx: "M" },
  // Financial Lease (3)
  { id: "FL-001", code: "FINANCIAL_LEASE", legacy: "LEASE_FINANCE_REG_View", cat: "FinancialLease", en: "Financial Lease", ar: "ايجارة تمويلية", cplx: "M", smart: true },
  { id: "FL-MOD-001", code: "FL_MODIFY", legacy: "LEASE_FINANCE_MDF_View", cat: "FinancialLease", en: "Financial Lease Modify", ar: "تعديل إجارة تمويلية", cplx: "M" },
  { id: "FL-REL-001", code: "FL_RELEASE", legacy: "LEASE_FINANCE_REL_View", cat: "FinancialLease", en: "Financial Lease Release", ar: "فك إيجارة تمويلية", cplx: "M" },
  // Companies (3)
  { id: "CO-REG-001", code: "COMPANY_REGISTRATION", legacy: "COMPANY_REG_View", cat: "Companies", en: "Company Registration", ar: "إجراء تسجيل الشركات", cplx: "H" },
  { id: "CO-MOD-001", code: "COMPANY_MODIFICATION", legacy: "COMPANY_MODIFICATION_View", cat: "Companies", en: "Company Modification", ar: "إجراء تعديل الشركات", cplx: "H" },
  { id: "CO-SHARE-001", code: "SHARE_SALE", legacy: "HOLD_SHARE_SELL_View", cat: "Companies", en: "Share Sale", ar: "بيع حصص ملاك", cplx: "H" },
  // Contract Read (1)
  { id: "CONTRACT-READ-001", code: "READ_CONTRACT_F", legacy: "READ_CONTRACT_F_Search", cat: "ContractRead", en: "Read Unified Sale Contract", ar: "قراءة عقد بيع موحد", cplx: "L" },
  // Mortgage (3)
  { id: "MORT-MOD-001", code: "MORTGAGE_MODIFY", legacy: "MDFY_MRTG_View", cat: "Mortgage", en: "Mortgage Modify", ar: "تعديل رهن", cplx: "M" },
  { id: "MORT-MOD-PRE-001", code: "MORTGAGE_MODIFY_PRE", legacy: "MDFY_MRTG_PRE_View", cat: "Mortgage", en: "Mortgage Modify — Pre", ar: "تعديل رهن - تسجيل مبدئي", cplx: "M" },
  { id: "MORT-TRF-001", code: "MORTGAGE_TRANSFER", legacy: "RAHN_TRANSFER_View", cat: "Mortgage", en: "Mortgage Transfer", ar: "تحويل رهن", cplx: "M" },
  // Usufruct core (3)
  { id: "USF-REG-001", code: "USUFRUCT_REG", legacy: "HAK_MANFAA_View", cat: "Usufruct", en: "Usufruct Registration", ar: "تسجيل حق منفعة", cplx: "M" },
  { id: "USF-MOD-001", code: "USUFRUCT_MODIFY", legacy: "HAK_MANFAA_MDFY_View", cat: "Usufruct", en: "Usufruct Modify", ar: "تعديل حق منفعة", cplx: "M" },
  { id: "USF-TERM-001", code: "USUFRUCT_TERMINATION", legacy: "ENHAA_HAK_MANFAA_View", cat: "Usufruct", en: "Usufruct Termination", ar: "إنهاء حق منفعة", cplx: "M" },
  // Usufruct sale (2)
  { id: "USF-SALE-001", code: "USUFRUCT_SALE", legacy: "SELL_HAK_MANFAA_View", cat: "Usufruct", en: "Usufruct Sale", ar: "بيع حق منفعة", cplx: "M" },
  { id: "USF-SALE-PRE-001", code: "USUFRUCT_SALE_PRE", legacy: "SELL_HAK_MANFAA_PRE_View", cat: "Usufruct", en: "Usufruct Sale — Pre", ar: "بيع حق منفعة - تسجيل مبدئي", cplx: "M" },
  // Usufruct mortgage (3)
  { id: "USF-MORT-REG-001", code: "USUFRUCT_MORTGAGE", legacy: "HAK_MANFAA_MRTG_View", cat: "Usufruct", en: "Usufruct Mortgage", ar: "رهن حق منفعة", cplx: "M" },
  { id: "USF-MORT-MOD-001", code: "USUFRUCT_MORTGAGE_MOD", legacy: "MDFY_HAK_MANFAA_MRTG_View", cat: "Usufruct", en: "Usufruct Mortgage Modify", ar: "تعديل رهن حق منفعة", cplx: "M" },
  { id: "USF-MORT-REL-001", code: "USUFRUCT_MORTGAGE_REL", legacy: "HAK_MANFAA_MRTG_REL_View", cat: "Usufruct", en: "Usufruct Mortgage Release", ar: "فك رهن حق منفعة", cplx: "M" },
  // Composite (4)
  { id: "CMP-SALE-MORT-PRE-001", code: "SALE_MORTGAGE_PRE", legacy: "SALEPRE_MORTGAGEPRE_View", cat: "Composite", en: "Sale + Mortgage — Pre", ar: "بيع مقترن برهن - تسجيل مبدئي", cplx: "H" },
  { id: "CMP-REL-SALE-MORT-001", code: "REL_SALE_MORT", legacy: "RELEASEMORTGAGE_SALE_MORTGAGE_View", cat: "Composite", en: "Release + Sale + Mortgage", ar: "فك رهن مع بيع مع رهن", cplx: "H" },
  { id: "CMP-REL-SALE-001", code: "REL_SALE", legacy: "RELEASEMORTGAGE_SALE_View", cat: "Composite", en: "Release + Sale", ar: "فك رهن مع بيع", cplx: "H" },
  { id: "CMP-REL-MORT-001", code: "REL_MORT", legacy: "RELEASEMORTGAGE_MORTGAGE_View", cat: "Composite", en: "Release + Mortgage", ar: "فك رهن مع تسجيل رهن", cplx: "H" },
  // Restriction (1) — already exists from P1, skip
  // Support (2)
  { id: "SUPPORT-001", code: "SUPPORT_TICKET", legacy: "ADD_TICKET_View", cat: "Support", en: "Create Support Ticket", ar: "إنشاء طلب دعم فني", cplx: "L" },
  { id: "CFG-EIDA-001", code: "EIDA_THUMB_EXCEPTION", legacy: "ADD_PARTY_EXCEPTION_EIDA_THUMB_Create", cat: "Config", en: "Add Party to EIDA Thumb Exception", ar: "إضافة شخص لإستثناء توقيع الهوية", cplx: "L" },
];

async function main() {
  console.log(`=== Seeding P2 procedures (${P2_PROCEDURES.length} new) ===`);
  let created = 0, skipped = 0;
  for (const p of P2_PROCEDURES) {
    const existing = await db.procedureCatalog.findUnique({ where: { id: p.id } });
    if (existing) { skipped++; continue; }
    
    const states = statesFor(p.id, !!p.smart);
    await db.procedureCatalog.create({
      data: {
        id: p.id, code: p.code, legacyObjectcode: p.legacy,
        category: p.cat, nameEn: p.en, nameAr: p.ar,
        priority: "P2", complexity: p.cplx,
        workspaceStates: JSON.stringify(states),
        requiredDocs: "[]", feeCodes: "[]",
        isActive: false, // P2 procedures start inactive until configured
      },
    });
    console.log(`  ✓ ${p.id} — ${p.en} (${states.length} states)`);
    created++;
  }
  console.log(`\nCreated: ${created} | Skipped: ${skipped} (already exists)`);

  // Verify
  const total = await db.procedureCatalog.count();
  const p1 = await db.procedureCatalog.count({ where: { priority: "P1" } });
  const p2 = await db.procedureCatalog.count({ where: { priority: "P2" } });
  const smartApp = await db.procedureCatalog.count({ where: { workspaceStates: { contains: "pending_smart_app" } } });
  const preRegWithoutNotReceived = await db.procedureCatalog.count({
    where: { id: { contains: "-PRE-" }, NOT: { workspaceStates: { contains: "not_received" } } },
  });
  const preRegWithNotReceived = await db.procedureCatalog.count({
    where: { id: { contains: "-PRE-" }, workspaceStates: { contains: "not_received" } },
  });

  console.log(`\n=== Verification ===`);
  console.log(`Total procedures: ${total} (expected 41 = 13 P1 + 28 P2)`);
  console.log(`P1: ${p1} | P2: ${p2}`);
  console.log(`Smart-app procedures: ${smartApp} (expected 8 = 3 P1 + 5 P2)`);
  console.log(`Pre-reg without not_received: ${preRegWithoutNotReceived}`);
  console.log(`Pre-reg WITH not_received (should be 0): ${preRegWithNotReceived}`);

  await db.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
