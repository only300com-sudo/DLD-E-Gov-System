// Phase 9.1 — Action Flow Verification Script
// Reproduces exactly what the UI composer buttons do, then verifies DB state + audit log.
// Usage: node /home/z/my-project/scripts/phase91-verify.js

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const BASE = 'http://localhost:3000';
const OUT = '/home/z/my-project/download/phase91';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

const ADMIN_EMAIL = 'admin@trustee.ae';
const ADMIN_PWD = 'trustee123';

let token = '';
let csrf = '';
let userId = '';
let userName = '';

function log(section, msg, data) {
  const line = `[${section}] ${msg}`;
  console.log(line);
  if (data !== undefined) console.log(JSON.stringify(data, null, 2).slice(0, 1500));
}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PWD }),
  });
  const d = await r.json();
  if (!d.ok) throw new Error('login failed: ' + JSON.stringify(d));
  token = d.token;
  csrf = d.csrfToken;
  userId = d.user.id;
  userName = d.user.name;
  log('LOGIN', `logged in as ${userName} (${d.user.role})`);
  return d;
}

function hdr(extra = {}) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-CSRF-Token': csrf,
    ...extra,
  };
}

async function auditEntries(actionLike, since) {
  const sinceDate = new Date(since);
  const rows = await p.auditLog.findMany({
    where: { action: { contains: actionLike }, createdAt: { gte: sinceDate } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, action: true, details: true, createdAt: true, userId: true, caseId: true, entityId: true },
  });
  return rows;
}

// ============================================================
// FLOW 1 — Send Secure Link from composer
// ============================================================
async function flow1_sendSecureLink() {
  const convId = 'cmup6o5a5008bphbu2ig2k6a9'; // Ahmed Al Mansoori (TOP-2026-0001, opted_in)
  const contactId = 'cmup6o5a10087phbu9hz9wl1h';
  const caseRef = 'TOP-2026-0001';
  const caseId = 'cmup6o547001gphbuxxtmrfa5';
  const before = Date.now();

  log('FLOW1', '=== Send Secure Link from composer ===');
  log('FLOW1', `Conversation: ${convId} (Ahmed Al Mansoori, ${caseRef})`);

  // Step 1: count links before
  const beforeLinks = await p.secureLink.count({ where: { caseNumber: caseRef } });
  log('FLOW1', `SecureLinks for ${caseRef} BEFORE: ${beforeLinks} (expected 2 seeded)`);

  // Step 2: composer button → POST /api/secure-links
  const linkRes = await fetch(`${BASE}/api/secure-links`, {
    method: 'POST',
    headers: hdr(),
    body: JSON.stringify({ caseNumber: caseRef, contactId, expiresInHours: 168 }),
  });
  const linkData = await linkRes.json();
  log('FLOW1', 'POST /api/secure-links', linkData);

  if (!linkData.ok) throw new Error('secure link creation failed');
  const newToken = linkData.link.token;
  const newUrl = linkData.link.url;
  const newId = linkData.link.id;

  // Step 3: composer button → POST /api/whatsapp/conversations/[id]/messages (secure_upload_request template)
  const msgRes = await fetch(`${BASE}/api/whatsapp/conversations/${convId}/messages`, {
    method: 'POST',
    headers: hdr(),
    body: JSON.stringify({
      contactId,
      templateName: 'secure_upload_request',
      language: 'en',
      variables: { client_name: 'Ahmed Al Mansoori', upload_link: newUrl, case_number: caseRef },
    }),
  });
  const msgData = await msgRes.json();
  log('FLOW1', 'POST /api/whatsapp/conversations/[id]/messages (secure_upload_request template)', msgData);

  // Step 4: verify SecureLink count is now 3 in DB
  const afterLinks = await p.secureLink.count({ where: { caseNumber: caseRef } });
  log('FLOW1', `SecureLinks for ${caseRef} AFTER: ${afterLinks} (expected 3)`);

  // Step 5: verify newest link is active
  const newest = await p.secureLink.findFirst({
    where: { caseNumber: caseRef },
    orderBy: { createdAt: 'desc' },
    select: { id: true, token: true, isRevoked: true, expiresAt: true, usedCount: true, maxUses: true, createdAt: true, purpose: true },
  });
  log('FLOW1', 'Newest SecureLink for case:', newest);

  // Step 6: verify the case's Secure Links tab API returns 3 links, newest first
  const caseLinksRes = await fetch(`${BASE}/api/cases/${caseId}/secure-links`, { headers: hdr() });
  const caseLinksData = await caseLinksRes.json();
  log('FLOW1', `GET /api/cases/[id]/secure-links → ${caseLinksData.links?.length || 0} links`);
  if (caseLinksData.links) {
    for (const l of caseLinksData.links) {
      const expired = new Date(l.expiresAt) < new Date();
      log('FLOW1', `  - id=${l.id.slice(-6)} token=${l.token.slice(0, 24)}... revoked=${l.isRevoked} expired=${expired} uploads=${l._count?.uploads ?? 0} purpose=${l.purpose}`);
    }
  }

  // Step 7: verify WaMessage row was created with stub externalMessageId
  const newMsg = await p.waMessage.findFirst({
    where: { conversationId: convId, templateName: 'secure_upload_request' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, direction: true, content: true, templateName: true, externalMessageId: true, deliveryStatus: true, createdAt: true },
  });
  log('FLOW1', 'Newest outbound WaMessage:', newMsg);

  // Step 8: audit entries
  const audits = await auditEntries('SECURE_LINK', before);
  log('FLOW1', `Audit entries for SECURE_LINK* since run-start (${audits.length}):`);
  for (const a of audits) console.log(`    ${a.action} | ${a.details}`);

  // Save flow1 result
  fs.writeFileSync(`${OUT}/flow1-secure-link.json`, JSON.stringify({
    beforeCount: beforeLinks,
    afterCount: afterLinks,
    newLink: linkData.link,
    newMessage: newMsg,
    caseLinks: caseLinksData.links,
    audits,
  }, null, 2));

  return { newToken, newId, newUrl, newMessage: newMsg };
}

// ============================================================
// FLOW 2 — Revoke a link via UI
// ============================================================
async function flow2_revokeLink(newTokenFromFlow1) {
  const before = Date.now();
  log('FLOW2', '=== Revoke link via UI ===');
  log('FLOW2', `Revoking token: ${newTokenFromFlow1.slice(0, 24)}...`);

  const r = await fetch(`${BASE}/api/secure-links/${newTokenFromFlow1}/revoke`, {
    method: 'POST',
    headers: hdr(),
    body: JSON.stringify({ reason: 'Phase 9.1 UI verification — manual revocation' }),
  });
  const d = await r.json();
  log('FLOW2', 'POST /api/secure-links/[token]/revoke', d);

  // Verify DB state
  const link = await p.secureLink.findUnique({
    where: { token: newTokenFromFlow1 },
    select: { id: true, isRevoked: true, revokedAt: true, revokedBy: true },
  });
  log('FLOW2', 'DB state after revoke:', link);

  // Audit entry
  const audits = await auditEntries('SECURE_LINK_REVOKED', before);
  log('FLOW2', `SECURE_LINK_REVOKED audit entries: ${audits.length}`);
  for (const a of audits) console.log(`    ${a.action} | ${a.details}`);

  fs.writeFileSync(`${OUT}/flow2-revoke.json`, JSON.stringify({ apiResponse: d, dbState: link, audits }, null, 2));

  return { isRevoked: link?.isRevoked === true };
}

// ============================================================
// FLOW 3 — Create + dry-run automation rule
// ============================================================
async function flow3_createAndDryRunAutomation() {
  const before = Date.now();
  log('FLOW3', '=== Create + dry-run automation rule ===');

  // Step 1: create rule via POST /api/whatsapp/automations
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
  const createRes = await fetch(`${BASE}/api/whatsapp/automations`, {
    method: 'POST',
    headers: hdr(),
    body: JSON.stringify(ruleBody),
  });
  const createData = await createRes.json();
  log('FLOW3', 'POST /api/whatsapp/automations', createData);
  if (!createData.ok) throw new Error('automation create failed');

  const ruleId = createData.rule.id;

  // Step 2: list rules to confirm the new rule appears
  const listRes = await fetch(`${BASE}/api/whatsapp/automations`, { headers: hdr() });
  const listData = await listRes.json();
  const found = listData.rules.find(r => r.id === ruleId);
  log('FLOW3', `Rule found in list (priority=${found?.priority}, active=${found?.isActive})`);

  // Step 3: dry-run via POST /api/whatsapp/automations/[id] (the POST handler does dry-run)
  const sampleContext = {
    client_name: 'Ahmed Al Mansoori',
    case_number: 'TOP-2026-0001',
    case_priority: 'urgent',
    days_since_last_response: 3,
    upload_link: 'http://localhost:3000/upload/sample-token-xyz',
  };
  const dryRunRes = await fetch(`${BASE}/api/whatsapp/automations/${ruleId}`, {
    method: 'POST',
    headers: hdr(),
    body: JSON.stringify({ sampleContext }),
  });
  const dryRunData = await dryRunRes.json();
  log('FLOW3', 'POST /api/whatsapp/automations/[id] (dry-run)', dryRunData);

  // Step 4: audit entries
  const audits = await auditEntries('WHATSAPP_AUTOMATION', before);
  log('FLOW3', `Audit entries: ${audits.length}`);
  for (const a of audits) console.log(`    ${a.action} | ${a.details}`);

  fs.writeFileSync(`${OUT}/flow3-automation.json`, JSON.stringify({ created: createData.rule, dryRun: dryRunData, audits }, null, 2));

  return { ruleId, dryRun: dryRunData };
}

// ============================================================
// FLOW 4 — Create routing rule + test against conversation
// ============================================================
async function flow4_createAndTestRouting() {
  const before = Date.now();
  log('FLOW4', '=== Create routing rule + test against conversation ===');

  // Step 1: create routing rule
  const ruleBody = {
    name: 'Phase 9.1 Verification — Urgent Property Sale → Senior Officer',
    priority: 45,
    isActive: true,
    conditions: { keywords_any: ['sale', 'property', 'mortgage'], priority: 'urgent' },
    assignedTeamId: 'senior-officer-queue',
    assignedUserId: null,
    slaMinutes: 60,
    escalateToRole: 'TRUSTEE_MANAGER',
  };
  const createRes = await fetch(`${BASE}/api/whatsapp/routing`, {
    method: 'POST',
    headers: hdr(),
    body: JSON.stringify(ruleBody),
  });
  const createData = await createRes.json();
  log('FLOW4', 'POST /api/whatsapp/routing', createData);
  if (!createData.ok) throw new Error('routing rule create failed');

  const ruleId = createData.rule.id;

  // Step 2: list rules — confirm rule appears with correct priority
  const listRes = await fetch(`${BASE}/api/whatsapp/routing`, { headers: hdr() });
  const listData = await listRes.json();
  const sorted = listData.rules.slice().sort((a, b) => a.priority - b.priority);
  log('FLOW4', 'Routing rules ordered by priority:');
  for (const r of sorted) console.log(`    ${r.priority} | ${r.name} | active=${r.isActive}`);

  const found = listData.rules.find(r => r.id === ruleId);
  log('FLOW4', `New rule in list: priority=${found?.priority}, active=${found?.isActive}`);

  // Step 3: test against a conversation — use Fatima Saeed (Arabic, urgent)
  const testConvId = 'cmup6o5a6008hphbubnqjrfuk'; // Fatima Saeed, urgent, arabic
  const routeRes = await fetch(`${BASE}/api/whatsapp/conversations/${testConvId}/route`, {
    method: 'POST',
    headers: hdr(),
    body: JSON.stringify({}),
  });
  const routeData = await routeRes.json();
  log('FLOW4', `POST /api/whatsapp/conversations/[id]/route (conv=${testConvId})`, routeData);

  // Step 4: audit entries
  const audits = await auditEntries('WHATSAPP_ROUTING', before);
  log('FLOW4', `Audit entries: ${audits.length}`);
  for (const a of audits) console.log(`    ${a.action} | ${a.details}`);

  fs.writeFileSync(`${OUT}/flow4-routing.json`, JSON.stringify({ created: createData.rule, listOrdered: sorted, routeResult: routeData, audits }, null, 2));

  return { ruleId, routeData };
}

// ============================================================
// FLOW 5 — Create + save template with EN + AR
// ============================================================
async function flow5_createTemplateEnAr() {
  const before = Date.now();
  log('FLOW5', '=== Create + save template with EN + AR ===');

  const bodyEn = 'Hello {{client_name}}, your case {{case_number}} has been updated. Phase 9.1 verification — English body.';
  const bodyAr = 'مرحباً {{client_name}}، تم تحديث ملفك {{case_number}}. التحقق من المرحلة 9.1 — النص العربي.';

  const createRes = await fetch(`${BASE}/api/whatsapp/templates`, {
    method: 'POST',
    headers: hdr(),
    body: JSON.stringify({
      name: 'phase91_verification_template',
      category: 'utility',
      language: 'en',
      bodyEn,
      bodyAr,
      variables: JSON.stringify(['client_name', 'case_number']),
    }),
  });
  const createData = await createRes.json();
  log('FLOW5', 'POST /api/whatsapp/templates (create)', createData);
  if (!createData.ok) throw new Error('template create failed');

  const newId = createData.template?.id;

  // Reopen via GET
  const listRes = await fetch(`${BASE}/api/whatsapp/templates`, { headers: hdr() });
  const listData = await listRes.json();
  const found = listData.templates?.find(t => t.id === newId);
  log('FLOW5', `Reopen template → id=${found?.id}, bodyEnLen=${found?.bodyEn?.length}, bodyArLen=${found?.bodyAr?.length}`);

  const enMatch = found?.bodyEn === bodyEn;
  const arMatch = found?.bodyAr === bodyAr;
  log('FLOW5', `EN body persisted: ${enMatch}`);
  log('FLOW5', `AR body persisted: ${arMatch}`);

  // Audit
  const audits = await auditEntries('WHATSAPP_TEMPLATE', before);
  log('FLOW5', `Audit entries: ${audits.length}`);
  for (const a of audits) console.log(`    ${a.action} | ${a.details}`);

  fs.writeFileSync(`${OUT}/flow5-template.json`, JSON.stringify({
    created: createData.template,
    reopened: found,
    enMatch,
    arMatch,
    audits,
  }, null, 2));

  return { newId, enMatch, arMatch, found };
}

// ============================================================
// FLOW 6 — Book appointment from composer
// ============================================================
async function flow6_bookAppointment() {
  const before = Date.now();
  log('FLOW6', '=== Book appointment from composer ===');

  const convId = 'cmup6o5a5008dphbuvyv3hrpw'; // Gulf Properties LLC, opted_in, no case
  const contactId = 'cmup6o5a10088phbugw1ajztj';

  // Step 1: count slots + appointments before
  const slotsAvailBefore = await p.appointmentSlot.count({ where: { isBooked: false } });
  const apptsBefore = await p.appointment.count();
  log('FLOW6', `Before: available_slots=${slotsAvailBefore}, appointments=${apptsBefore}`);

  // Step 2: propose slots (composer button flow)
  const proposeRes = await fetch(`${BASE}/api/whatsapp/conversations/${convId}/appointments/propose`, {
    method: 'POST',
    headers: hdr(),
    body: JSON.stringify({ contactId, serviceType: 'trustee_appointment' }),
  });
  const proposeData = await proposeRes.json();
  log('FLOW6', 'POST /api/whatsapp/conversations/[id]/appointments/propose', proposeData);

  if (!proposeData.ok || !proposeData.slots?.length) {
    log('FLOW6', '!! No slots offered — cannot continue');
    return { ok: false };
  }
  const firstSlot = proposeData.slots[0];
  log('FLOW6', `First offered slot: id=${firstSlot.id} date=${firstSlot.date} time=${firstSlot.time}`);

  // Step 3: confirm (composer button flow — auto-confirms first slot)
  const confirmRes = await fetch(`${BASE}/api/whatsapp/conversations/${convId}/appointments/confirm`, {
    method: 'POST',
    headers: hdr(),
    body: JSON.stringify({ slotId: firstSlot.id, caseNumber: 'TOP-2026-0005' }),
  });
  const confirmData = await confirmRes.json();
  log('FLOW6', 'POST /api/whatsapp/conversations/[id]/appointments/confirm', confirmData);

  // Step 4: verify slot marked booked
  const slotAfter = await p.appointmentSlot.findUnique({
    where: { id: firstSlot.id },
    select: { id: true, isBooked: true, bookedAt: true, bookedBy: true, appointmentId: true },
  });
  log('FLOW6', 'Slot state after confirm:', slotAfter);

  // Step 5: verify Appointment row created + linked to slot
  const appt = await p.appointment.findFirst({
    where: { bookingRef: { startsWith: 'WA-' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, bookingRef: true, type: true, dateTime: true, duration: true, attendees: true, checkInStatus: true, caseId: true, notes: true, createdAt: true },
  });
  log('FLOW6', 'Newest Appointment row:', appt);

  // Also fetch the slot to confirm slot.appointmentId now points to it
  const slotAfterWithAppt = await p.appointmentSlot.findUnique({
    where: { id: firstSlot.id },
    select: { id: true, isBooked: true, appointmentId: true, bookedAt: true, bookedBy: true },
  });
  log('FLOW6', 'Slot state (with appointmentId):', slotAfterWithAppt);

  // Step 6: verify WhatsApp confirmation template sent (stub log)
  const confMsg = await p.waMessage.findFirst({
    where: { conversationId: convId, templateName: 'appointment_confirmation' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, direction: true, templateName: true, content: true, externalMessageId: true, deliveryStatus: true, createdAt: true },
  });
  log('FLOW6', 'Confirmation WhatsApp message:', confMsg);

  // Step 7: verify appointment appears in slots calendar (GET /api/appointments/slots)
  const slotsRes = await fetch(`${BASE}/api/appointments/slots`, { headers: hdr() });
  const slotsData = await slotsRes.json();
  const bookedSlotInApi = (slotsData.slots || []).find(s => s.id === firstSlot.id);
  log('FLOW6', `Calendar API GET /api/appointments/slots → ${slotsData.slots?.length || 0} slots; first offered slot isBooked=${bookedSlotInApi?.isBooked}, appointmentId=${bookedSlotInApi?.appointmentId}`);

  // Step 8: audit
  const auditsAppt = await auditEntries('APPOINTMENT', before);
  log('FLOW6', `APPOINTMENT* audit entries: ${auditsAppt.length}`);
  for (const a of auditsAppt) console.log(`    ${a.action} | ${a.details}`);

  const auditsWa = await auditEntries('WHATSAPP_MESSAGE_SENT', before);
  log('FLOW6', `WHATSAPP_MESSAGE_SENT audit entries: ${auditsWa.length}`);
  for (const a of auditsWa) console.log(`    ${a.action} | ${a.details}`);

  fs.writeFileSync(`${OUT}/flow6-appointment.json`, JSON.stringify({
    proposed: proposeData,
    confirmed: confirmData,
    slotAfter,
    appointment: appt,
    confirmationMessage: confMsg,
    calendarSlot: bookedSlotInApi,
    audits: [...auditsAppt, ...auditsWa],
  }, null, 2));

  return { ok: true, slotAfter, appt, confMsg };
}

// ============================================================
// MAIN
// ============================================================
(async () => {
  await login();
  const results = {};
  try {
    results.flow1 = await flow1_sendSecureLink();
    results.flow2 = await flow2_revokeLink(results.flow1.newToken);
    results.flow3 = await flow3_createAndDryRunAutomation();
    results.flow4 = await flow4_createAndTestRouting();
    results.flow5 = await flow5_createTemplateEnAr();
    results.flow6 = await flow6_bookAppointment();
  } catch (e) {
    console.error('!!! FLOW FAILED:', e);
  } finally {
    fs.writeFileSync(`${OUT}/all-flows-summary.json`, JSON.stringify({
      flow1_newLink: results.flow1?.newId,
      flow1_newMessage: results.flow1?.newMessage?.id,
      flow2_revoked: results.flow2?.isRevoked,
      flow3_ruleId: results.flow3?.ruleId,
      flow3_dryRunConditionsMatch: results.flow3?.dryRun?.conditionsMatch,
      flow3_dryRunActionsCount: results.flow3?.dryRun?.actionsPreview?.length,
      flow4_ruleId: results.flow4?.ruleId,
      flow4_routeMatched: results.flow4?.routeData?.matched,
      flow4_routeRuleName: results.flow4?.routeData?.rule?.name,
      flow5_templateId: results.flow5?.newId,
      flow5_enMatch: results.flow5?.enMatch,
      flow5_arMatch: results.flow5?.arMatch,
      flow6_ok: results.flow6?.ok,
      flow6_slotBooked: results.flow6?.slotAfter?.isBooked,
      flow6_appointmentId: results.flow6?.appt?.id,
      flow6_confirmationMsgId: results.flow6?.confMsg?.id,
    }, null, 2));
    await p.$disconnect();
    console.log('\n=== ALL FLOWS COMPLETE — see /home/z/my-project/download/phase91/ for evidence ===');
  }
})();
