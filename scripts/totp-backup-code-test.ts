// scripts/totp-backup-code-test.ts
// Tests Phase 7b.1 TOTP backup code behavior:
//   1. Setup TOTP for Officer → get 10 backup codes
//   2. Verify-setup with TOTP code → enable TOTP
//   3. Login with backup code #1 → should succeed
//   4. Login with backup code #1 again → should be rejected (single-use)
//   5. Login with backup code #2 → should succeed
//   6. Regenerate backup codes → original codes #3-#10 should be invalidated
//   7. Login with backup code #3 → should be rejected (old code)

import { db } from "@/lib/db";
import { authenticator } from "otplib";

const BASE = "http://localhost:3000";

async function api(path: string, method: string, body: any, token?: string, csrf?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function login(email: string, password: string, opts?: { mfaCode?: string; backupCode?: string }) {
  const body: any = { email, password };
  if (opts?.mfaCode) body.mfaCode = opts.mfaCode;
  if (opts?.backupCode) body.backupCode = opts.backupCode;
  return api("/api/auth/login", "POST", body);
}

async function main() {
  console.log("=== Phase 7b.1 — TOTP backup code reuse test ===");
  console.log("");

  // Step 1: Disable existing TOTP first (if enabled from previous test)
  console.log("Step 1: Disable existing TOTP for Officer (if any)...");
  const loginResp = await login("officer@trustee.ae", "trustee123");
  if (loginResp.body.mfaRequired) {
    // Need to use a real TOTP code to disable — but we don't have the secret
    // For test purposes, let me directly reset TOTP via DB
    await db.user.update({
      where: { email: "officer@trustee.ae" },
      data: {
        totpEnabled: false,
        totpSecret: null,
        totpBackupCodes: null,
        totpSetupAt: null,
      },
    });
    await db.session.deleteMany({ where: { userId: (await db.user.findUnique({ where: { email: "officer@trustee.ae" } }))!.id } });
    console.log("  ✅ TOTP disabled via DB reset (test setup)");
  } else {
    console.log("  ✅ TOTP not enabled");
  }

  // Login fresh (no rate limit since last login succeeded)
  console.log("");
  console.log("Step 2: Login as Officer → get fresh session token + CSRF...");
  const freshLogin = await login("officer@trustee.ae", "trustee123");
  if (!freshLogin.body.ok) {
    console.error("Fresh login failed:", freshLogin.body);
    process.exit(1);
  }
  const token = freshLogin.body.token;
  const csrf = freshLogin.body.csrfToken;
  console.log("  ✅ Login OK. Token:", token.substring(0, 30) + "...");

  // Step 3: TOTP setup → get secret + 10 backup codes
  console.log("");
  console.log("Step 3: TOTP setup (POST /api/auth/totp/setup)...");
  const setupResp = await api("/api/auth/totp/setup", "POST", {}, token, csrf);
  if (!setupResp.body.ok) {
    console.error("Setup failed:", setupResp.body);
    process.exit(1);
  }
  const secret = setupResp.body.secret;
  const backupCodes = setupResp.body.backupCodes as string[];
  console.log("  ✅ Setup returned secret +", backupCodes.length, "backup codes");
  console.log("  Backup codes:", backupCodes.join(", "));

  // Step 4: Verify-setup with TOTP code → enable TOTP
  console.log("");
  console.log("Step 4: Verify-setup with current TOTP code → enable...");
  const code = authenticator.generate(secret);
  console.log("  Generated TOTP code:", code);
  const verifyResp = await api("/api/auth/totp/verify-setup", "POST", { code }, token, csrf);
  console.log("  Verify-setup status:", verifyResp.status, "OK:", verifyResp.body.ok);
  if (!verifyResp.body.ok) {
    console.error("  ❌ Verify-setup failed:", verifyResp.body);
    process.exit(1);
  }
  console.log("  ✅ TOTP enabled. Other sessions destroyed — re-login required.");

  // Step 5: Try login with backup code #1 → should succeed
  console.log("");
  console.log("Step 5: Login with backup code #1:", backupCodes[0], "→ should succeed");
  const bc1Login = await login("officer@trustee.ae", "trustee123", { backupCode: backupCodes[0] });
  console.log("  Status:", bc1Login.status, "OK:", bc1Login.body.ok);
  if (bc1Login.body.ok) {
    console.log("  ✅ Backup code #1 succeeded");
  } else {
    console.error("  ❌ Backup code #1 failed:", bc1Login.body.error);
    process.exit(1);
  }

  // Step 6: Try login with backup code #1 again → should be REJECTED (single-use)
  console.log("");
  console.log("Step 6: Login with backup code #1 AGAIN → should be REJECTED (single-use)");
  const bc1Again = await login("officer@trustee.ae", "trustee123", { backupCode: backupCodes[0] });
  console.log("  Status:", bc1Again.status, "OK:", bc1Again.body.ok);
  if (bc1Again.body.ok) {
    console.error("  ❌ Backup code #1 was reused — single-use enforcement broken!");
    process.exit(1);
  } else {
    console.log("  ✅ Backup code #1 rejected on reuse — single-use enforcement works");
    console.log("  Error:", bc1Again.body.error);
  }

  // Step 7: Try login with backup code #2 → should still succeed
  console.log("");
  console.log("Step 7: Login with backup code #2:", backupCodes[1], "→ should succeed");
  const bc2Login = await login("officer@trustee.ae", "trustee123", { backupCode: backupCodes[1] });
  console.log("  Status:", bc2Login.status, "OK:", bc2Login.body.ok);
  if (bc2Login.body.ok) {
    console.log("  ✅ Backup code #2 succeeded (other unused codes still valid)");
  } else {
    console.error("  ❌ Backup code #2 failed:", bc2Login.body.error);
    process.exit(1);
  }

  // Step 8: Regenerate backup codes (need fresh login first, since the previous session was destroyed by TOTP enable)
  console.log("");
  console.log("Step 8: Regenerate backup codes via TOTP code...");
  const freshLogin2 = await login("officer@trustee.ae", "trustee123", { backupCode: backupCodes[2] });
  if (!freshLogin2.body.ok) {
    console.error("Login failed:", freshLogin2.body);
    process.exit(1);
  }
  const token2 = freshLogin2.body.token;
  const csrf2 = freshLogin2.body.csrfToken;
  const regenCode = authenticator.generate(secret);
  console.log("  Generated TOTP code for regen:", regenCode);
  const regenResp = await api("/api/auth/totp/regenerate-backup", "POST", { code: regenCode }, token2, csrf2);
  console.log("  Regen status:", regenResp.status, "OK:", regenResp.body.ok);
  if (!regenResp.body.ok) {
    console.error("  ❌ Regen failed:", regenResp.body);
    process.exit(1);
  }
  const newBackupCodes = regenResp.body.backupCodes as string[];
  console.log("  ✅ Regenerated. New backup codes:", newBackupCodes.join(", "));

  // Step 9: Try to login with old backup code #4 → should be REJECTED (invalidated by regen)
  console.log("");
  console.log("Step 9: Login with old backup code #4:", backupCodes[3], "→ should be REJECTED (invalidated)");
  const oldCodeLogin = await login("officer@trustee.ae", "trustee123", { backupCode: backupCodes[3] });
  console.log("  Status:", oldCodeLogin.status, "OK:", oldCodeLogin.body.ok);
  if (oldCodeLogin.body.ok) {
    console.error("  ❌ Old backup code #4 succeeded — invalidation broken!");
    process.exit(1);
  } else {
    console.log("  ✅ Old backup code #4 rejected — regeneration invalidates previous codes");
    console.log("  Error:", oldCodeLogin.body.error);
  }

  // Step 10: Try to login with new backup code #1 → should succeed
  console.log("");
  console.log("Step 10: Login with NEW backup code #1:", newBackupCodes[0], "→ should succeed");
  const newBc1 = await login("officer@trustee.ae", "trustee123", { backupCode: newBackupCodes[0] });
  console.log("  Status:", newBc1.status, "OK:", newBc1.body.ok);
  if (newBc1.body.ok) {
    console.log("  ✅ New backup code succeeded");
  } else {
    console.error("  ❌ New backup code failed:", newBc1.body.error);
    process.exit(1);
  }

  console.log("");
  console.log("=== Test summary ===");
  console.log("  ✅ Backup code #1 first use: succeeds");
  console.log("  ✅ Backup code #1 reuse: rejected (single-use enforced)");
  console.log("  ✅ Backup code #2 first use: succeeds (other codes still valid)");
  console.log("  ✅ Regenerate via TOTP code: succeeds, returns 10 new codes");
  console.log("  ✅ Old code after regen: rejected (invalidated)");
  console.log("  ✅ New code after regen: succeeds");

  // Cleanup: disable TOTP for next test run
  console.log("");
  console.log("Cleaning up: disabling TOTP for Officer...");
  // Login fresh, then disable via TOTP code
  const freshLogin3 = await login("officer@trustee.ae", "trustee123", { backupCode: newBackupCodes[1] });
  if (freshLogin3.body.ok) {
    const code3 = authenticator.generate(secret);
    await api("/api/auth/totp/disable", "POST", { code: code3 }, freshLogin3.body.token, freshLogin3.body.csrfToken);
    console.log("  ✅ TOTP disabled");
  }

  await db.$disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
