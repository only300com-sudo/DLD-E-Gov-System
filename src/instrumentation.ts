// src/instrumentation.ts
// Next.js instrumentation hook — runs once on server boot.
//
// Memory fix: in dev mode (NODE_ENV !== 'production'), only essential boot
// tasks run. Heavy schedulers (snapshot, stall detection, retention, backup,
// replica, email digest, payment expiry) are deferred to production to avoid
// OOM kills in sandbox environments. The sandbox caps memory at ~2GB; the
// snapshot scheduler alone computes 8 dashboard caches on boot, consuming
// ~500MB+ before the HTTP port is ready.
//
// Triggers (production only unless marked ESSENTIAL):
//   1. ESSENTIAL: Catalog → ServiceWorkflow migration (idempotent)
//   2. ESSENTIAL: Startup integrity check (PRAGMA, orphan FK, WAL checkpoint)
//   3. ESSENTIAL: RT Workflow state engine init
//   4. PROD-ONLY: Backup scheduler (daily at 02:00 UTC)
//   5. PROD-ONLY: WAL checkpoint scheduler (every 15 min)
//   6. PROD-ONLY: Retention + DSR SLA scheduler
//   7. PROD-ONLY: Snapshot scheduler (every 5 min — heavy on boot)
//   8. PROD-ONLY: Scheduled report runner
//   9. PROD-ONLY: Document expiry alert scheduler
//  10. PROD-ONLY: Reporting replica scheduler (nightly VACUUM)
//  11. PROD-ONLY: Email digest scheduler
//  12. PROD-ONLY: Payment link expiry scheduler
//  13. PROD-ONLY: Stall detection scheduler (heavy on boot)

const IS_DEV = process.env.NODE_ENV !== "production";
const SKIP_HEAVY = IS_DEV || process.env.SKIP_HEAVY_SCHEDULERS === "true";

export async function register() {
  // Only run on the server (Node runtime). Skip on Edge.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    // Defer to a tick so we don't block the boot too aggressively
    setTimeout(async () => {
      // ── ESSENTIAL (run in dev + prod) ──────────────────────────────

      try {
        const { migrateCatalogToWorkflows } = await import("@/lib/workflow/catalogMigration");
        const result = await migrateCatalogToWorkflows();
        console.info(`[BOOT] Catalog→Workflow migration: ${result.created} created, ${result.updated} updated, ${result.skipped} unchanged, ${result.failed} failed.`);
      } catch (e) {
        console.error("[BOOT] Workflow migration failed:", e);
      }

      // Phase 7b.1 — startup integrity check (warnings only — does not block boot)
      try {
        const { runStartupIntegrityCheck } = await import("@/lib/security/startupIntegrity");
        const report = await runStartupIntegrityCheck();
        console.info(`[BOOT] Startup integrity: PRAGMA=${report.pragmaIntegrityCheck}, WAL=${report.walCheckpoint}, warnings=${report.warnings.length}, errors=${report.errors.length}`);
        if (report.startupBlocked) {
          console.error("[BOOT] Startup BLOCKED by integrity check errors:", report.errors);
        }
      } catch (e) {
        console.error("[BOOT] Startup integrity check failed to run:", e);
      }

      // Phase 15.1 — seed default integrations (idempotent — lightweight)
      try {
        const { seedDefaultIntegrations } = await import("@/lib/services/integrations/seed");
        await seedDefaultIntegrations();
      } catch (e) {
        console.error("[BOOT] Failed to seed default integrations:", e);
      }

      // Phase A — RT Workflow state engine (fail-closed if table unreachable)
      try {
        const { initStateEngine } = await import("@/lib/workflow/rt/stateEngine");
        await initStateEngine();
      } catch (e) {
        console.error("[BOOT] RT workflow state engine failed to initialize:", e);
      }

      // ── DEV MODE: skip heavy schedulers to avoid OOM kills ────────
      if (SKIP_HEAVY) {
        console.info("[BOOT] Dev mode — skipping heavy schedulers (snapshot, stall, retention, backup, replica, email, payment) to avoid sandbox OOM.");
        return;
      }

      // ── PRODUCTION-ONLY SCHEDULERS ─────────────────────────────────

      // Phase 7b.1 — start backup scheduler
      try {
        const { startBackupScheduler } = await import("@/lib/backup/scheduler");
        startBackupScheduler();
      } catch (e) {
        console.error("[BOOT] Failed to start backup scheduler:", e);
      }

      // Phase 7b.1 — start WAL checkpoint scheduler (every 15 min)
      try {
        const { startWalCheckpointScheduler } = await import("@/lib/security/walScheduler");
        startWalCheckpointScheduler();
      } catch (e) {
        console.error("[BOOT] Failed to start WAL checkpoint scheduler:", e);
      }

      // Phase 7b.2 — start retention + DSR SLA scheduler (daily 03:00 UTC + hourly DSR)
      try {
        const { startRetentionScheduler } = await import("@/lib/retention/scheduler");
        startRetentionScheduler();
      } catch (e) {
        console.error("[BOOT] Failed to start retention scheduler:", e);
      }

      // Phase 10 — start snapshot scheduler (every 5 minutes, refreshes 8 dashboard caches)
      try {
        const { startSnapshotScheduler } = await import("@/lib/reporting/snapshotScheduler");
        startSnapshotScheduler();
      } catch (e) {
        console.error("[BOOT] Failed to start snapshot scheduler:", e);
      }

      // Phase 10 — start scheduled report runner (checks every minute for due scheduled reports)
      try {
        const { startScheduledReportRunner } = await import("@/lib/reporting/scheduledReports");
        startScheduledReportRunner();
      } catch (e) {
        console.error("[BOOT] Failed to start scheduled report runner:", e);
      }

      // Phase 11 Extension A — start document expiry alert scheduler (daily at boot + 24h)
      try {
        const { startExpiryAlertScheduler } = await import("@/lib/services/ai/extensions/expiryAlerts");
        startExpiryAlertScheduler();
      } catch (e) {
        console.error("[BOOT] Failed to start expiry alert scheduler:", e);
      }

      // Phase 12 — start reporting replica scheduler (nightly VACUUM INTO at 01:00 UTC)
      try {
        const { startReplicaScheduler } = await import("@/lib/reporting/replica");
        startReplicaScheduler();
      } catch (e) {
        console.error("[BOOT] Failed to start replica scheduler:", e);
      }

      // Phase 12 — start email digest scheduler (13:00 + 17:00 Dubai time)
      try {
        const { startEmailDigestScheduler } = await import("@/lib/services/notification/emailDigest");
        startEmailDigestScheduler();
      } catch (e) {
        console.error("[BOOT] Failed to start email digest scheduler:", e);
      }

      // Phase 14 — start payment link expiry scheduler (every 60s).
      try {
        const { startPaymentExpiryScheduler } = await import("@/lib/services/finance/paymentExpiryScheduler");
        startPaymentExpiryScheduler();
      } catch (e) {
        console.error("[BOOT] Failed to start payment expiry scheduler:", e);
      }

      // Phase 17.6.2 — start stall detection scheduler (daily 06:00 Asia/Dubai + boot run)
      try {
        const { startStallDetectionScheduler } = await import("@/lib/services/stall/scheduler");
        startStallDetectionScheduler();
      } catch (e) {
        console.error("[BOOT] Failed to start stall detection scheduler:", e);
      }
    }, 2000);
  } catch (e) {
    console.error("[BOOT] Instrumentation error:", e);
  }
}
