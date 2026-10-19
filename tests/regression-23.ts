// tests/regression-23.ts
// Part 7 Review / Critical Gap 4 — Refactored to run WITHOUT a live dev server.
//
// Original scripts/regression-23.js used `fetch('http://localhost:3000/...')`
// which required a `npm run dev` to be running. That doesn't run in CI and
// was an architectural smell (the "23/23 OK" claim was only verifiable when
// someone happened to have a dev server up).
//
// New approach (Option A from the review): call the route handlers directly
// as async functions. We dynamically import each route module, construct a
// minimal NextRequest-like object, and invoke the GET function. No HTTP
// layer, no port conflicts, no server spawn.
//
// Run: npx tsx tests/regression-23.ts
// Exit 0 = all 23 endpoints returned 200 OK
// Exit 1 = at least one returned non-200

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

let testsPassed = 0;
let testsFailed = 0;

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } else {
    testsFailed++;
    console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

// ── Minimal NextRequest-like object ──────────────────────────────────────
// Next.js route handlers (GET, POST, etc.) accept a `NextRequest` (which
// extends `Request`) and an optional `{ params }` for dynamic routes. We
// construct just enough of the API to satisfy the handlers we test:
//   - .headers.get()  for auth + CSRF
//   - .nextUrl.searchParams  for query strings
//   - .cookies.get()  for session_token
//   - .json()  for POST bodies (none in this regression — all GETs)
interface MinReq {
  method: string;
  url: string;
  headers: Headers;
  nextUrl: URL;
  cookies: { get: (name: string) => { value: string } | undefined };
  json: () => Promise<any>;
}

function makeReq(method: string, path: string, token: string, csrf: string): MinReq {
  const url = new URL(path, "http://localhost:3000");
  const headers = new Headers({
    "Content-Type": "application/json",
  });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (csrf) headers.set("X-CSRF-Token", csrf);
  return {
    method,
    url: url.toString(),
    headers,
    nextUrl: url,
    cookies: { get: () => undefined },
    json: async () => ({}),
  };
}

// ── Helper: dynamically import a route module and call its GET handler ──
async function callRoute(
  modulePath: string,
  method: string,
  path: string,
  token: string,
  csrf: string,
  params?: Record<string, string>,
): Promise<number> {
  try {
    const mod = await import(modulePath);
    const handler = mod[method];
    if (typeof handler !== "function") {
      console.error(`    ✗ ${modulePath} has no ${method} export`);
      return 0;
    }
    const req = makeReq(method, path, token, csrf);
    // Most route handlers accept (req, { params }) — params is a Promise in
    // Next.js 15+. We resolve it immediately if provided.
    const ctx = params ? { params: Promise.resolve(params) } : { params: Promise.resolve({}) };
    const res = await handler(req, ctx);
    return res.status;
  } catch (e: any) {
    console.error(`    ✗ callRoute error for ${modulePath}: ${e.message}`);
    return 0;
  }
}

async function main() {
  console.log("=== Regression 23 endpoints — direct route handler invocation ===\n");

  // ── Login: call the login route handler directly ──
  console.log("Logging in as admin...");
  const loginMod = await import("../src/app/api/auth/login/route");
  const loginReq = makeReq("POST", "/api/auth/login", "", "");
  // Override json() to return the login body
  (loginReq as any).json = async () => ({ email: "admin@trustee.ae", password: "trustee123" });
  const loginRes = await loginMod.POST(loginReq, { params: Promise.resolve({}) });
  if (loginRes.status !== 200) {
    console.error(`Login failed: HTTP ${loginRes.status}`);
    process.exit(1);
  }
  const loginBody = await loginRes.json();
  const token: string = loginBody.token;
  const csrf: string = loginBody.csrfToken;
  console.log(`  ✓ Logged in. token=${token.substring(0, 12)}... csrf=${csrf.substring(0, 8)}...\n`);

  // ── Resolve first case ID ──
  console.log("Resolving first case ID...");
  const casesMod = await import("../src/app/api/cases/route");
  const casesReq = makeReq("GET", "/api/cases?take=1", token, csrf);
  const casesRes = await casesMod.GET(casesReq, { params: Promise.resolve({}) });
  const casesBody = await casesRes.json();
  let caseId = "";
  let caseRef = "";
  if (casesBody.ok && Array.isArray(casesBody.cases) && casesBody.cases.length > 0) {
    caseId = casesBody.cases[0].id;
    caseRef = casesBody.cases[0].caseRef;
  }
  if (!caseId) {
    console.error("Failed to resolve first case ID — aborting");
    process.exit(1);
  }
  console.log(`  ✓ Using caseId=${caseId}, caseRef=${caseRef}\n`);

  // ── Run 23 endpoint tests ──
  // Each entry: [name, modulePath, method, path, params?]
  const tests: [string, string, string, string, Record<string, string> | undefined][] = [
    ["Phase 3.1 — Handover",      "../src/app/api/cases/[id]/handover/route",     "GET", `/api/cases/${caseId}/handover`,      { id: caseId }],
    ["Phase 4 — Fees",            "../src/app/api/cases/[id]/fees/route",          "GET", `/api/cases/${caseId}/fees`,           { id: caseId }],
    ["Phase 5 — DLD",             "../src/app/api/cases/[id]/dld/route",          "GET", `/api/cases/${caseId}/dld`,            { id: caseId }],
    ["Phase 5 — Messages",        "../src/app/api/cases/[id]/messages/route",      "GET", `/api/cases/${caseId}/messages`,       { id: caseId }],
    ["Phase 6 — AI",              "../src/app/api/cases/[id]/ai/route",            "GET", `/api/cases/${caseId}/ai`,             { id: caseId }],
    ["Phase 7a — Activity",       "../src/app/api/cases/[id]/activity/route",      "GET", `/api/cases/${caseId}/activity`,       { id: caseId }],
    ["Phase 7a — Workflows",      "../src/app/api/workflows/route",                "GET", `/api/workflows`,                     undefined],
    ["Phase 7a — Locks",          "../src/app/api/cases/[id]/locks/route",         "GET", `/api/cases/${caseId}/locks`,          { id: caseId }],
    ["Phase 7a — Conflicts",      "../src/app/api/cases/[id]/conflicts/route",     "GET", `/api/cases/${caseId}/conflicts`,      { id: caseId }],
    ["Phase 7b.1 — Backup",       "../src/app/api/admin/backup/route",             "GET", `/api/admin/backup`,                  undefined],
    ["Phase 7b.1 — Dashboard",    "../src/app/api/dashboard/route",               "GET", `/api/dashboard`,                     undefined],
    ["Phase 7b.1 — Finance",      "../src/app/api/finance/summary/route",          "GET", `/api/finance/summary`,               undefined],
    ["Phase 7b.2 — Health",       "../src/app/api/health/route",                  "GET", `/api/health`,                        undefined],
    ["Phase 7b.2 — Analytics",    "../src/app/api/analytics/route",                "GET", `/api/analytics`,                     undefined],
    ["Phase 7b.2 — Preflight",    "../src/app/api/preflight/route",               "GET", `/api/preflight`,                     undefined],
    ["Phase 7b.2 — Privacy",      "../src/app/api/privacy-policy/route",          "GET", `/api/privacy-policy`,                undefined],
    ["Phase 8 — WhatsApp convs",  "../src/app/api/whatsapp/conversations/route",  "GET", `/api/whatsapp/conversations`,        undefined],
    ["Phase 9 — Automations",     "../src/app/api/whatsapp/automations/route",     "GET", `/api/whatsapp/automations`,           undefined],
    ["Phase 9 — Routing",         "../src/app/api/whatsapp/routing/route",        "GET", `/api/whatsapp/routing`,              undefined],
    ["Phase 9 — Appt slots",      "../src/app/api/appointments/slots/route",       "GET", `/api/appointments/slots`,            undefined],
    ["Phase 9 — Secure Links",    "../src/app/api/cases/[id]/secure-links/route", "GET", `/api/cases/${caseId}/secure-links`,   { id: caseId }],
    ["Phase 9 — Templates",       "../src/app/api/whatsapp/templates/route",     "GET", `/api/whatsapp/templates`,            undefined],
    ["Phase 10 — Reports KPIs",   "../src/app/api/reports/kpis/route",            "GET", `/api/reports/kpis`,                  undefined],
  ];

  console.log(`Running ${tests.length} endpoint tests:\n`);
  for (const [name, modulePath, method, path, params] of tests) {
    const status = await callRoute(modulePath, method, path, token, csrf, params);
    const pathDisplay = path.length > 60 ? path.substring(0, 57) + "..." : path;
    assert(`${name.padEnd(28)} ${status} | ${pathDisplay}`, status === 200, `got ${status}`);
  }

  // ── Cleanup: kill the test session ──
  await db.session.deleteMany({ where: { token } }).catch(() => {});

  console.log(`\n=== Results: ${testsPassed}/${tests.length} passed, ${testsFailed} failed ===`);
  await db.$disconnect();
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
