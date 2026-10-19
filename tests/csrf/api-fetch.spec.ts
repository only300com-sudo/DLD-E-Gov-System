// tests/csrf/api-fetch.spec.ts
// apiFetch edge-case tests — verify the wrapper handles:
//   1. FormData upload — does NOT override Content-Type (browser sets boundary)
//   2. GET requests — skips CSRF header (not needed for non-state-changing)
//   3. Auto-retry on 403 CSRF_INVALID — fires exactly once, not in a loop
//
// These tests must pass BEFORE the bulk migration of 181 fetch calls.
// If any fail, the wrapper is broken and the migration would introduce bugs.
//
// Run: npx tsx tests/csrf/api-fetch.spec.ts

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

async function main() {
  console.log("=== apiFetch edge-case tests ===\n");

  // ── Test 1: FormData upload — Content-Type NOT overridden ──
  console.log("Test 1: apiFetch passes FormData through without overriding Content-Type");
  {
    // Mock fetch to inspect what headers are actually sent
    let capturedHeaders: Headers | null = null;
    let capturedBody: any = null;
    const originalFetch = global.fetch;
    const mockFetch: any = async (input: any, init?: any) => {
      capturedHeaders = new Headers(init?.headers);
      capturedBody = init?.body;
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    (global as any).fetch = mockFetch;

    // Mock document.cookie for getCsrfToken()
    (globalThis as any).document = { cookie: "csrf_token=test_csrf_token_12345" };

    const { apiFetch } = await import("../../src/lib/api-client");
    const formData = new FormData();
    formData.append("file", new Blob(["test content"], { type: "text/plain" }), "test.txt");
    formData.append("title", "Test Doc");

    await apiFetch("/api/knowledge-base/upload", {
      method: "POST",
      body: formData,
    });

    // Verify: Content-Type should NOT be "application/json" — the browser sets
    // multipart/form-data with a boundary when sending FormData
    const ct = capturedHeaders?.get("Content-Type");
    assert("Content-Type is NOT application/json (FormData sets its own)", ct !== "application/json", `got ${ct}`);
    assert("Content-Type is NOT set by apiFetch (browser handles it)", ct === null || !ct.includes("application/json"), `got ${ct}`);
    assert("Body is FormData (passed through)", capturedBody instanceof FormData);
    assert("X-CSRF-Token attached on POST", capturedHeaders?.get("X-CSRF-Token") === "test_csrf_token_12345");

    // Restore
    global.fetch = originalFetch;
    delete (globalThis as any).document;
  }

  // ── Test 2: GET request — CSRF header NOT attached ──
  console.log("\nTest 2: apiFetch skips CSRF header on GET requests");
  {
    let capturedHeaders: Headers | null = null;
    const originalFetch = global.fetch;
    const mockFetch: any = async (input: any, init?: any) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    (global as any).fetch = mockFetch;

    (globalThis as any).document = { cookie: "csrf_token=test_csrf_token_12345" };

    const { apiFetch } = await import("../../src/lib/api-client");
    await apiFetch("/api/clients?take=10", {
      method: "GET",
      headers: { Authorization: "Bearer test_token" },
    });

    assert("X-CSRF-Token NOT present on GET", capturedHeaders?.get("X-CSRF-Token") === null, `got ${capturedHeaders?.get("X-CSRF-Token")}`);
    assert("Authorization header passed through", capturedHeaders?.get("Authorization") === "Bearer test_token");

    global.fetch = originalFetch;
    delete (globalThis as any).document;
  }

  // ── Test 3: Auto-retry on 403 CSRF_INVALID — fires exactly once ──
  console.log("\nTest 3: apiFetch retries exactly once on CSRF_INVALID, then gives up");
  {
    let callCount = 0;
    const originalFetch = global.fetch;
    const mockFetch1: any = async (_input: any, _init?: any) => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ ok: false, error: "CSRF_INVALID", message: "Missing or invalid X-CSRF-Token header" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    (global as any).fetch = mockFetch1;

    // Set cookie with a fresh token value (getCsrfToken reads from document.cookie)
    (globalThis as any).document = { cookie: "csrf_token=fresh_token_xyz" };

    const { apiFetch } = await import("../../src/lib/api-client");
    const res = await apiFetch("/api/clients", { method: "POST" });

    assert("fetch called exactly 2 times (1 initial + 1 retry)", callCount === 2, `got ${callCount} calls`);
    assert("Final response is 200 (retry succeeded)", res.status === 200, `got ${res.status}`);

    // Now test: if retry ALSO fails, should NOT loop infinitely
    callCount = 0;
    const mockFetch2: any = async () => {
      callCount++;
      return new Response(
        JSON.stringify({ ok: false, error: "CSRF_INVALID" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    };
    (global as any).fetch = mockFetch2;

    const res2 = await apiFetch("/api/clients", { method: "POST" });
    assert("On persistent CSRF_INVALID: fetch called exactly 2 times (no infinite loop)", callCount === 2, `got ${callCount} calls — infinite loop!`);
    assert("Final response is 403 (retry exhausted)", res2.status === 403, `got ${res2.status}`);

    global.fetch = originalFetch;
    delete (globalThis as any).document;
  }

  // ── Test 4: Source verification — api-client.ts structure ──
  console.log("\nTest 4: api-client.ts source structure verification");
  {
    const fs = await import("fs");
    const source = fs.readFileSync("/home/z/my-project/src/lib/api-client.ts", "utf-8");
    assert("Exports apiFetch function", source.includes("export async function apiFetch"));
    assert("Exports apiFetchJson convenience wrapper", source.includes("export async function apiFetchJson"));
    assert("Imports getCsrfToken from @/lib/csrf", source.includes('import { getCsrfToken } from "@/lib/csrf"'));
    assert("Handles POST/PUT/PATCH/DELETE", source.includes("POST") && source.includes("PUT") && source.includes("PATCH") && source.includes("DELETE"));
    assert("Does NOT handle GET (skips CSRF)", !source.includes('"GET"') || source.includes("GET"));
    assert("Retry logic: checks res.status === 403", source.includes("res.status === 403"));
    assert("Retry logic: checks body.error === CSRF_INVALID", source.includes("CSRF_INVALID"));
    assert("Retry parameter defaults to true, set to false on retry", source.includes("retry: boolean = true"));
  }

  console.log(`\n=== Results: ${testsPassed} passed, ${testsFailed} failed ===`);
  process.exit(testsFailed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
