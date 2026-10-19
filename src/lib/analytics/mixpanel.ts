// src/lib/analytics/mixpanel.ts
// Part 7 / 7.1 — Server-side Mixpanel event emitter.
//
// Part 7 Review / Critical Gap 1: the `mixpanel` npm package is now a hard
// dependency (declared in package.json). In production, a missing
// MIXPANEL_TOKEN throws at boot — silent no-op emission was a false signal
// (tests passed because the spy was injected, but production would have zero
// events). In dev, a missing token logs a warning but the workflow proceeds.
//
// The canonical event keys are defined in the `mixpanel_event_map` DB table.
// `transition()` calls track() AFTER the workflow transaction commits — a
// mixpanel failure must never roll back a valid state change.
//
// Privacy: per the earlier Mixpanel privacy-validator work for DLD, the
// properties below are classified as pseudonymous under UAE PDPL:
//   - procedure_id  → case reference (not Emirates ID, not name, not address)
//   - actor_user_id → internal user ID (not email, not Emirates ID)
// No PII is emitted. Every event also carries `system_source: 'PORTAL'` so
// portal events can be distinguished from legacy RT/TABU events in the same
// Mixpanel project (or in a separate portal project).
//
// Dependency: `mixpanel` npm package (declared in package.json — no longer
// "lazy-loaded"). Boot-time fail-loud check throws if the package is missing
// OR if the token is missing in production.

// The mixpanel npm package uses CommonJS `export =` with a `mixpanel` namespace.
// Import the namespace as a value; we don't need the type (we use `any` for
// the client since the package's types don't expose a clean Mixpanel class).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MixpanelNS = require("mixpanel");

export interface TrackOptions {
  procedure_id: string;
  procedure_type?: string;
  transition_id?: string | null;
  actor_user_id?: string;
  actor_role?: string;
  admin_override?: boolean;
  effective_role?: string;
  from_state?: string;
  to_state?: string;
  reason?: string;
  // Attached by track() before dispatch — distinguishes portal events from
  // legacy RT/TABU events in the same Mixpanel project.
  system_source?: string;
  [key: string]: unknown;
}

// ── Boot-time fail-loud check (Critical Gap 1) ─────────────────────────────
//
// In production: if MIXPANEL_TOKEN is missing, THROW. The state machine tests
// pass with a spy, but production must not silently drop every event.
//
// In dev: log a warning, set client to null, the emitter logs dropped events
// at debug level so devs see them but the workflow still proceeds.
//
// The check runs at module load (first import). Node caches the module, so
// this only runs once per process.

const TOKEN = process.env.MIXPANEL_TOKEN;
const HOST = process.env.MIXPANEL_HOST ?? "api-eu.mixpanel.com";
const SYSTEM_SOURCE = "PORTAL";  // distinguishes from legacy RT/TABU events

let client: any;

if (!TOKEN) {
  if (process.env.NODE_ENV === "production") {
    // Critical Gap 1 — fail-loud. Don't let the app boot in production
    // without a token, or every transition silently drops its event.
    throw new Error(
      "[mixpanel] MIXPANEL_TOKEN is required in production. " +
      "Set it in your environment before starting the server. " +
      "Without it, every workflow transition silently drops its Mixpanel event."
    );
  }
  // Dev: warn but proceed
  console.warn(
    "[mixpanel] no MIXPANEL_TOKEN in dev — events will be dropped. " +
    "Set MIXPANEL_TOKEN in .env.local to test live emission."
  );
  client = null;
} else {
  try {
    client = MixpanelNS.init(TOKEN, { host: HOST });
    console.info(`[mixpanel] client initialized (host=${HOST}, source=${SYSTEM_SOURCE})`);
  } catch (e: any) {
    // This shouldn't happen — the SDK is installed as a hard dependency.
    // But if init fails (network, bad token format), we surface it loudly.
    if (process.env.NODE_ENV === "production") {
      throw new Error(`[mixpanel] client init failed: ${e.message}`);
    }
    console.error("[mixpanel] client init failed:", e.message);
    client = null;
  }
}

// Swappable transport — tests can replace this to spy on emissions.
// Default delegates to the real _track function. Production code calls
// `track()` which dispatches through this transport.
type TrackHandler = (eventKey: string, props: TrackOptions) => void;
let _transport: TrackHandler = (eventKey, props) => _trackImpl(eventKey, props);

// The actual implementation — looks up the client and fires the event.
function _trackImpl(eventKey: string, props: TrackOptions): void {
  if (!client) {
    // No client (dev-only path; production would have thrown at boot).
    // Log so dropped events are visible in dev.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[mixpanel] no client — event dropped: ${eventKey}`);
    }
    return;
  }

  try {
    // Fire-and-forget — do not block the workflow transaction on analytics.
    // distinct_id is the actor (or "system" for automated transitions).
    // time is in seconds (Mixpanel expects unix epoch seconds, not ms).
    // system_source is already in props (added by track()).
    client.track(eventKey, {
      distinct_id: props.actor_user_id ?? "system",
      time: Math.floor(Date.now() / 1000),
      ...props,
    });
  } catch (err) {
    // Never let a mixpanel emit failure crash the workflow
    console.error("[mixpanel] track failed:", err);
  }
}

/**
 * Emit a Mixpanel event. Fire-and-forget — never throws to the caller.
 *
 * The `system_source: 'PORTAL'` property is attached HERE (in track()) rather
 * than in _trackImpl() so it's always present on the props object — even
 * when tests install a spy that bypasses the real implementation. This
 * lets the production-spec test verify the property is set without
 * actually firing events to Mixpanel.
 *
 * @param eventKey - canonical snake_case key from MixpanelEventMap (e.g. "procedure_submitted_to_tabu")
 * @param props    - event properties (see TrackOptions)
 */
export function track(eventKey: string, props: TrackOptions): void {
  // Attach system_source BEFORE dispatching through the transport, so spies
  // see the same props that the real Mixpanel client would receive.
  const propsWithSource: TrackOptions = {
    ...props,
    system_source: SYSTEM_SOURCE,
  };
  // Dispatch through the swappable transport. Production: this is _trackImpl.
  // Tests: tests swap this via __setTransportForTests() to a spy.
  _transport(eventKey, propsWithSource);
}

/**
 * Test helper — replace the transport with a spy. Tests use this to capture
 * every call to track() so they can assert on the args (event key, props).
 * Restore with __restoreTransport() at the end of the test suite.
 *
 * Only available in non-production environments.
 */
export function __setTransportForTests(spy: TrackHandler): void {
  if (process.env.NODE_ENV === "production") return;
  _transport = spy;
}

export function __restoreTransport(): void {
  _transport = (eventKey, props) => _trackImpl(eventKey, props);
}

/**
 * Test helper — verify the SDK is importable. Used by
 * tests/workflow/mixpanel-production.spec.ts to prove the package is
 * actually installed (Critical Gap 1 verification).
 *
 * Returns true if the mixpanel package resolves at runtime.
 */
export function __isSdkInstalled(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require("mixpanel");
    return typeof m?.init === "function";
  } catch {
    return false;
  }
}

/**
 * Read-only accessor for the configured system_source. Used by tests to
 * verify the property is set on every emitted event.
 */
export function __getSystemSource(): string {
  return SYSTEM_SOURCE;
}
