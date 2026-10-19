// Shared types used across client & server.

export type CaseStatus =
  | "DRAFT"
  | "NEW_INTAKE_COMPLETED"
  | "AWAITING_CLIENT_DOCUMENTS"
  | "DOCUMENTS_UPLOADED"
  | "UNDER_OFFICER_REVIEW"
  | "RETURNED_FOR_CORRECTION"
  | "AWAITING_CLIENT_APPOINTMENT"
  | "READY_FOR_MANAGER_REVIEW"
  | "MANAGER_APPROVED_READY_FOR_DLD"
  | "REJECTED_ON_HOLD"
  | "SUBMITTED_TO_DLD_MANUALLY"
  | "DLD_PROCESSING_IN_PROGRESS"
  | "COMPLETED"
  | "CLOSED"
  | "CANCELLED"
  | "ARCHIVED"
  // Phase 14 — Accountant Workflow gates Officer access
  | "AWAITING_PAYMENT"
  | "ACCOUNTS_LOCKED"
  | "REJECTED_TO_DESK_BY_ACCOUNTS";

export const CASE_STATUS_LABELS: Record<CaseStatus, { en: string; ar: string; color: string }> = {
  DRAFT: { en: "Draft", ar: "مسودة", color: "secondary" },
  NEW_INTAKE_COMPLETED: { en: "Intake Completed", ar: "اكتمل الاستقبال", color: "default" },
  AWAITING_CLIENT_DOCUMENTS: { en: "Awaiting Client Documents", ar: "بانتظار وثائق العميل", color: "warning" },
  DOCUMENTS_UPLOADED: { en: "Documents Uploaded", ar: "تم رفع الوثائق", color: "default" },
  UNDER_OFFICER_REVIEW: { en: "Under Officer Review", ar: "تحت مراجعة المسؤول", color: "info" },
  RETURNED_FOR_CORRECTION: { en: "Returned for Correction", ar: "أُرجع للتصحيح", color: "warning" },
  AWAITING_CLIENT_APPOINTMENT: { en: "Awaiting Client Appointment", ar: "بانتظار موعد العميل", color: "warning" },
  READY_FOR_MANAGER_REVIEW: { en: "Ready for Manager Review", ar: "جاهز لمراجعة المدير", color: "info" },
  MANAGER_APPROVED_READY_FOR_DLD: { en: "Manager Approved – Ready for DLD", ar: "معتمد من المدير – جاهز لدائرة الأراضي", color: "success" },
  REJECTED_ON_HOLD: { en: "Rejected / On Hold", ar: "مرفوض / معلق", color: "destructive" },
  SUBMITTED_TO_DLD_MANUALLY: { en: "Submitted to DLD Manually", ar: "قُدم لدائرة الأراضي يدوياً", color: "info" },
  DLD_PROCESSING_IN_PROGRESS: { en: "DLD Processing in Progress", ar: "جار معالجة دائرة الأراضي", color: "info" },
  COMPLETED: { en: "Completed", ar: "مكتمل", color: "success" },
  CLOSED: { en: "Closed", ar: "مغلق", color: "secondary" },
  CANCELLED: { en: "Cancelled", ar: "ملغى", color: "secondary" },
  ARCHIVED: { en: "Archived", ar: "مؤرشف", color: "secondary" },
  AWAITING_PAYMENT: { en: "Awaiting Payment", ar: "بانتظار السداد", color: "warning" },
  ACCOUNTS_LOCKED: { en: "Accounts Locked", ar: "قفل الحسابات", color: "success" },
  REJECTED_TO_DESK_BY_ACCOUNTS: { en: "Rejected by Accounts", ar: "مرفوض من الحسابات", color: "destructive" },
};

export type ChecklistStatus =
  | "NOT_REQUESTED"
  | "REQUESTED"
  | "UPLOADED"
  | "UNDER_REVIEW"
  | "VERIFIED"
  | "MISSING"
  | "REJECTED"
  | "EXPIRED"
  | "UNREADABLE"
  | "NOT_APPLICABLE"
  | "CONDITIONAL_ACCEPTANCE";

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, { en: string; ar: string; color: string }> = {
  NOT_REQUESTED: { en: "Not Requested", ar: "غير مطلوب", color: "secondary" },
  REQUESTED: { en: "Requested", ar: "مطلوب", color: "default" },
  UPLOADED: { en: "Uploaded", ar: "مرفوع", color: "info" },
  UNDER_REVIEW: { en: "Under Review", ar: "تحت المراجعة", color: "info" },
  VERIFIED: { en: "Verified", ar: "متحقق", color: "success" },
  MISSING: { en: "Missing", ar: "مفقود", color: "destructive" },
  REJECTED: { en: "Rejected", ar: "مرفوض", color: "destructive" },
  EXPIRED: { en: "Expired", ar: "منتهي", color: "destructive" },
  UNREADABLE: { en: "Unreadable", ar: "غير مقروء", color: "destructive" },
  NOT_APPLICABLE: { en: "Not Applicable", ar: "غير مناسب", color: "secondary" },
  CONDITIONAL_ACCEPTANCE: { en: "Conditional Acceptance", ar: "قبول مشروط", color: "warning" },
};

export type DocVerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED"
  | "UNREADABLE"
  | "NOT_APPLICABLE"
  | "CONDITIONAL";

export type UserRole = "RECEPTION_ADMIN" | "TRUSTEE_OFFICER" | "TRUSTEE_MANAGER" | "CLIENT" | "ADMIN" | "ACCOUNTANT" | "AGENT";

export const ROLE_LABELS: Record<UserRole, { en: string; ar: string }> = {
  RECEPTION_ADMIN: { en: "Reception Administrator", ar: "موظف الاستقبال" },
  TRUSTEE_OFFICER: { en: "Trustee Officer", ar: "مسؤول الأمين" },
  TRUSTEE_MANAGER: { en: "Trustee Manager", ar: "مدير الأمين" },
  CLIENT: { en: "Client", ar: "عميل" },
  ADMIN: { en: "System Administrator", ar: "مسؤول النظام" },
  ACCOUNTANT: { en: "Accountant", ar: "محاسب" },
  AGENT: { en: "Agent", ar: "وكيل" },
};

export type NotificationStatus =
  | "DRAFT" | "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "CANCELLED" | "READ";

export type NotificationChannel = "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP" | "PDF_LETTER" | "CLIENT_PORTAL";

export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export const PRIORITY_LABELS: Record<Priority, { en: string; ar: string; color: string }> = {
  LOW: { en: "Low", ar: "منخفض", color: "secondary" },
  NORMAL: { en: "Normal", ar: "عادي", color: "default" },
  HIGH: { en: "High", ar: "عالي", color: "warning" },
  URGENT: { en: "Urgent", ar: "عاجل", color: "destructive" },
};

// Standard document types used across the configurable catalog
export const DOC_TYPES: { key: string; en: string; ar: string }[] = [
  { key: "EMIRATES_ID", en: "Emirates ID", ar: "الهوية الإماراتية" },
  { key: "PASSPORT", en: "Passport", ar: "جواز السفر" },
  { key: "VISA", en: "Residence Visa", ar: "تأشيرة الإقامة" },
  { key: "TITLE_DEED", en: "Title Deed", ar: "صك الملكية" },
  { key: "SALE_AGREEMENT", en: "Sale Agreement (F Form)", ar: "اتفاقية البيع (نموذج F)" },
  { key: "MOA", en: "Memorandum of Understanding", ar: "مذكرة تفاهم" },
  { key: "MORTGAGE_AGREEMENT", en: "Mortgage Agreement", ar: "اتفاقية الرهن" },
  { key: "MORTGAGE_RELEASE", en: "Mortgage Release Letter", ar: "خطاب تسريح الرهن" },
  { key: "NOC_DEVELOPER", en: "Developer NOC", ar: "شهادة عدم ممانعة المطور" },
  { key: "NOC_COMMUNITY", en: "Community/Management NOC", ar: "شهادة عدم ممانعة الإدارة" },
  { key: "POA", en: "Power of Attorney", ar: "التوكيل الرسمي" },
  { key: "BOARD_RESOLUTION", en: "Board Resolution", ar: "قرار مجلس الإدارة" },
  { key: "TRADE_LICENSE", en: "Trade License", ar: "الترخيص التجاري" },
  { key: "COMPUNITY_DOC", en: "Company Memorandum", ar: "عقد التأسيس" },
  { key: "PARTNER_LIST", en: "Partners/Shareholders List", ar: "قائمة الشركاء" },
  { key: "GIFT_DEED", en: "Gift Deed", ar: "صك الهبة" },
  { key: "TENANCY_CONTRACT", en: "Ejari Tenancy Contract", ar: "عقد الإيجار (إيجاري)" },
  { key: "VALUATION_REPORT", en: "Valuation Report", ar: "تقرير التقييم" },
  { key: "UTILITY_BILL", en: "Utility Bill (DEWA)", ar: "فاتورة الخدمات" },
  { key: "SERVICE_CHARGE", en: "Service Charge Statement", ar: "بيان رسوم الخدمة" },
  { key: "OQOOD_CERTIFICATE", en: "Oqood Registration Certificate", ar: "شهادة تسجيل عقد" },
  { key: "MAP_PLAN", en: "Property Map / Plan", ar: "مخطط العقار" },
  { key: "INSURANCE", en: "Property Insurance", ar: "تأمين العقار" },
  { key: "OTHER", en: "Other Document", ar: "وثيقة أخرى" },
];

export function docLabel(key: string, locale: "en" | "ar"): string {
  const d = DOC_TYPES.find((x) => x.key === key);
  return d ? (locale === "ar" ? d.ar : d.en) : key;
}
