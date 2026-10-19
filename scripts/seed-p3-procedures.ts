import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const PRE_REGISTRATION = /-PRE-/;
const SMART_APP_P3 = new Set(["USF-LTO-REG-001", "USF-SALE-001"]);

function statesForP3(id: string, isSmartApp: boolean): string[] {
  const s: string[] = ["draft"];
  if (isSmartApp) s.push("pending_smart_app");
  s.push("requires_modification");
  if (!PRE_REGISTRATION.test(id)) s.push("not_received");
  s.push("received", "completed", "cancelled", "rejected");
  return s;
}

const P3_PROCEDURES = [
  { id: "GRANT-NM-001", code: "GRANT_NON_MUSLIM", legacy: "GRANT_NON_MUSLIM_View", cat: "Grant", en: "Non-Muslim Will Grant", ar: "إجراء تسجيل قيد وصية لغير المسلمين", cplx: "M" },
  { id: "GRANT-DEL-001", code: "GRANT_DELAYED_SELL", legacy: "GRANT_ON_DELAYED_SELL_View", cat: "Grant", en: "Delayed Sale Grant", ar: "هبة بيع مؤجل", cplx: "M" },
  { id: "LTO-DEL-REG-001", code: "LTO_ON_DELAYED_REG", legacy: "DEL_SELL_LEASE_TO_OWN_REG_View", cat: "LeaseToOwn", en: "LTO on Delayed Sale", ar: "تسجيل إيجاره تنتهى بالتملك على بيع مؤجل", cplx: "H" },
  { id: "LTO-DEL-MOD-001", code: "LTO_ON_DELAYED_MOD", legacy: "DEL_SELL_LEASE_TO_OWN_MDFY_View", cat: "LeaseToOwn", en: "LTO on Delayed Sale — Modify", ar: "تعديل إيجاره تنتهى بالتملك على بيع المؤجل", cplx: "H" },
  { id: "LTO-DEL-REL-001", code: "LTO_ON_DELAYED_REL", legacy: "DEL_SELL_LEASE_TO_OWN_REL_View", cat: "LeaseToOwn", en: "LTO on Delayed Sale — Release", ar: "فك إيجاره تنتهى بالتملك على بيع مؤجل", cplx: "H" },
  { id: "LTO-DEL-REL2-001", code: "LTO_DELAYED_RELEASE", legacy: "DEL_LEASE_TO_OWN_REL_View", cat: "LeaseToOwn", en: "LTO Delayed Release", ar: "فك إيجارة تنتهى بالتملك المؤجل", cplx: "H" },
  { id: "FL-TRF-001", code: "FL_TRANSFER", legacy: "LEASE_FINANCE_TRANSFER_View", cat: "FinancialLease", en: "Financial Lease Transfer", ar: "تحويل إيجارة تمولية", cplx: "M" },
  { id: "CO-FUND-001", code: "COMPANY_REG_FUND", legacy: "COMPANY_REG_INVEST_FUND_View", cat: "Companies", en: "Investment Fund Registration", ar: "إجراء تسجيل الشركات /الصناديق الإستثماريه", cplx: "H" },
  { id: "MORT-DEL-001", code: "MORTGAGE_DELAYED_SALE", legacy: "DEL_MRTG_View", cat: "Mortgage", en: "Delayed Sale Mortgage", ar: "رهن بيع مؤجل", cplx: "H" },
  { id: "MORT-DEL-MOD-001", code: "MORTGAGE_DELAYED_MOD", legacy: "DEL_MDFY_MRTG_View", cat: "Mortgage", en: "Delayed Sale Mortgage Modify", ar: "تعديل رهن بيع مؤجل", cplx: "H" },
  { id: "MORT-DEL-REL-001", code: "MORTGAGE_DELAYED_REL", legacy: "DEL_MRTG_REL_View", cat: "Mortgage", en: "Delayed Sale Mortgage Release", ar: "فك رهن بيع مؤجل", cplx: "H" },
  { id: "MORT-PRTF-REG-001", code: "PORTFOLIO_MORTGAGE_REG", legacy: "PRTF_MRTG_REG_View", cat: "Mortgage", en: "Portfolio Mortgage Registration", ar: "تسجيل رهن محافظ", cplx: "H" },
  { id: "MORT-PRTF-MOD-001", code: "PORTFOLIO_MORTGAGE_MOD", legacy: "PRTF_MRTG_MDFY_View", cat: "Mortgage", en: "Portfolio Mortgage Modify", ar: "تعديل رهن محافظ", cplx: "H" },
  { id: "MORT-PRTF-REL-001", code: "PORTFOLIO_MORTGAGE_REL", legacy: "PRTF_MRTG_REL_View", cat: "Mortgage", en: "Portfolio Mortgage Release", ar: "فك رهن محافظ", cplx: "H" },
  { id: "MORT-PRTF-MOD-PRE-001", code: "PORTFOLIO_MORTGAGE_MOD_PRE", legacy: "PRTF_MRTG_MDFY_PRE_View", cat: "Mortgage", en: "Portfolio Mortgage Modify — Pre", ar: "تعديل رهن محافظ تسجيل مبدئى", cplx: "H" },
  { id: "MORT-PRTF-REL-PRE-001", code: "PORTFOLIO_MORTGAGE_REL_PRE", legacy: "PRTF_MRTG_REL_PRE_View", cat: "Mortgage", en: "Portfolio Mortgage Release — Pre", ar: "فك رهن محافظ تسجيل مبدئى", cplx: "H" },
  { id: "MORT-PRTF-DEL-001", code: "PORTFOLIO_DELAYED_MORTGAGE", legacy: "DEL_PRTF_MRTG_View", cat: "Mortgage", en: "Portfolio Delayed Sale Mortgage", ar: "تسجيل رهن بيع مؤجل محافظ", cplx: "H" },
  { id: "MORT-PRTF-DEL-MOD-001", code: "PORTFOLIO_DELAYED_MORT_MOD", legacy: "DEL_PRTF_MRTG_MOD_View", cat: "Mortgage", en: "Portfolio Delayed Mortgage Modify", ar: "تعديل رهن محافظ بيع مؤجل", cplx: "H" },
  { id: "MORT-PRTF-DEL-REL-001", code: "PORTFOLIO_DELAYED_MORT_REL", legacy: "DEL_PRTF_MRTG_REL_View", cat: "Mortgage", en: "Portfolio Delayed Mortgage Release", ar: "فك رهن محافظ بيع مؤجل", cplx: "H" },
  { id: "MORT-PRTF-USF-REG-001", code: "PORTFOLIO_USUFRUCT_MORT", legacy: "PRTF_MRTG_DEV_REG_View", cat: "Mortgage", en: "Portfolio Usufruct Mortgage", ar: "تسجيل رهن محافظ حق منفعه", cplx: "H" },
  { id: "MORT-PRTF-USF-MOD-001", code: "PORTFOLIO_USUFRUCT_MORT_MOD", legacy: "PRTF_MRTG_DEV_MDFY_View", cat: "Mortgage", en: "Portfolio Usufruct Mortgage Modify", ar: "تعديل رهن محافظ حق منفعه", cplx: "H" },
  { id: "MORT-PRTF-USF-REL-001", code: "PORTFOLIO_USUFRUCT_MORT_REL", legacy: "Portfolio_HAK_MANFAA_MRTG_REL_View", cat: "Mortgage", en: "Portfolio Usufruct Mortgage Release", ar: "فك رهن محافظ حق منفعه", cplx: "H" },
  { id: "USF-GRNT-001", code: "USUFRUCT_GRANT", legacy: "GRANT_HAK_MANFAA_View", cat: "Usufruct", en: "Usufruct Grant", ar: "هبة حق منفعة", cplx: "M" },
  { id: "USF-FREE-001", code: "USUFRUCT_TO_FREEHOLD", legacy: "TRANSFER_HAK_MANFAA_FREE_OWSHIP_View", cat: "Usufruct", en: "Usufruct → Freehold Transfer", ar: "تحويل من حق منفعة إلي ملكية حره", cplx: "M" },
  { id: "USF-SALE-MORT-001", code: "USUFRUCT_SALE_MORT", legacy: "SELL_DEVELOPMENT_DEV_MORTG_View", cat: "Usufruct", en: "Usufruct Sale + Mortgage", ar: "بيع حق منفعة - رهن حق منفعة", cplx: "H" },
  { id: "USF-SALE-DEL-001", code: "USUFRUCT_DELAYED", legacy: "DEL_SELL_HAK_MANFAA_View", cat: "Usufruct", en: "Usufruct Delayed Sale", ar: "بيع حق منفعة مؤجل", cplx: "H" },
  { id: "USF-LTO-REG-001", code: "LTO_ON_USUFRUCT_REG", legacy: "LEASE_TO_OWN_ON_DEV_REG_View", cat: "Usufruct", en: "LTO on Usufruct", ar: "تسجيل إيجارة تنتهي بالتملك على حق منفعة", cplx: "H", smart: true },
  { id: "USF-LTO-MOD-001", code: "LTO_ON_USUFRUCT_MOD", legacy: "LEASE_TO_OWN_ON_DEV_MDFY_View", cat: "Usufruct", en: "LTO on Usufruct Modify", ar: "تعديل إيجارة تنتهي بالتملك على حق منفعة", cplx: "H" },
  { id: "USF-LTO-TRF-001", code: "LTO_ON_USUFRUCT_TRF", legacy: "LEASE_TO_OWN_ON_DEV_TRNSFR_View", cat: "Usufruct", en: "LTO on Usufruct Transfer", ar: "تحويل إيجارة تنتهي بالتملك على حق منفعة", cplx: "H" },
  { id: "USF-LTO-REL-001", code: "LTO_ON_USUFRUCT_REL", legacy: "LEASE_TO_OWN_ON_DEV_REL_View", cat: "Usufruct", en: "LTO on Usufruct Release", ar: "فك إيجارة تنتهي بالتملك على حق منفعة", cplx: "H" },
  { id: "USF-LTO-COMP1-001", code: "USF_LTO_REL_SALE_MORT", legacy: "RELEASE_LEASE_TO_OWNON_DEV_SELL_DEVELOPMENT_DEV_MORTG_View", cat: "Usufruct", en: "LTO Rel + Sale + Mortgage", ar: "فك ايجارة تنتهي بالتملك علي حق منفعة - بيع حق منفعة - رهن حق منفعة", cplx: "H" },
  { id: "USF-LTO-COMP2-001", code: "USF_LTO_REL_SALE", legacy: "RELEASE_LEASE_TO_OWNON_DEV_SELL_DEVELOPMENT_View", cat: "Usufruct", en: "LTO Rel + Usufruct Sale", ar: "فك ايجارة تنتهي بالتملك علي حق منفعة - بيع حق منفعة", cplx: "H" },
  { id: "USF-LTO-COMP3-001", code: "USF_LTO_REL_MORT", legacy: "RELEASE_LEASE_TO_OWNON_DEV_DEVELOPMENT_MORTGAGE_View", cat: "Usufruct", en: "LTO Rel + Usufruct Mortgage", ar: "فك ايجارة تنتهي بالتملك علي حق منفعة - رهن حق منفعة", cplx: "H" },
  { id: "USF-LTO-COMP4-001", code: "USF_LTO_REL_LTO", legacy: "RELEASE_LEASE_TO_OWNON_DEV_LEASE_TO_OWN_DEVELOPMENT_REG_View", cat: "Usufruct", en: "LTO Rel + LTO on Usufruct", ar: "فك ايجارة تنتهي بالتملك علي حق منفعة - تسجيل ايجارة تنتهي بالتملك علي حق منفعة", cplx: "H" },
  { id: "USF-MORT-TRF-001", code: "USUFRUCT_MORT_TRANSFER", legacy: "HAK_MANFAA_MRTG_TRANSFER_View", cat: "Usufruct", en: "Usufruct Mortgage Transfer", ar: "تحويل رهن حق منفعة", cplx: "H" },
  { id: "USF-MORT-COMP1-001", code: "USF_MORT_REL_SALE", legacy: "RELEASE_DEVELOPMENT_MORTGAGE_SELL_DEVELOPMENT_View", cat: "Usufruct", en: "Usufruct Mort Rel + Sale", ar: "فك رهن حق منفعة - بيع حق منفعة", cplx: "H" },
  { id: "USF-MORT-COMP2-001", code: "USF_MORT_REL_SALE_MORT", legacy: "RELEASE_DEVELOPMENT_MORTGAGE_SELL_DEVELOPMENT_DEV_MORTG_View", cat: "Usufruct", en: "Usufruct Mort Rel + Sale + Mort", ar: "فك رهن حق منفعة - بيع حق منفعة - رهن حق منفعة", cplx: "H" },
  { id: "USF-MORT-COMP3-001", code: "USF_MORT_REL_MORT", legacy: "RELEASE_DEVELOPMENT_DEV_MORTG_View", cat: "Usufruct", en: "Usufruct Mort Rel + Mortgage", ar: "فك رهن حق منفعة - رهن حق منفعة", cplx: "H" },
  { id: "USF-MORT-COMP4-001", code: "USF_MORT_REL_LTO", legacy: "RELEASE_DEVELOPMENT_MORTGAGE_LEASE_TO_OWN_DEVELOPMENT_REG_View", cat: "Usufruct", en: "Usufruct Mort Rel + LTO", ar: "فك رهن حق منفعة - ايجارة حق منفعة", cplx: "H" },
  { id: "USF-COMP-LEASE-001", code: "USUFRUCT_LEASE_COMPLETION", legacy: "LEASE_DEV_CONT_View", cat: "Usufruct", en: "Usufruct Completion via Lease", ar: "إستكمال حق منفعة بالاجارة", cplx: "H" },
  // Composite (19) — abbreviated for script, full data in P3_PROCEDURES array
  { id: "CMP-REL-MORT-PRE-SALE-PRE-MORT-PRE-001", code: "REL_MORT_PRE_SALE_MORT_PRE", legacy: "RELEASEMORTGAGEPRE_PRESALE_PREMORTGAGE_View", cat: "Composite", en: "Rel + Sale + Mort — Pre", ar: "فك رهن مع بيع مع رهن- تسجيل مبدئي", cplx: "H" },
  { id: "CMP-REL-MORT-PRE-SALE-PRE-001", code: "REL_MORT_PRE_SALE_PRE", legacy: "RELEASEMORTGAGEPRE_SALEPRE_View", cat: "Composite", en: "Rel + Sale — Pre", ar: "فك رهن مع بيع - تسجيل مبدئي", cplx: "H" },
  { id: "CMP-REL-MORT-PRE-MORT-PRE-001", code: "REL_MORT_PRE_MORT_PRE", legacy: "RELEASEMORTGAGEPRE_MORTGAGEPRE_View", cat: "Composite", en: "Rel + Mort — Pre", ar: "فك رهن مع تسجيل رهن - تسجيل مبدئي", cplx: "H" },
  { id: "CMP-REL-GRNT-MORT-001", code: "REL_GRANT_MORT", legacy: "RELEASEMORTGAGE_GRANT_MORTGAGE_View", cat: "Composite", en: "Rel + Grant + Mortgage", ar: "فك رهن - هبة - رهن", cplx: "H" },
  { id: "CMP-REL-LTO-001", code: "REL_LTO", legacy: "RELEASEMORTGAGE_LEASE_TO_OWN_View", cat: "Composite", en: "Rel + LTO", ar: "فك رهن - إيجارة تنتهى بتملك", cplx: "H" },
  { id: "CMP-LTO-REL-SALE-MORT-001", code: "LTO_REL_SALE_MORT", legacy: "LEASETOOWNRELEASE_SALE_MORTGAGE_View", cat: "Composite", en: "LTO Rel + Sale + Mortgage", ar: "فك إيجارة تنتهى بتملك - بيع - رهن", cplx: "H" },
  { id: "CMP-LTO-REL-SALE-001", code: "LTO_REL_SALE", legacy: "LEASETOOWNRELEASE_SALE_View", cat: "Composite", en: "LTO Rel + Sale", ar: "فك إيجارة تنتهى بتملك - بيع", cplx: "H" },
  { id: "CMP-LTO-REL-LTO-001", code: "LTO_REL_LTO", legacy: "LEASETOOWNRELEASE_LEASETOOWN_View", cat: "Composite", en: "LTO Rel + LTO", ar: "فك إيجارة تنتهى بتملك - إيجارة تنتهى بتملك", cplx: "H" },
  { id: "CMP-LTO-REL-PRE-LTO-PRE-001", code: "LTO_REL_PRE_LTO_PRE", legacy: "REL_LEASE_TO_OWN_PRE_LEASE_TO_OWN_PRE_View", cat: "Composite", en: "LTO Rel — LTO Pre", ar: "فك إجارة تنتهي بالتملك - إجارة تنتهي بالتملك تسجيل مبدئي", cplx: "H" },
  { id: "CMP-LTO-REL-PRE-SALE-PRE-001", code: "LTO_REL_PRE_SALE_PRE", legacy: "REL_LEASE_TO_OWN_PRE_SELL_PRE_View", cat: "Composite", en: "LTO Rel Pre — Sale Pre", ar: "فك إجارة تنتهي بالتملك تسجيل مبدئي - بيع مبدئي", cplx: "H" },
  { id: "CMP-LTO-REL-PRE-SALE-PRE-MORT-PRE-001", code: "LTO_REL_PRE_SALE_MORT_PRE", legacy: "REL_LEASE_TO_OWN_PRE_SELL_PRE_MRTG_PRE_View", cat: "Composite", en: "LTO Rel — Sale — Mort Pre", ar: "فك إجارة تنتهي بالتملك - بيع - رهن تسجيل مبدئي", cplx: "H" },
  { id: "CMP-LTO-REL-PRE-MORT-PRE-001", code: "LTO_REL_PRE_MORT_PRE", legacy: "REL_LEASE_TO_OWN_PRE_MRTG_PRE_View", cat: "Composite", en: "LTO Rel Pre — Mort Pre", ar: "فك إجارة تنتهي بالتملك تسجيل مبدئي - رهن مبدئي", cplx: "H" },
  { id: "CMP-LTO-REL-MORT-001", code: "LTO_REL_MORT", legacy: "REL_LEASE_TO_OWN_MRTG_View", cat: "Composite", en: "LTO Rel + Mortgage", ar: "فك إجارة تنتهي بالتملك - رهن", cplx: "H" },
  { id: "CMP-DEL-SALE-DEL-MORT-001", code: "DEL_SALE_DEL_MORT", legacy: "DELAYEDSALE_DELAYEDMORTGAGE_View", cat: "Composite", en: "Delayed Sale + Delayed Mortgage", ar: "بيع مؤجل - رهن مؤجل", cplx: "H" },
  { id: "CMP-REL-DEL-MORT-DEL-SALE-DEL-MORT-001", code: "REL_DEL_MORT_SALE_MORT", legacy: "RELEASEDELAYEDMORTGAGE_DELAYEDSALE_DELAYEDMORTGAGE_View", cat: "Composite", en: "Rel Del Mort + Sale + Mort", ar: "فك رهن مؤجل - بيع مؤجل - رهن مؤجل", cplx: "H" },
  { id: "CMP-REL-DEL-MORT-DEL-SALE-001", code: "REL_DEL_MORT_SALE", legacy: "RELEASEDELAYEDMORTGAGE_DELAYEDSALE_View", cat: "Composite", en: "Rel Del Mort + Del Sale", ar: "فك رهن مؤجل - بيع مؤجل", cplx: "H" },
  { id: "CMP-REL-DEL-MORT-DEL-MORT-001", code: "REL_DEL_MORT_MORT", legacy: "RELEASEDELAYEDMORTGAGE_DELAYEDMORTGAGE_View", cat: "Composite", en: "Rel Del Mort + Del Mort", ar: "فك رهن مؤجل - رهن مؤجل", cplx: "H" },
  { id: "CMP-FL-REL-MORT-001", code: "FL_REL_MORT", legacy: "REL_LEASE_FINANCE_MRTG_View", cat: "Composite", en: "FL Rel + Mortgage", ar: "فك إجارة تمويلية - تسجيل رهن", cplx: "H" },
  { id: "CMP-FL-REL-SALE-001", code: "FL_REL_SALE", legacy: "REL_LEASE_FINANCE_SELL_View", cat: "Composite", en: "FL Rel + Sale", ar: "فك إجارة تمويلية - بيع", cplx: "H" },
];

async function main() {
  console.log(`=== Seeding P3 procedures (${P3_PROCEDURES.length} new) ===`);
  let created = 0, skipped = 0;
  for (const p of P3_PROCEDURES) {
    const existing = await db.procedureCatalog.findUnique({ where: { id: p.id } });
    if (existing) { skipped++; continue; }
    const states = statesForP3(p.id, !!p.smart);
    await db.procedureCatalog.create({
      data: {
        id: p.id, code: p.code, legacyObjectcode: p.legacy,
        category: p.cat, nameEn: p.en, nameAr: p.ar,
        priority: "P3", complexity: p.cplx,
        workspaceStates: JSON.stringify(states),
        requiredDocs: "[]", feeCodes: "[]",
        isActive: false,
      },
    });
    console.log(`  ✓ ${p.id} — ${p.en} (${states.length} states)`);
    created++;
  }
  console.log(`\nCreated: ${created} | Skipped: ${skipped}`);

  // Verify totals
  const total = await db.procedureCatalog.count();
  const p1 = await db.procedureCatalog.count({ where: { priority: "P1" } });
  const p2 = await db.procedureCatalog.count({ where: { priority: "P2" } });
  const p3 = await db.procedureCatalog.count({ where: { priority: "P3" } });
  const smartApp = await db.procedureCatalog.count({ where: { workspaceStates: { contains: "pending_smart_app" } } });
  const preRegWithoutNotReceived = await db.procedureCatalog.count({
    where: { id: { contains: "-PRE-" }, NOT: { workspaceStates: { contains: "not_received" } } },
  });
  const preRegWithNotReceived = await db.procedureCatalog.count({
    where: { id: { contains: "-PRE-" }, workspaceStates: { contains: "not_received" } },
  });

  console.log(`\n=== Verification ===`);
  console.log(`Total procedures: ${total} (expected 103 = 13 P1 + 31 P2 + 59 P3)`);
  console.log(`P1: ${p1} | P2: ${p2} | P3: ${p3}`);
  console.log(`Smart-app procedures: ${smartApp} (expected 10 = 3 P1 + 5 P2 + 2 P3)`);
  console.log(`Pre-reg without not_received: ${preRegWithoutNotReceived} (expected 14)`);
  console.log(`Pre-reg WITH not_received (should be 0): ${preRegWithNotReceived}`);

  // States/transitions/events
  const states = await db.procedureWorkflowState.count();
  const trans = await db.workflowTransition.count();
  const events = await db.mixpanelEventMap.count();
  console.log(`States: ${states} (expected 8) | Transitions: ${trans} (expected 19) | Events: ${events} (expected 12)`);

  await db.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
