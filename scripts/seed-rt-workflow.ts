// scripts/seed-rt-workflow.ts
// THE single idempotent seed for the RT workflow.
//
// This is the ONLY seed script anyone runs for the RT workflow. It seeds:
//   - 8 ProcedureWorkflowState (with draft.allowedNext including pending_smart_app,
//     cancelled, rejected)
//   - 19 WorkflowTransition (t-001 through t-019, with t-016/t-019 admin-only,
//     t-009 as click with procedure_sent_to_smart_app event)
//   - 12 MixpanelEventMap (including procedure_sent_to_smart_app)
//   - 103 ProcedureCatalog (13 P1 + 28 P2 + 59 P3)
//
// All procedure workspaceStates are DERIVED from two rules:
//   1. isSmartApp = id ∈ SMART_APP_IDS (canonical 10-procedure list below)
//   2. isPreReg  = id contains "-PRE-"
//
// workspaceStates = [draft, [pending_smart_app if smart], requires_modification,
//                    [not_received if !pre-reg], received, completed, cancelled, rejected]
//
// Idempotent: every row is upserted. Running this script 1 time or 100 times
// produces identical DB state. Safe to run in any order, on fresh or
// pre-existing DBs.
//
// Run: npx tsx scripts/seed-rt-workflow.ts

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

// ════════════════════════════════════════════════════════════════════════════
// CANONICAL DATA — single source of truth
// ════════════════════════════════════════════════════════════════════════════

// 10 smart-app procedures (P1=3, P2=6, P3=1). Verified against
// seed-rt-workflow.ts P1 list + seed-p2-procedures.ts SMART_APP_P2 +
// seed-p3-procedures.ts SMART_APP_P3 + fix-p3-counts.ts.
// DO NOT EDIT unless the underlying procedure list changes.
const SMART_APP_IDS = new Set([
  // P1 smart-app (3)
  "SALE-DEL-001",
  "LTO-REG-001",
  "CMP-SALE-MORT-001",
  // P2 smart-app (5) — from seed-p2-procedures.ts SMART_APP_P2
  "SALE-PAY-001",
  "SALE-DELC-001",
  "LTO-MOD-001",
  "LTO-TRF-001",
  "FL-001",
  // P2 smart-app (1) — from fix-p3-counts.ts (USF-SALE-001 was double-listed
  // in spec; correct resolution: keep in P2 with pending_smart_app set)
  "USF-SALE-001",
  // P3 smart-app (1) — from seed-p3-procedures.ts SMART_APP_P3
  "USF-LTO-REG-001",
]);

// Pre-registration rule: id contains "-PRE-". Pre-reg procedures skip
// not_received (they don't go through TABU receipt — they're pre-registered).
const isPreReg = (id: string): boolean => id.includes("-PRE-");
const isSmartApp = (id: string): boolean => SMART_APP_IDS.has(id);

// Derive workspaceStates from rules. Order matters for human readability
// but the engine uses .includes() so order is irrelevant for correctness.
function workspaceStatesFor(id: string): string[] {
  const states: string[] = ["draft"];
  if (isSmartApp(id)) states.push("pending_smart_app");
  states.push("requires_modification");
  if (!isPreReg(id)) states.push("not_received");
  states.push("received", "completed", "cancelled", "rejected");
  return states;
}

// ════════════════════════════════════════════════════════════════════════════
// A2 — ProcedureWorkflowState (8 states)
// ════════════════════════════════════════════════════════════════════════════
const STATES = [
  // draft: can go to pending_smart_app (smart-app procedures), not_received,
  // received (direct submit), cancelled, rejected
  { id: "ws-001", stateCode: "draft", stateNameEn: "Draft", stateNameAr: "الإجراءات الغير مرسلة", workspaceSection: "NotSendingProceduresWorkspace", isTerminal: false, allowedNext: JSON.stringify(["pending_smart_app", "not_received", "received", "cancelled", "rejected"]), triggerEvent: null, icon: "fa-edit", displayOrder: 1 },
  { id: "ws-002", stateCode: "requires_modification", stateNameEn: "Requires Modification", stateNameAr: "الإجراءات التي تتطلب التعديل", workspaceSection: "RequiredModProceduresWorkspace", isTerminal: false, allowedNext: JSON.stringify(["received", "cancelled"]), triggerEvent: "returned_procedure_reopened", icon: "fa-pen", displayOrder: 2 },
  { id: "ws-003", stateCode: "pending_smart_app", stateNameEn: "Pending Smart App", stateNameAr: "إجراءات لم تستلم من التطبيق الذكي", workspaceSection: "PendingOnlineSubmitRequestsWorkspace", isTerminal: false, allowedNext: JSON.stringify(["received", "cancelled"]), triggerEvent: "smart_app_submission_received", icon: "fa-mobile", displayOrder: 3 },
  { id: "ws-004", stateCode: "not_received", stateNameEn: "Not Received", stateNameAr: "الإجراءات التي لم يتم إستلامها", workspaceSection: "NotReceivedProceduresWorkspace", isTerminal: false, allowedNext: JSON.stringify(["received", "cancelled", "rejected"]), triggerEvent: null, icon: "fa-times-circle", displayOrder: 4 },
  { id: "ws-005", stateCode: "received", stateNameEn: "Received", stateNameAr: "الإجراءات التي تم إستلامها", workspaceSection: "ReceivedProceduresWorkspace", isTerminal: false, allowedNext: JSON.stringify(["completed", "requires_modification", "cancelled", "rejected"]), triggerEvent: "procedure_opened", icon: "fa-check-circle", displayOrder: 5 },
  { id: "ws-006", stateCode: "completed", stateNameEn: "Completed", stateNameAr: "الإجراءات المكتملة اليوم", workspaceSection: "SubmittedProceduresWorkspace", isTerminal: true, allowedNext: JSON.stringify([]), triggerEvent: "procedure_finished", icon: "fa-trophy", displayOrder: 6 },
  { id: "ws-007", stateCode: "cancelled", stateNameEn: "Cancelled", stateNameAr: "ملغاة", workspaceSection: "CancelledProceduresWorkspace", isTerminal: true, allowedNext: JSON.stringify([]), triggerEvent: "procedure_cancelled", icon: "fa-ban", displayOrder: 7 },
  { id: "ws-008", stateCode: "rejected", stateNameEn: "Rejected", stateNameAr: "مرفوضة", workspaceSection: "RejectedProceduresWorkspace", isTerminal: true, allowedNext: JSON.stringify([]), triggerEvent: "procedure_rejected", icon: "fa-exclamation-circle", displayOrder: 8 },
];

// ════════════════════════════════════════════════════════════════════════════
// A3 — WorkflowTransition (19 transitions)
// t-016/t-019 are admin-only (cancelling/rejecting a live TABU procedure
// is a legal event). t-009 is a user click (Option A) with the
// procedure_sent_to_smart_app event.
// ════════════════════════════════════════════════════════════════════════════
const TRANSITIONS = [
  { id: "t-001", fromState: "draft", toState: "not_received", triggerType: "click", triggerId: "btnSend", mixpanelEvent: "procedure_submitted_to_tabu", requiresRole: "officer" },
  { id: "t-002", fromState: "draft", toState: "received", triggerType: "click", triggerId: "btnSendDirect", mixpanelEvent: "procedure_submitted_to_tabu", requiresRole: "officer" },
  { id: "t-003", fromState: "requires_modification", toState: "received", triggerType: "click", triggerId: "lnkSendBack", mixpanelEvent: "returned_procedure_resubmitted", requiresRole: "officer" },
  { id: "t-004", fromState: "received", toState: "completed", triggerType: "click", triggerId: "btnFinish", mixpanelEvent: "procedure_finished", requiresRole: "officer" },
  { id: "t-005", fromState: "received", toState: "completed", triggerType: "click", triggerId: "btnCompleteInstantSell", mixpanelEvent: "procedure_finished", requiresRole: "officer" },
  { id: "t-006", fromState: "received", toState: "requires_modification", triggerType: "postback", triggerId: "RowCommand:Return", mixpanelEvent: "procedure_returned", requiresRole: "auditor" },
  { id: "t-007", fromState: "not_received", toState: "received", triggerType: "system", triggerId: null, mixpanelEvent: "notification_received", requiresRole: null },
  { id: "t-008", fromState: "pending_smart_app", toState: "received", triggerType: "system", triggerId: null, mixpanelEvent: "notification_received", requiresRole: null },
  // t-009: user click (Option A) — officer sends to smart app
  { id: "t-009", fromState: "draft", toState: "pending_smart_app", triggerType: "click", triggerId: "btnSendToSmartApp", mixpanelEvent: "procedure_sent_to_smart_app", requiresRole: "officer" },
  { id: "t-010", fromState: "EXTERNAL", toState: "draft", triggerType: "system", triggerId: null, mixpanelEvent: null, requiresRole: "reception" },
  { id: "t-011", fromState: "EXTERNAL", toState: "pending_smart_app", triggerType: "system", triggerId: null, mixpanelEvent: "smart_app_submission_received", requiresRole: null },
  // cancelled / rejected edges
  { id: "t-012", fromState: "draft", toState: "cancelled", triggerType: "click", triggerId: "btnCancel", mixpanelEvent: "procedure_cancelled", requiresRole: "officer" },
  { id: "t-013", fromState: "requires_modification", toState: "cancelled", triggerType: "click", triggerId: "btnCancel", mixpanelEvent: "procedure_cancelled", requiresRole: "officer" },
  { id: "t-014", fromState: "pending_smart_app", toState: "cancelled", triggerType: "click", triggerId: "btnCancel", mixpanelEvent: "procedure_cancelled", requiresRole: "officer" },
  { id: "t-015", fromState: "not_received", toState: "cancelled", triggerType: "click", triggerId: "btnCancel", mixpanelEvent: "procedure_cancelled", requiresRole: "officer" },
  // t-016: admin-only (cancelling a live TABU procedure is a legal event)
  { id: "t-016", fromState: "received", toState: "cancelled", triggerType: "click", triggerId: "btnCancel", mixpanelEvent: "procedure_cancelled", requiresRole: "admin" },
  { id: "t-017", fromState: "draft", toState: "rejected", triggerType: "click", triggerId: "btnReject", mixpanelEvent: "procedure_rejected", requiresRole: "auditor" },
  { id: "t-018", fromState: "not_received", toState: "rejected", triggerType: "click", triggerId: "btnReject", mixpanelEvent: "procedure_rejected", requiresRole: "auditor" },
  // t-019: admin-only (rejecting a live TABU procedure is a legal event)
  { id: "t-019", fromState: "received", toState: "rejected", triggerType: "click", triggerId: "btnReject", mixpanelEvent: "procedure_rejected", requiresRole: "admin" },
];

// ════════════════════════════════════════════════════════════════════════════
// A4 — MixpanelEventMap (12 canonical event keys)
// ════════════════════════════════════════════════════════════════════════════
const EVENTS = [
  { key: "property_selected", displayLabel: "Property Selected", category: "rt_employee", firedFrom: "RT", transitions: JSON.stringify(["t-002"]) },
  { key: "procedure_submitted_to_tabu", displayLabel: "Procedure Submitted to TABU", category: "rt_employee", firedFrom: "RT", transitions: JSON.stringify(["t-001", "t-002"]) },
  { key: "procedure_opened", displayLabel: "Procedure Opened", category: "auditor", firedFrom: "TABU", transitions: JSON.stringify(["t-007", "t-008"]) },
  { key: "notification_received", displayLabel: "Notification Received", category: "lifecycle", firedFrom: "both", transitions: JSON.stringify(["t-007", "t-008"]) },
  { key: "procedure_returned", displayLabel: "Procedure Returned", category: "auditor", firedFrom: "TABU", transitions: JSON.stringify(["t-006"]) },
  { key: "returned_procedure_reopened", displayLabel: "Returned Procedure Reopened", category: "rt_employee", firedFrom: "RT", transitions: JSON.stringify(["t-006"]) },
  { key: "returned_procedure_resubmitted", displayLabel: "Returned Procedure Resubmitted", category: "rt_employee", firedFrom: "RT", transitions: JSON.stringify(["t-003"]) },
  { key: "procedure_finished", displayLabel: "Procedure Finished", category: "rt_employee", firedFrom: "RT", transitions: JSON.stringify(["t-004", "t-005"]) },
  { key: "smart_app_submission_received", displayLabel: "Smart App Submission Received", category: "system", firedFrom: "system", transitions: JSON.stringify(["t-011"]) },
  { key: "procedure_cancelled", displayLabel: "Procedure Cancelled", category: "rt_employee", firedFrom: "RT", transitions: JSON.stringify(["t-012", "t-013", "t-014", "t-015", "t-016"]) },
  { key: "procedure_rejected", displayLabel: "Procedure Rejected", category: "auditor", firedFrom: "TABU", transitions: JSON.stringify(["t-017", "t-018", "t-019"]) },
  { key: "procedure_sent_to_smart_app", displayLabel: "Procedure Sent to Smart App", category: "rt_employee", firedFrom: "RT", transitions: JSON.stringify(["t-009"]) },
];

// ════════════════════════════════════════════════════════════════════════════
// A1 — ProcedureCatalog (103 procedures: 13 P1 + 28 P2 + 59 P3)
// workspaceStates is derived from SMART_APP_IDS + isPreReg(id) rule above.
// Each procedure's requiredDocs/feeCodes are seeded as empty arrays here —
// they get filled in by the preparation-sheet templates (Part 8B) and the
// fee-catalog seed (Part 9.5 / hand-off Step 2).
// ════════════════════════════════════════════════════════════════════════════

// Compact tuple type for procedure definitions: [id, code, legacy, cat, en, ar, cplx]
type ProcTuple = [string, string, string | null, string, string, string, string];

const P1_PROCEDURES: ProcTuple[] = [
  ["SALE-001",              "SALE_STANDARD",           "SELL_View",                  "Sale",        "Standard Sale",                        "بيع",                          "M"],
  ["SALE-PRE-001",          "SALE_PREREGISTRATION",    "SELL_PRE_View",              "Sale",        "Sale — Pre-registration",              "بيع - تسجيل مبدئي",             "M"],
  ["SALE-DEL-001",          "SALE_DELAYED",            "SELL_DEL_View",              "Sale",        "Delayed Sale",                         "بيع مؤجل",                      "M"],
  ["GRANT-001",             "GRANT_REGISTRATION",      "GRANT_View",                 "Grant",       "Grant Registration",                   "تسجيل هبة",                     "M"],
  ["GRANT-PRE-001",         "GRANT_PREREGISTRATION",   "GRANT_PRE_View",             "Grant",       "Grant — Pre-registration",            "تسجيل هبة - تسجيل مبدئي",       "M"],
  ["LTO-REG-001",           "LTO_REGISTRATION",        "LEASE_TO_OWN_REG_View",      "LeaseToOwn",  "Lease-to-Own Registration",            "تسجيل إجارة تنتهي بالتملك",     "M"],
  ["LTO-REG-PRE-001",       "LTO_PREREGISTRATION",      "LEASE_TO_OWN_REG_PRE_View", "LeaseToOwn",  "LTO — Pre-registration",               "تسجيل إجارة تنتهي بالتملك - تسجيل مبدئي", "M"],
  ["LTO-REL-001",           "LTO_RELEASE",             "LEASE_TO_OWN_REL_View",      "LeaseToOwn",  "LTO Release",                          "فك إيجارة تنتهي بالتملك",      "M"],
  ["MORT-REG-001",          "MORTGAGE_REGISTRATION",   "MRTG_View",                  "Mortgage",    "Mortgage Registration",                "تسجيل رهن",                     "M"],
  ["MORT-REG-PRE-001",      "MORTGAGE_PREREGISTRATION", "MRTG_PRE_View",             "Mortgage",    "Mortgage — Pre-registration",          "تسجيل رهن - تسجيل مبدئي",       "M"],
  ["MORT-REL-001",          "MORTGAGE_RELEASE",        "MRTG_REL_View",              "Mortgage",    "Mortgage Release",                     "فك رهن",                        "M"],
  ["CMP-SALE-MORT-001",     "SALE_WITH_MORTGAGE",      "SALE_MORTGAGE_View",         "Composite",   "Sale + Mortgage",                      "بيع مقترن برهن",                "H"],
  ["RESTR-SALE-MORT-001",   "RESTRICT_SALE_MORTGAGED", "PROP_REST_TO_SELL_View",     "Restriction", "Restrict Sale of Mortgaged Property",  "تقييد بيع عقار مرهون",          "M"],
];

const P2_PROCEDURES: ProcTuple[] = [
  // Sale (2)
  ["SALE-PAY-001",        "SALE_PAYMENT_PLAN",        "SALE_ON_PAYMENT_PLAN_View",  "Sale",          "Sale on Payment Plan",                "بيع مقيد بسنوات الدفع",                     "M"],
  ["SALE-DELC-001",       "SALE_DELAYED_COMPLETION",   "CMP_SELL_DEL_View",          "Sale",          "Delayed Sale Completion",              "استكمال بيع مؤجل",                           "M"],
  // LTO (5)
  ["LTO-REL-PRE-001",     "LTO_RELEASE_PRE",           "LEASE_TO_OWN_REL_PRE_View",  "LeaseToOwn",    "LTO Release — Pre",                    "فك إيجارة تنتهي بالتملك - تسجيل مبدئي",     "M"],
  ["LTO-MOD-001",         "LTO_MODIFY",                "LEASE_TO_OWN_MDFY_View",     "LeaseToOwn",    "LTO Modify",                           "تعديل إيجارة تنتهى بالتملك",                "M"],
  ["LTO-TRF-001",         "LTO_TRANSFER",              "LEASE_TO_OWN_TRNSFR_View",   "LeaseToOwn",    "LTO Transfer",                         "تحويل إيجارة تنتهى بالتملك",                "M"],
  ["LTO-TRF-PRE-001",     "LTO_TRANSFER_PRE",           "LEASE_TO_OWN_TRNSFR_PRE_View","LeaseToOwn",   "LTO Transfer — Pre",                   "تحويل إيجارة تنتهى بالتملك - تسجيل مبدئى",  "M"],
  ["LTO-MOD-PRE-001",     "LTO_MODIFY_PRE",            "LEASE_TO_OWN_MDFY_PRE_View", "LeaseToOwn",    "LTO Modify — Pre",                     "تعديل إيجارة تنتهى بالتملك - تسجيل مبدئى",  "M"],
  // Financial Lease (3)
  ["FL-001",              "FINANCIAL_LEASE",           "LEASE_FINANCE_REG_View",     "FinancialLease","Financial Lease",                      "ايجارة تمويلية",                            "M"],
  ["FL-MOD-001",          "FL_MODIFY",                 "LEASE_FINANCE_MDF_View",     "FinancialLease","Financial Lease Modify",                "تعديل إجارة تمويلية",                       "M"],
  ["FL-REL-001",          "FL_RELEASE",                "LEASE_FINANCE_REL_View",     "FinancialLease","Financial Lease Release",               "فك إيجارة تمويلية",                         "M"],
  // Companies (3)
  ["CO-REG-001",          "COMPANY_REGISTRATION",      "COMPANY_REG_View",           "Companies",     "Company Registration",                 "إجراء تسجيل الشركات",                       "H"],
  ["CO-MOD-001",          "COMPANY_MODIFICATION",      "COMPANY_MODIFICATION_View",  "Companies",     "Company Modification",                 "إجراء تعديل الشركات",                       "H"],
  ["CO-SHARE-001",       "SHARE_SALE",                "HOLD_SHARE_SELL_View",       "Companies",     "Share Sale",                           "بيع حصص ملاك",                              "H"],
  // Contract Read (1)
  ["CONTRACT-READ-001",   "READ_CONTRACT_F",           "READ_CONTRACT_F_Search",     "ContractRead",  "Read Unified Sale Contract",          "قراءة عقد بيع موحد",                        "L"],
  // Mortgage (3)
  ["MORT-MOD-001",        "MORTGAGE_MODIFY",           "MDFY_MRTG_View",             "Mortgage",      "Mortgage Modify",                      "تعديل رهن",                                  "M"],
  ["MORT-MOD-PRE-001",    "MORTGAGE_MODIFY_PRE",       "MDFY_MRTG_PRE_View",         "Mortgage",      "Mortgage Modify — Pre",                "تعديل رهن - تسجيل مبدئي",                    "M"],
  ["MORT-TRF-001",        "MORTGAGE_TRANSFER",         "RAHN_TRANSFER_View",         "Mortgage",      "Mortgage Transfer",                    "تحويل رهن",                                  "M"],
  // Usufruct core (3)
  ["USF-REG-001",         "USUFRUCT_REG",              "HAK_MANFAA_View",            "Usufruct",      "Usufruct Registration",                "تسجيل حق منفعة",                            "M"],
  ["USF-MOD-001",         "USUFRUCT_MODIFY",           "HAK_MANFAA_MDFY_View",       "Usufruct",      "Usufruct Modify",                      "تعديل حق منفعة",                             "M"],
  ["USF-TERM-001",        "USUFRUCT_TERMINATION",      "ENHAA_HAK_MANFAA_View",      "Usufruct",      "Usufruct Termination",                 "إنهاء حق منفعة",                             "M"],
  // Usufruct sale (2)
  ["USF-SALE-001",        "USUFRUCT_SALE",             "SELL_HAK_MANFAA_View",       "Usufruct",      "Usufruct Sale",                        "بيع حق منفعة",                               "M"],
  ["USF-SALE-PRE-001",    "USUFRUCT_SALE_PRE",         "SELL_HAK_MANFAA_PRE_View",   "Usufruct",      "Usufruct Sale — Pre",                  "بيع حق منفعة - تسجيل مبدئي",                "M"],
  // Usufruct mortgage (3)
  ["USF-MORT-REG-001",    "USUFRUCT_MORTGAGE",         "HAK_MANFAA_MRTG_View",       "Usufruct",      "Usufruct Mortgage",                   "رهن حق منفعة",                               "M"],
  ["USF-MORT-MOD-001",    "USUFRUCT_MORTGAGE_MOD",     "MDFY_HAK_MANFAA_MRTG_View",  "Usufruct",      "Usufruct Mortgage Modify",             "تعديل رهن حق منفعة",                         "M"],
  ["USF-MORT-REL-001",    "USUFRUCT_MORTGAGE_REL",     "HAK_MANFAA_MRTG_REL_View",   "Usufruct",      "Usufruct Mortgage Release",            "فك رهن حق منفعة",                            "M"],
  // Composite (4)
  ["CMP-SALE-MORT-PRE-001",      "SALE_MORTGAGE_PRE",                "SALEPRE_MORTGAGEPRE_View",                "Composite", "Sale + Mortgage — Pre",                    "بيع مقترن برهن - تسجيل مبدئي",         "H"],
  ["CMP-REL-SALE-MORT-001",      "REL_SALE_MORT",                    "RELEASEMORTGAGE_SALE_MORTGAGE_View",      "Composite", "Release + Sale + Mortgage",                 "فك رهن مع بيع مع رهن",                 "H"],
  ["CMP-REL-SALE-001",           "REL_SALE",                         "RELEASEMORTGAGE_SALE_View",               "Composite", "Release + Sale",                            "فك رهن مع بيع",                        "H"],
  ["CMP-REL-MORT-001",           "REL_MORT",                         "RELEASEMORTGAGE_MORTGAGE_View",           "Composite", "Release + Mortgage",                        "فك رهن مع تسجيل رهن",                  "H"],
  // Support (2)
  ["SUPPORT-001",        "SUPPORT_TICKET",             "ADD_TICKET_View",            "Support",       "Create Support Ticket",                "إنشاء طلب دعم فني",                          "L"],
  ["CFG-EIDA-001",       "EIDA_THUMB_EXCEPTION",       "ADD_PARTY_EXCEPTION_EIDA_THUMB_Create", "Config", "Add Party to EIDA Thumb Exception", "إضافة شخص لإستثناء توقيع الهوية",         "L"],
  // Part 9.5 Step 4 — new P2 procedures (off-plan, valuation, title amendment)
  ["OQOOD-REG-001",      "OFFPLAN_PROVISIONAL_REG",     "OBJ_PROV_REG",              "OffPlan",       "Off-Plan (Oqood) Provisional Registration",  "التسجيل المبدئي للعقارات على الخارطة",      "M"],
  ["PROP-VAL-001",       "PROPERTY_VALUATION_REQUEST",   "OBJ_PROP_VAL",              "Valuation",     "Property Valuation Request",                  "طلب تقييم عقار",                              "L"],
  ["TITLE-AMEND-001",    "TITLE_DEED_AMENDMENT",        "OBJ_TITLE_AMND",            "TitleDeed",     "Title Deed Amendment / Correction",          "تعديل / تصحيح سند الملكية",                   "L"],
];

const P3_PROCEDURES: ProcTuple[] = [
  ["GRANT-NM-001",        "GRANT_NON_MUSLIM",          "GRANT_NON_MUSLIM_View",                  "Grant",          "Non-Muslim Will Grant",                                   "إجراء تسجيل قيد وصية لغير المسلمين",                            "M"],
  ["GRANT-DEL-001",       "GRANT_DELAYED_SELL",         "GRANT_ON_DELAYED_SELL_View",            "Grant",          "Delayed Sale Grant",                                      "هبة بيع مؤجل",                                                  "M"],
  ["LTO-DEL-REG-001",     "LTO_ON_DELAYED_REG",        "DEL_SELL_LEASE_TO_OWN_REG_View",         "LeaseToOwn",     "LTO on Delayed Sale",                                     "تسجيل إيجاره تنتهى بالتملك على بيع مؤجل",                       "H"],
  ["LTO-DEL-MOD-001",     "LTO_ON_DELAYED_MOD",        "DEL_SELL_LEASE_TO_OWN_MDFY_View",        "LeaseToOwn",     "LTO on Delayed Sale — Modify",                             "تعديل إيجاره تنتهى بالتملك على بيع المؤجل",                    "H"],
  ["LTO-DEL-REL-001",     "LTO_ON_DELAYED_REL",        "DEL_SELL_LEASE_TO_OWN_REL_View",        "LeaseToOwn",     "LTO on Delayed Sale — Release",                           "فك إيجاره تنتهى بالتملك على بيع مؤجل",                          "H"],
  ["LTO-DEL-REL2-001",    "LTO_DELAYED_RELEASE",       "DEL_LEASE_TO_OWN_REL_View",              "LeaseToOwn",     "LTO Delayed Release",                                     "فك إيجارة تنتهي بالتملك المؤجل",                               "H"],
  ["FL-TRF-001",          "FL_TRANSFER",                "LEASE_FINANCE_TRANSFER_View",            "FinancialLease", "Financial Lease Transfer",                                "تحويل إيجارة تمولية",                                           "M"],
  ["CO-FUND-001",         "COMPANY_REG_FUND",          "COMPANY_REG_INVEST_FUND_View",           "Companies",      "Investment Fund Registration",                            "إجراء تسجيل الشركات /الصناديق الإستثماريه",                    "H"],
  ["MORT-DEL-001",        "MORTGAGE_DELAYED_SALE",     "DEL_MRTG_View",                          "Mortgage",       "Delayed Sale Mortgage",                                   "رهن بيع مؤجل",                                                  "H"],
  ["MORT-DEL-MOD-001",    "MORTGAGE_DELAYED_MOD",      "DEL_MDFY_MRTG_View",                     "Mortgage",       "Delayed Sale Mortgage Modify",                            "تعديل رهن بيع مؤجل",                                            "H"],
  ["MORT-DEL-REL-001",    "MORTGAGE_DELAYED_REL",      "DEL_MRTG_REL_View",                      "Mortgage",       "Delayed Sale Mortgage Release",                            "فك رهن بيع مؤجل",                                               "H"],
  ["MORT-PRTF-REG-001",   "PORTFOLIO_MORTGAGE_REG",     "PRTF_MRTG_REG_View",                    "Mortgage",       "Portfolio Mortgage Registration",                          "تسجيل رهن محافظ",                                               "H"],
  ["MORT-PRTF-MOD-001",   "PORTFOLIO_MORTGAGE_MOD",     "PRTF_MRTG_MDFY_View",                   "Mortgage",       "Portfolio Mortgage Modify",                                "تعديل رهن محافظ",                                               "H"],
  ["MORT-PRTF-REL-001",   "PORTFOLIO_MORTGAGE_REL",     "PRTF_MRTG_REL_View",                    "Mortgage",       "Portfolio Mortgage Release",                              "فك رهن محافظ",                                                  "H"],
  ["MORT-PRTF-MOD-PRE-001","PORTFOLIO_MORTGAGE_MOD_PRE","PRTF_MRTG_MDFY_PRE_View",               "Mortgage",       "Portfolio Mortgage Modify — Pre",                         "تعديل رهن محافظ تسجيل مبدئى",                                   "H"],
  ["MORT-PRTF-REL-PRE-001","PORTFOLIO_MORTGAGE_REL_PRE","PRTF_MRTG_REL_PRE_View",                "Mortgage",       "Portfolio Mortgage Release — Pre",                        "فك رهن محافظ تسجيل مبدئى",                                      "H"],
  ["MORT-PRTF-DEL-001",   "PORTFOLIO_DELAYED_MORTGAGE","DEL_PRTF_MRTG_View",                     "Mortgage",       "Portfolio Delayed Sale Mortgage",                          "تسجيل رهن بيع مؤجل محافظ",                                      "H"],
  ["MORT-PRTF-DEL-MOD-001","PORTFOLIO_DELAYED_MORT_MOD","DEL_PRTF_MRTG_MOD_View",                "Mortgage",       "Portfolio Delayed Mortgage Modify",                       "تعديل رهن محافظ بيع مؤجل",                                      "H"],
  ["MORT-PRTF-DEL-REL-001","PORTFOLIO_DELAYED_MORT_REL","DEL_PRTF_MRTG_REL_View",                "Mortgage",       "Portfolio Delayed Mortgage Release",                      "فك رهن محافظ بيع مؤجل",                                         "H"],
  ["MORT-PRTF-USF-REG-001","PORTFOLIO_USUFRUCT_MORT",  "PRTF_MRTG_DEV_REG_View",                 "Mortgage",       "Portfolio Usufruct Mortgage",                             "تسجيل رهن محافظ حق منفعه",                                      "H"],
  ["MORT-PRTF-USF-MOD-001","PORTFOLIO_USUFRUCT_MORT_MOD","PRTF_MRTG_DEV_MDFY_View",              "Mortgage",       "Portfolio Usufruct Mortgage Modify",                      "تعديل رهن محافظ حق منفعه",                                      "H"],
  ["MORT-PRTF-USF-REL-001","PORTFOLIO_USUFRUCT_MORT_REL","Portfolio_HAK_MANFAA_MRTG_REL_View",   "Mortgage",       "Portfolio Usufruct Mortgage Release",                     "فك رهن محافظ حق منفعه",                                         "H"],
  ["USF-GRNT-001",        "USUFRUCT_GRANT",             "GRANT_HAK_MANFAA_View",                  "Usufruct",       "Usufruct Grant",                                          "هبة حق منفعة",                                                  "M"],
  ["USF-FREE-001",        "USUFRUCT_TO_FREEHOLD",       "TRANSFER_HAK_MANFAA_FREE_OWSHIP_View",  "Usufruct",       "Usufruct → Freehold Transfer",                            "تحويل من حق منفعة إلي ملكية حره",                               "M"],
  ["USF-SALE-MORT-001",   "USUFRUCT_SALE_MORT",         "SELL_DEVELOPMENT_DEV_MORTG_View",       "Usufruct",       "Usufruct Sale + Mortgage",                                "بيع حق منفعة - رهن حق منفعة",                                    "H"],
  ["USF-SALE-DEL-001",    "USUFRUCT_DELAYED",           "DEL_SELL_HAK_MANFAA_View",              "Usufruct",       "Usufruct Delayed Sale",                                   "بيع حق منفعة مؤجل",                                              "H"],
  ["USF-LTO-REG-001",     "LTO_ON_USUFRUCT_REG",        "LEASE_TO_OWN_ON_DEV_REG_View",          "Usufruct",       "LTO on Usufruct",                                        "تسجيل إيجارة تنتهي بالتملك على حق منفعة",                       "H"],
  ["USF-LTO-MOD-001",     "LTO_ON_USUFRUCT_MOD",        "LEASE_TO_OWN_ON_DEV_MDFY_View",         "Usufruct",       "LTO on Usufruct Modify",                                 "تعديل إيجارة تنتهي بالتملك على حق منفعة",                       "H"],
  ["USF-LTO-TRF-001",     "LTO_ON_USUFRUCT_TRF",        "LEASE_TO_OWN_ON_DEV_TRNSFR_View",       "Usufruct",       "LTO on Usufruct Transfer",                                "تحويل إيجارة تنتهي بالتملك على حق منفعة",                       "H"],
  ["USF-LTO-REL-001",     "LTO_ON_USUFRUCT_REL",        "LEASE_TO_OWN_ON_DEV_REL_View",          "Usufruct",       "LTO on Usufruct Release",                                 "فك إيجارة تنتهي بالتملك على حق منفعة",                          "H"],
  ["USF-LTO-COMP1-001",   "USF_LTO_REL_SALE_MORT",      "RELEASE_LEASE_TO_OWNON_DEV_SELL_DEVELOPMENT_DEV_MORTG_View",        "Usufruct", "LTO Rel + Sale + Mortgage",            "فك ايجارة تنتهي بالتملك علي حق منفعة - بيع حق منفعة - رهن حق منفعة",      "H"],
  ["USF-LTO-COMP2-001",   "USF_LTO_REL_SALE",           "RELEASE_LEASE_TO_OWNON_DEV_SELL_DEVELOPMENT_View",                  "Usufruct", "LTO Rel + Usufruct Sale",             "فك ايجارة تنتهي بالتملك علي حق منفعة - بيع حق منفعة",                     "H"],
  ["USF-LTO-COMP3-001",   "USF_LTO_REL_MORT",          "RELEASE_LEASE_TO_OWNON_DEV_DEVELOPMENT_MORTGAGE_View",              "Usufruct", "LTO Rel + Usufruct Mortgage",         "فك ايجارة تنتهي بالتملك علي حق منفعة - رهن حق منفعة",                    "H"],
  ["USF-LTO-COMP4-001",   "USF_LTO_REL_LTO",           "RELEASE_LEASE_TO_OWNON_DEV_LEASE_TO_OWN_DEVELOPMENT_REG_View",      "Usufruct", "LTO Rel + LTO on Usufruct",          "فك ايجارة تنتهي بالتملك علي حق منفعة - تسجيل ايجارة تنتهي بالتملك علي حق منفعة", "H"],
  ["USF-MORT-TRF-001",    "USUFRUCT_MORT_TRANSFER",     "HAK_MANFAA_MRTG_TRANSFER_View",          "Usufruct",       "Usufruct Mortgage Transfer",                              "تحويل رهن حق منفعة",                                            "H"],
  ["USF-MORT-COMP1-001",  "USF_MORT_REL_SALE",         "RELEASE_DEVELOPMENT_MORTGAGE_SELL_DEVELOPMENT_View",                "Usufruct", "Usufruct Mort Rel + Sale",           "فك رهن حق منفعة - بيع حق منفعة",                                          "H"],
  ["USF-MORT-COMP2-001",  "USF_MORT_REL_SALE_MORT",    "RELEASE_DEVELOPMENT_MORTGAGE_SELL_DEVELOPMENT_DEV_MORTG_View",      "Usufruct", "Usufruct Mort Rel + Sale + Mort",    "فك رهن حق منفعة - بيع حق منفعة - رهن حق منفعة",                            "H"],
  ["USF-MORT-COMP3-001",  "USF_MORT_REL_MORT",         "RELEASE_DEVELOPMENT_DEV_MORTG_View",                                "Usufruct", "Usufruct Mort Rel + Mortgage",       "فك رهن حق منفعة - رهن حق منفعة",                                          "H"],
  ["USF-MORT-COMP4-001",  "USF_MORT_REL_LTO",          "RELEASE_DEVELOPMENT_MORTGAGE_LEASE_TO_OWN_DEVELOPMENT_REG_View",    "Usufruct", "Usufruct Mort Rel + LTO",            "فك رهن حق منفعة - ايجارة حق منفعة",                                       "H"],
  ["USF-COMP-LEASE-001",  "USUFRUCT_LEASE_COMPLETION", "LEASE_DEV_CONT_View",                    "Usufruct",       "Usufruct Completion via Lease",                            "إستكمال حق منفعة بالاجارة",                                     "H"],
  // Composite (19) — pre-reg variants + compound releases
  ["CMP-REL-MORT-PRE-SALE-PRE-MORT-PRE-001", "REL_MORT_PRE_SALE_MORT_PRE",     "RELEASEMORTGAGEPRE_PRESALE_PREMORTGAGE_View",  "Composite", "Rel + Sale + Mort — Pre",                "فك رهن مع بيع مع رهن- تسجيل مبدئي",                    "H"],
  ["CMP-REL-MORT-PRE-SALE-PRE-001",          "REL_MORT_PRE_SALE_PRE",          "RELEASEMORTGAGEPRE_SALEPRE_View",              "Composite", "Rel + Sale — Pre",                       "فك رهن مع بيع - تسجيل مبدئي",                          "H"],
  ["CMP-REL-MORT-PRE-MORT-PRE-001",          "REL_MORT_PRE_MORT_PRE",          "RELEASEMORTGAGEPRE_MORTGAGEPRE_View",         "Composite", "Rel + Mort — Pre",                       "فك رهن مع تسجيل رهن - تسجيل مبدئي",                    "H"],
  ["CMP-REL-GRNT-MORT-001",                  "REL_GRANT_MORT",                 "RELEASEMORTGAGE_GRANT_MORTGAGE_View",          "Composite", "Rel + Grant + Mortgage",                  "فك رهن - هبة - رهن",                                   "H"],
  ["CMP-REL-LTO-001",                        "REL_LTO",                        "RELEASEMORTGAGE_LEASE_TO_OWN_View",           "Composite", "Rel + LTO",                              "فك رهن - إيجارة تنتهى بتملك",                          "H"],
  ["CMP-LTO-REL-SALE-MORT-001",              "LTO_REL_SALE_MORT",              "LEASETOOWNRELEASE_SALE_MORTGAGE_View",         "Composite", "LTO Rel + Sale + Mortgage",               "فك إيجارة تنتهى بتملك - بيع - رهن",                    "H"],
  ["CMP-LTO-REL-SALE-001",                   "LTO_REL_SALE",                   "LEASETOOWNRELEASE_SALE_View",                  "Composite", "LTO Rel + Sale",                          "فك إيجارة تنتهى بتملك - بيع",                          "H"],
  ["CMP-LTO-REL-LTO-001",                    "LTO_REL_LTO",                    "LEASETOOWNRELEASE_LEASETOOWN_View",           "Composite", "LTO Rel + LTO",                           "فك إيجارة تنتهى بتملك - إيجارة تنتهى بتملك",          "H"],
  ["CMP-LTO-REL-PRE-LTO-PRE-001",            "LTO_REL_PRE_LTO_PRE",            "REL_LEASE_TO_OWN_PRE_LEASE_TO_OWN_PRE_View",   "Composite", "LTO Rel — LTO Pre",                       "فك إجارة تنتهي بالتملك - إجارة تنتهي بالتملك تسجيل مبدئي", "H"],
  ["CMP-LTO-REL-PRE-SALE-PRE-001",           "LTO_REL_PRE_SALE_PRE",           "REL_LEASE_TO_OWN_PRE_SELL_PRE_View",           "Composite", "LTO Rel Pre — Sale Pre",                 "فك إجارة تنتهي بالتملك تسجيل مبدئي - بيع مبدئي",       "H"],
  ["CMP-LTO-REL-PRE-SALE-PRE-MORT-PRE-001",  "LTO_REL_PRE_SALE_MORT_PRE",      "REL_LEASE_TO_OWN_PRE_SELL_PRE_MRTG_PRE_View",  "Composite", "LTO Rel — Sale — Mort Pre",              "فك إجارة تنتهي بالتملك - بيع - رهن تسجيل مبدئي",      "H"],
  ["CMP-LTO-REL-PRE-MORT-PRE-001",           "LTO_REL_PRE_MORT_PRE",           "REL_LEASE_TO_OWN_PRE_MRTG_PRE_View",           "Composite", "LTO Rel Pre — Mort Pre",                 "فك إجارة تنتهي بالتملك تسجيل مبدئي - رهن مبدئي",      "H"],
  ["CMP-LTO-REL-MORT-001",                   "LTO_REL_MORT",                   "REL_LEASE_TO_OWN_MRTG_View",                    "Composite", "LTO Rel + Mortgage",                      "فك إجارة تنتهي بالتملك - رهن",                         "H"],
  ["CMP-DEL-SALE-DEL-MORT-001",              "DEL_SALE_DEL_MORT",              "DELAYEDSALE_DELAYEDMORTGAGE_View",              "Composite", "Delayed Sale + Delayed Mortgage",         "بيع مؤجل - رهن مؤجل",                                  "H"],
  ["CMP-REL-DEL-MORT-DEL-SALE-DEL-MORT-001", "REL_DEL_MORT_SALE_MORT",         "RELEASEDELAYEDMORTGAGE_DELAYEDSALE_DELAYEDMORTGAGE_View", "Composite", "Rel Del Mort + Sale + Mort", "فك رهن مؤجل - بيع مؤجل - رهن مؤجل",                     "H"],
  ["CMP-REL-DEL-MORT-DEL-SALE-001",          "REL_DEL_MORT_SALE",              "RELEASEDELAYEDMORTGAGE_DELAYEDSALE_View",      "Composite", "Rel Del Mort + Del Sale",                "فك رهن مؤجل - بيع مؤجل",                               "H"],
  ["CMP-REL-DEL-MORT-DEL-MORT-001",          "REL_DEL_MORT_MORT",              "RELEASEDELAYEDMORTGAGE_DELAYEDMORTGAGE_View",  "Composite", "Rel Del Mort + Del Mort",                "فك رهن مؤجل - رهن مؤجل",                               "H"],
  ["CMP-FL-REL-MORT-001",                    "FL_REL_MORT",                    "REL_LEASE_FINANCE_MRTG_View",                  "Composite", "FL Rel + Mortgage",                       "فك إجارة تمويلية - تسجيل رهن",                         "H"],
  ["CMP-FL-REL-SALE-001",                    "FL_REL_SALE",                    "REL_LEASE_FINANCE_SELL_View",                  "Composite", "FL Rel + Sale",                           "فك إجارة تمويلية - بيع",                               "H"],
];

// ════════════════════════════════════════════════════════════════════════════
// MAIN — idempotent upserts
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("=== RT Workflow Seed (single idempotent source of truth) ===\n");
  console.log(`Smart-app IDs (${SMART_APP_IDS.size}): ${[...SMART_APP_IDS].join(", ")}\n`);

  // ── 1. States ──
  console.log("Seeding ProcedureWorkflowState...");
  for (const s of STATES) {
    await db.procedureWorkflowState.upsert({ where: { id: s.id }, create: s, update: s });
  }
  console.log(`  ${STATES.length} states upserted`);

  // ── 2. Transitions ──
  console.log("Seeding WorkflowTransition...");
  for (const t of TRANSITIONS) {
    await db.workflowTransition.upsert({ where: { id: t.id }, create: t, update: t });
  }
  console.log(`  ${TRANSITIONS.length} transitions upserted`);

  // ── 3. Events ──
  console.log("Seeding MixpanelEventMap...");
  for (const e of EVENTS) {
    await db.mixpanelEventMap.upsert({ where: { key: e.key }, create: e, update: e });
  }
  console.log(`  ${EVENTS.length} event keys upserted`);

  // ── 4. Procedures (P1 + P2 + P3) ──
  console.log("Seeding ProcedureCatalog...");
  const allProcedures: ProcTuple[] = [...P1_PROCEDURES, ...P2_PROCEDURES, ...P3_PROCEDURES];
  const priorityFor = (id: string): string => {
    if (P1_PROCEDURES.some(p => p[0] === id)) return "P1";
    if (P2_PROCEDURES.some(p => p[0] === id)) return "P2";
    return "P3";
  };
  let proceduresUpserted = 0;
  for (const [id, code, legacy, cat, en, ar, cplx] of allProcedures) {
    const states = workspaceStatesFor(id);
    const priority = priorityFor(id);
    // isActive=true for P1, false for P2/P3 (they need to be activated per-procedure
    // after their prep-sheet templates and fee codes are configured)
    const isActive = priority === "P1";
    await db.procedureCatalog.upsert({
      where: { id },
      create: {
        id, code, legacyObjectcode: legacy, category: cat, nameEn: en, nameAr: ar,
        priority, complexity: cplx,
        workspaceStates: JSON.stringify(states),
        requiredDocs: "[]", feeCodes: "[]",
        isActive,
      },
      update: {
        code, legacyObjectcode: legacy, category: cat, nameEn: en, nameAr: ar,
        priority, complexity: cplx,
        workspaceStates: JSON.stringify(states),
        requiredDocs: "[]", feeCodes: "[]",
        // Don't override isActive on update — admin may have intentionally
        // activated/deactivated a procedure after initial seed
      },
    });
    proceduresUpserted++;
  }
  console.log(`  ${proceduresUpserted} procedures upserted`);

  // ── Verify ──
  const catalogCount = await db.procedureCatalog.count();
  const stateCount = await db.procedureWorkflowState.count();
  const transitionCount = await db.workflowTransition.count();
  const eventCount = await db.mixpanelEventMap.count();
  const smartAppCount = await db.procedureCatalog.count({
    where: { workspaceStates: { contains: "pending_smart_app" } },
  });
  const preRegProcs = await db.procedureCatalog.findMany({
    where: { id: { contains: "-PRE-" } },
    select: { workspaceStates: true },
  });
  const preRegWithNotReceived = preRegProcs.filter(p =>
    (JSON.parse(p.workspaceStates) as string[]).includes("not_received")
  ).length;
  const byPriority = {
    P1: await db.procedureCatalog.count({ where: { priority: "P1" } }),
    P2: await db.procedureCatalog.count({ where: { priority: "P2" } }),
    P3: await db.procedureCatalog.count({ where: { priority: "P3" } }),
  };

  console.log(`\n=== Seed complete (idempotent) ===`);
  console.log(`ProcedureCatalog: ${catalogCount} (P1=${byPriority.P1} P2=${byPriority.P2} P3=${byPriority.P3})`);
  console.log(`ProcedureWorkflowState: ${stateCount}`);
  console.log(`WorkflowTransition: ${transitionCount}`);
  console.log(`MixpanelEventMap: ${eventCount}`);
  console.log(`Smart-app procedures: ${smartAppCount} (expected ${SMART_APP_IDS.size})`);
  console.log(`Pre-reg WITH not_received: ${preRegWithNotReceived} (expected 0)`);

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
