// Phase 9.1 — Flows 3-6 only (Flow 1+2 done via UI clicks already)
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/download/phase91';
const fs = require('fs');

let token = '', csrf = '', userId = '', userName = '';

function log(s, m, d) { console.log(`[${s}] ${m}`); if (d !== undefined) console.log(JSON.stringify(d, null, 2).slice(0, 1200)); }
function hdr() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-CSRF-Token': csrf }; }

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@trustee.ae', password: 'trustee123' }) });
  const d = await r.json();
  token = d.token; csrf = d.csrfToken; userId = d.user.id; userName = d.user.name;
  log('LOGIN', `logged in as ${userName}`);
}

async function flow3() {
  const before = Date.now();
  log('FLOW3', '=== Create + dry-run automation rule ===');
  const ruleBody = {
    name: 'Phase 9.1 Verification — High Priority Doc Follow-up',
    trigger: 'docs_missing',
    priority: 90,
    isActive: true,
    conditions: { case_priority: 'urgent', days_since_last_response_gte: 2 },
    actions: [
      { type: 'send_template', templateName: 'secure_upload_request', language: 'en', variables: { client_name: '{{client_name}}', case_number: '{{case_number}}', upload_link: '{{upload_link}}' } },
      { type: 'assign_conversation', teamId: 'officer-queue' },
    ],
    description: 'Phase 9.1 verification: fires when urgent case has missing docs and client has not responded in 2+ days.',
  };
  const createRes = await fetch(`${BASE}/api/whatsapp/automations`, { method: 'POST', headers: hdr(), body: JSON.stringify(ruleBody) });
  const createData = await createRes.json();
  log('FLOW3', 'POST /api/whatsapp/automations', createData);
  const ruleId = createData.rule?.id;
  const listRes = await fetch(`${BASE}/api/whatsapp/automations`, { headers: hdr() });
  const listData = await listRes.json();
  const found = listData.rules.find(r => r.id === ruleId);
  log('FLOW3', `Rule found in list (priority=${found?.priority}, active=${found?.isActive})`);
  const sampleContext = {
    client_name: 'Ahmed Al Mansoori', case_number: 'TOP-2026-0001', case_priority: 'urgent',
    days_since_last_response: 3, upload_link: 'http://localhost:3000/upload/sample-token-xyz',
  };
  const dryRunRes = await fetch(`${BASE}/api/whatsapp/automations/${ruleId}`, { method: 'POST', headers: hdr(), body: JSON.stringify({ sampleContext }) });
  const dryRunData = await dryRunRes.json();
  log('FLOW3', 'POST /api/whatsapp/automations/[id] (dry-run)', dryRunData);
  const audits = await p.auditLog.findMany({ where: { action: { contains: 'WHATSAPP_AUTOMATION' }, createdAt: { gte: new Date(before) } } });
  log('FLOW3', `Audit entries: ${audits.length}`);
  for (const a of audits) console.log(`    ${a.action} | ${a.details}`);
  fs.writeFileSync(`${OUT}/flow3-automation.json`, JSON.stringify({ created: createData.rule, dryRun: dryRunData, audits }, null, 2));
  return { ruleId, dryRun: dryRunData };
}

async function flow4() {
  const before = Date.now();
  log('FLOW4', '=== Create routing rule + test against conversation ===');
  const ruleBody = {
    name: 'Phase 9.1 Verification — Urgent Property Sale → Senior Officer',
    priority: 45, isActive: true,
    conditions: { keywords_any: ['sale', 'property', 'mortgage'], priority: 'urgent' },
    assignedTeamId: 'senior-officer-queue', slaMinutes: 60, escalateToRole: 'TRUSTEE_MANAGER',
  };
  const createRes = await fetch(`${BASE}/api/whatsapp/routing`, { method: 'POST', headers: hdr(), body: JSON.stringify(ruleBody) });
  const createData = await createRes.json();
  log('FLOW4', 'POST /api/whatsapp/routing', createData);
  const ruleId = createData.rule?.id;
  const listRes = await fetch(`${BASE}/api/whatsapp/routing`, { headers: hdr() });
  const listData = await listRes.json();
  const sorted = listData.rules.slice().sort((a, b) => a.priority - b.priority);
  log('FLOW4', 'Routing rules ordered by priority:');
  for (const r of sorted) console.log(`    ${r.priority} | ${r.name} | active=${r.isActive}`);
  const testConvId = 'cmup6o5a6008hphbubnqjrfuk';
  const routeRes = await fetch(`${BASE}/api/whatsapp/conversations/${testConvId}/route`, { method: 'POST', headers: hdr(), body: JSON.stringify({}) });
  const routeData = await routeRes.json();
  log('FLOW4', `POST /api/whatsapp/conversations/[id]/route`, routeData);
  const audits = await p.auditLog.findMany({ where: { action: { contains: 'WHATSAPP_ROUTING' }, createdAt: { gte: new Date(before) } } });
  log('FLOW4', `Audit entries: ${audits.length}`);
  for (const a of audits) console.log(`    ${a.action} | ${a.details}`);
  fs.writeFileSync(`${OUT}/flow4-routing.json`, JSON.stringify({ created: createData.rule, listOrdered: sorted, routeResult: routeData, audits }, null, 2));
  return { ruleId, routeData };
}

async function flow5() {
  const before = Date.now();
  log('FLOW5', '=== Create + save template with EN + AR ===');
  const bodyEn = 'Hello {{client_name}}, your case {{case_number}} has been updated. Phase 9.1 verification — English body.';
  const bodyAr = 'مرحباً {{client_name}}، تم تحديث ملفك {{case_number}}. التحقق من المرحلة 9.1 — النص العربي.';
  const createRes = await fetch(`${BASE}/api/whatsapp/templates`, {
    method: 'POST', headers: hdr(),
    body: JSON.stringify({ name: 'phase91_verification_template', category: 'utility', language: 'en', bodyEn, bodyAr, variables: JSON.stringify(['client_name', 'case_number']) }),
  });
  const createData = await createRes.json();
  log('FLOW5', 'POST /api/whatsapp/templates', createData);
  const newId = createData.template?.id;
  const listRes = await fetch(`${BASE}/api/whatsapp/templates`, { headers: hdr() });
  const listData = await listRes.json();
  const found = listData.templates?.find(t => t.id === newId);
  log('FLOW5', `Reopen template → bodyEnLen=${found?.bodyEn?.length}, bodyArLen=${found?.bodyAr?.length}`);
  const enMatch = found?.bodyEn === bodyEn;
  const arMatch = found?.bodyAr === bodyAr;
  log('FLOW5', `EN body persisted: ${enMatch} | AR body persisted: ${arMatch}`);
  const audits = await p.auditLog.findMany({ where: { action: { contains: 'WHATSAPP_TEMPLATE' }, createdAt: { gte: new Date(before) } } });
  log('FLOW5', `Audit entries: ${audits.length}`);
  for (const a of audits) console.log(`    ${a.action} | ${a.details}`);
  fs.writeFileSync(`${OUT}/flow5-template.json`, JSON.stringify({ created: createData.template, reopened: found, enMatch, arMatch, audits }, null, 2));
  return { newId, enMatch, arMatch, found };
}

async function flow6() {
  const before = Date.now();
  log('FLOW6', '=== Book appointment from composer ===');
  const convId = 'cmup6o5a5008dphbuvyv3hrpw';
  const contactId = 'cmup6o5a10088phbugw1ajztj';
  const slotsAvailBefore = await p.appointmentSlot.count({ where: { isBooked: false } });
  const apptsBefore = await p.appointment.count();
  log('FLOW6', `Before: available_slots=${slotsAvailBefore}, appointments=${apptsBefore}`);
  const proposeRes = await fetch(`${BASE}/api/whatsapp/conversations/${convId}/appointments/propose`, { method: 'POST', headers: hdr(), body: JSON.stringify({ contactId, serviceType: 'trustee_appointment' }) });
  const proposeData = await proposeRes.json();
  log('FLOW6', `Propose → ${proposeData.slots?.length || 0} slots offered`);
  const firstSlot = proposeData.slots?.[0];
  if (!firstSlot) { log('FLOW6', '!! No slots'); return { ok: false }; }
  log('FLOW6', `First offered: ${firstSlot.id} ${firstSlot.date} ${firstSlot.time}`);
  const confirmRes = await fetch(`${BASE}/api/whatsapp/conversations/${convId}/appointments/confirm`, { method: 'POST', headers: hdr(), body: JSON.stringify({ slotId: firstSlot.id, caseNumber: 'TOP-2026-0005' }) });
  const confirmData = await confirmRes.json();
  log('FLOW6', 'POST /api/whatsapp/conversations/[id]/appointments/confirm', confirmData);
  const slotAfter = await p.appointmentSlot.findUnique({ where: { id: firstSlot.id }, select: { id: true, isBooked: true, appointmentId: true, bookedAt: true, bookedBy: true } });
  log('FLOW6', 'Slot state after confirm:', slotAfter);
  const appt = await p.appointment.findFirst({ where: { bookingRef: { startsWith: 'WA-' } }, orderBy: { createdAt: 'desc' }, select: { id: true, bookingRef: true, type: true, dateTime: true, duration: true, attendees: true, checkInStatus: true, caseId: true, notes: true, createdAt: true } });
  log('FLOW6', 'Newest Appointment row:', appt);
  const confMsg = await p.waMessage.findFirst({ where: { conversationId: convId, templateName: 'appointment_confirmation' }, orderBy: { createdAt: 'desc' }, select: { id: true, direction: true, templateName: true, content: true, externalMessageId: true, deliveryStatus: true, createdAt: true } });
  log('FLOW6', 'Confirmation WhatsApp message:', confMsg);
  const slotsRes = await fetch(`${BASE}/api/appointments/slots`, { headers: hdr() });
  const slotsData = await slotsRes.json();
  const bookedSlotInApi = (slotsData.slots || []).find(s => s.id === firstSlot.id);
  log('FLOW6', `Calendar API → ${slotsData.slots?.length || 0} slots; first offered isBooked=${bookedSlotInApi?.isBooked}, appointmentId=${bookedSlotInApi?.appointmentId}`);
  const auditsAppt = await p.auditLog.findMany({ where: { action: { contains: 'APPOINTMENT' }, createdAt: { gte: new Date(before) } } });
  log('FLOW6', `APPOINTMENT* audit entries: ${auditsAppt.length}`);
  for (const a of auditsAppt) console.log(`    ${a.action} | ${a.details}`);
  const auditsWa = await p.auditLog.findMany({ where: { action: { contains: 'WHATSAPP_MESSAGE_SENT' }, createdAt: { gte: new Date(before) } } });
  log('FLOW6', `WHATSAPP_MESSAGE_SENT audit entries: ${auditsWa.length}`);
  for (const a of auditsWa) console.log(`    ${a.action} | ${a.details}`);
  fs.writeFileSync(`${OUT}/flow6-appointment.json`, JSON.stringify({ proposed: proposeData, confirmed: confirmData, slotAfter, appointment: appt, confirmationMessage: confMsg, calendarSlot: bookedSlotInApi, audits: [...auditsAppt, ...auditsWa] }, null, 2));
  return { ok: true, slotAfter, appt, confMsg, firstSlot };
}

(async () => {
  await login();
  const r = {};
  try {
    r.flow3 = await flow3();
    r.flow4 = await flow4();
    r.flow5 = await flow5();
    r.flow6 = await flow6();
  } catch (e) { console.error('!!! ', e); }
  fs.writeFileSync(`${OUT}/flows3-6-summary.json`, JSON.stringify(r, null, 2));
  await p.$disconnect();
  console.log('\n=== Flows 3-6 complete ===');
})();
