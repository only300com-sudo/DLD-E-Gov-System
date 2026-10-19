import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const counts = {
  Invoice: await db.invoice.count(),
  Document: await db.document.count(),
  Appointment: await db.appointment.count(),
  Task: await db.task.count(),
  StatusHistory: await db.statusHistory.count(),
  AuditLog: await db.auditLog.count(),
  ReceptionHandoverChecklist: await db.receptionHandoverChecklist.count(),
  ReturnNote: await db.returnNote.count(),
  DelegationEvent: await db.delegationEvent.count(),
  FeeLine: await db.feeLine.count(),
  FeeReceipt: await db.feeReceipt.count(),
  Comment: await db.comment.count(),
  Agreement: await db.agreement.count(),
  Approval: await db.approval.count(),
  ExceptionRequest: await db.exceptionRequest.count(),
  DldManualRecord: await db.dldManualRecord.count(),
  CaseFieldVersion: await db.caseFieldVersion.count(),
  CaseEditLock: await db.caseEditLock.count(),
  FieldConflict: await db.fieldConflict.count(),
  DocumentChecklistItem: await db.documentChecklistItem.count(),
};
for (const [k, v] of Object.entries(counts)) console.log(`${k}: ${v}`);
await db.$disconnect();
