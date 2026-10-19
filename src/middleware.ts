// middleware.ts
// Phase 7b.1 — security middleware.
// Phase 17.6 PATCH — switched to cookie-based double-submit CSRF pattern.
//
// Responsibilities:
//   1. Set security headers on every response
//   2. Set csrf_token cookie on EVERY response if missing (auto-refresh)
//   3. Enforce CSRF double-submit: header === cookie (no DB lookup needed)
//   4. CORS origin check for exempted auth endpoints
//
// Why cookie-based (Fix A):
//   - Cookie is always fresh — server re-sets on every response
//   - Works across multiple browser tabs (cookie is shared)
//   - Works across server restarts (server re-issues on next response)
//   - No localStorage staleness possible
//   - No DB lookup needed in middleware (faster)

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'",
};

const CSRF_EXEMPT_PATHS = new Set<string>([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/totp/setup",
  "/api/auth/totp/verify-setup",
  "/api/auth/totp/disable",
  "/api/auth/totp/regenerate-backup",
  // External webhook paths — called by Meta/Stripe, not browsers.
  // They use their own auth (signature verification, verify token) — no CSRF needed.
  "/api/webhooks/whatsapp",
  "/api/v1/payments/webhook",
  "/api/mock/whatsapp/webhook",
  "/api/mock/stripe/webhook",
  "/api/mock/smtp/send",
  "/api/mock/dld/transfer/register",
  "/api/mock/dld/ejari/register",
  "/api/mock/openai/v1/chat/completions",
  "/api/mock/hubspot/crm/v3/objects/contacts",
  "/api/mock/salesforce/services/data/v57.0/sobjects/Contact",
  "/api/mock/wio/virtual-ibans",
  "/api/seed",
  "/api/agent/referral/submit",
  "/api/cases/*/stream", // SSE heartbeat
]);

const ALLOWED_ORIGINS = new Set<string>([
  "http://localhost:3000",
  "https://localhost:3000",
]);

const CSRF_COOKIE_NAME = "csrf_token";

function isStateChanging(method: string): boolean {
  return method === "POST" || method === "PATCH" || method === "DELETE" || method === "PUT";
}

function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

// C4a — Zone-based role gate for RT workflow routes
// P5 FIX: Reads session_token COOKIE for page navigations (browsers don't send Bearer on GET)
//         AND Authorization Bearer header for API calls (fetch/XHR)
// The session token is an opaque string — looked up in the DB via getUserFromToken.
// Middleware runtime is "nodejs" so DB access is available.
const ZONE_ROLES: Record<string, string[]> = {
  "/rt":    ["RECEPTION_ADMIN", "TRUSTEE_OFFICER", "TRUSTEE_MANAGER", "ADMIN"],
  "/tabu":  ["TRUSTEE_MANAGER", "ADMIN"],  // auditor equivalent
  "/admin": ["ADMIN"],
};

function getZone(pathname: string): string | null {
  for (const zone of Object.keys(ZONE_ROLES)) {
    if (pathname.startsWith(zone)) return zone;
  }
  return null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method.toUpperCase();

  // Apply security headers to ALL responses
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(k, v);
  }

  // C4a — Zone-based role gate
  // P5 FIX: Read session_token cookie (for page nav) OR Bearer header (for API fetch)
  const zone = getZone(pathname);
  if (zone) {
    // Read token from cookie (page navigation) or Bearer header (API call)
    const cookieToken = req.cookies.get("session_token")?.value;
    const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "");
    const token = cookieToken ?? bearerToken;

    if (!token) {
      // API routes get 401 JSON; page routes get redirect to login
      const isApi = pathname.startsWith("/api/");
      if (isApi) {
        return new NextResponse(
          JSON.stringify({ ok: false, error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } }
        );
      }
      // Page route — redirect to login
      return NextResponse.redirect(new URL("/", req.url));
    }

    // Look up user from session token (DB lookup — runtime is nodejs)
    try {
      const { getUserFromToken } = await import("@/lib/auth");
      const user = await getUserFromToken(token);
      if (!user) {
        // P5 FIX: Clear the dead session_token cookie so the browser stops sending it.
        // Without this, the browser sends a dead cookie on every subsequent page nav
        // and the middleware keeps redirecting to login — but the cookie is never cleared.
        const isApi = pathname.startsWith("/api/");
        if (isApi) {
          const clearRes = new NextResponse(
            JSON.stringify({ ok: false, error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } }
          );
          clearRes.cookies.set("session_token", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
          return clearRes;
        }
        const redirectRes = NextResponse.redirect(new URL("/", req.url));
        redirectRes.cookies.set("session_token", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
        return redirectRes;
      }
      if (!ZONE_ROLES[zone].includes(user.role)) {
        await logSecurityEvent("ZONE_FORBIDDEN", pathname, `role ${user.role} denied zone ${zone}`, req);
        return new NextResponse(
          JSON.stringify({ ok: false, error: "Forbidden", message: `Zone ${zone} requires role: ${ZONE_ROLES[zone].join(" or ")}` }),
          { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } }
        );
      }
    } catch (e) {
      const isApi = pathname.startsWith("/api/");
      if (isApi) {
        return new NextResponse(
          JSON.stringify({ ok: false, error: "Auth check failed" }),
          { status: 500, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } }
        );
      }
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Phase 17.6 PATCH — Set csrf_token cookie on EVERY response if missing or stale.
  // This is the core of Fix A: the cookie is always fresh, auto-refreshed by the server.
  // httpOnly: false so client-side JS can read it (document.cookie).
  const existingCookie = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (!existingCookie) {
    const newToken = generateCsrfToken();
    res.cookies.set(CSRF_COOKIE_NAME, newToken, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  // CSRF enforcement only on state-changing API requests
  if (pathname.startsWith("/api/") && isStateChanging(method) && !CSRF_EXEMPT_PATHS.has(pathname)) {
    const csrfHeader = req.headers.get("x-csrf-token");
    const requestOrigin = req.headers.get("origin");
    const requestHost = req.headers.get("host");

    // Origin check
    if (requestOrigin && !ALLOWED_ORIGINS.has(requestOrigin) && !requestOrigin.endsWith(requestHost ?? "")) {
      await logSecurityEvent("CSRF_INVALID", pathname, "origin mismatch", req);
      return new NextResponse(
        JSON.stringify({ ok: false, error: "CSRF_INVALID", message: "Origin mismatch" }),
        { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } }
      );
    }

    // Phase 17.6 PATCH — Cookie-based double-submit:
    // Validate header === cookie. No DB lookup needed.
    const cookieToken = req.cookies.get(CSRF_COOKIE_NAME)?.value;

    // SECURITY: We do NOT skip CSRF for requests without a Bearer token.
    // Previously had a safety net `if (!bearer) return res` — that was safe with
    // Bearer-in-localStorage auth but would become a CSRF bypass after Phase 17.5
    // (Redis cookie sessions). Removed — all state-changing requests require
    // the cookie + header to match.
    //
    // External webhooks (Meta, Stripe, mock endpoints) are handled via the
    // explicit CSRF_EXEMPT_PATHS list above. New webhooks = 1-line addition.
    //
    // PHASE 17.5 PRE-REQUISITE: When sessions migrate to Redis cookies,
    // verify the CSRF middleware still rejects all non-exempt POSTs
    // (it does — cookie validation runs regardless of Bearer presence).

    if (!cookieToken) {
      // First request ever — cookie hasn't been set yet (set above, but this request
      // didn't have it). For state-changing requests, we require the cookie.
      // The client should retry after the cookie is set (the recovery interceptor handles this).
      await logSecurityEvent("CSRF_INVALID", pathname, "no csrf cookie — first request", req);
      return new NextResponse(
        JSON.stringify({ ok: false, error: "CSRF_INVALID", message: "CSRF cookie not yet set — retry" }),
        { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } }
      );
    }

    if (!csrfHeader || csrfHeader !== cookieToken) {
      // Part 12E CSRF Fix — diagnostic log to confirm root cause.
      // Shows header_value vs cookie_value at the moment the request was rejected.
      // If they DIFFER → the cookie read was the fix (SPA sent stale token from Zustand store)
      // If they MATCH → sameSite was the fix (browser wasn't sending the strict cookie)
      // If header is MISSING → fetch call forgot to include X-CSRF-Token
      const headerPrefix = csrfHeader ? `'${csrfHeader.substring(0, 8)}...'` : "MISSING";
      const cookiePrefix = cookieToken ? `'${cookieToken.substring(0, 8)}...'` : "MISSING";
      const matchOrNot = csrfHeader === cookieToken ? "MATCH (unexpected — should not reach here)" : "MISMATCH";
      console.warn(
        `[CSRF_INVALID] ${req.method} ${pathname} — header=${headerPrefix} cookie=${cookiePrefix} → ${matchOrNot}`,
      );
      await logSecurityEvent("CSRF_INVALID", pathname, `missing or mismatched X-CSRF-Token header (header=${headerPrefix}, cookie=${cookiePrefix})`, req);
      return new NextResponse(
        JSON.stringify({ ok: false, error: "CSRF_INVALID", message: "Missing or invalid X-CSRF-Token header" }),
        { status: 403, headers: { "Content-Type": "application/json", ...SECURITY_HEADERS } }
      );
    }
  }

  return res;
}

async function logSecurityEvent(action: string, path: string, reason: string, req: NextRequest) {
  try {
    const { logAudit } = await import("@/lib/audit");
    await logAudit({
      action,
      entity: "SecurityMiddleware",
      entityId: path,
      details: `${action} on ${req.method} ${path}: ${reason}. IP: ${req.headers.get("x-forwarded-for") ?? "unknown"}`,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
  } catch (e) {
    console.error("[SECURITY] Failed to log audit event:", e);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
