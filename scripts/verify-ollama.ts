// scripts/verify-ollama.ts
// Part 12C — Verify Ollama is running and which models are available.
// Run: npx tsx scripts/verify-ollama.ts
// Exits 0 if Ollama is running, 1 if not.

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

async function main() {
  console.log("=== Ollama Verification ===\n");
  console.log("Base URL:", OLLAMA_BASE);

  // Ping /api/tags
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.log(`✗ Ollama responded with HTTP ${res.status}`);
      process.exit(1);
    }

    const data = (await res.json()) as { models: { name: string; size: number }[] };
    const models = data.models ?? [];

    console.log(`✓ Ollama is running (${models.length} models available)\n`);

    const REQUIRED = ["qwen3:30b-a3b", "falcon-h1-arabic:7b"];
    const available = models.map((m) => m.name);

    for (const req of REQUIRED) {
      const found = available.find((a) => a.startsWith(req.split(":")[0]));
      if (found) {
        const size = models.find((m) => m.name === found)?.size;
        console.log(`  ✓ ${found} (${(size! / 1e9).toFixed(1)}GB)`);
      } else {
        console.log(`  ✗ ${req} — NOT FOUND`);
        console.log(`    Pull with: ollama pull ${req}`);
      }
    }

    // Check if the custom Arabic model is registered
    const arabicModel = available.find((a) => a.includes("falcon-h1") || a.includes("arabic"));
    if (arabicModel) {
      console.log(`\n  ✓ Arabic model available: ${arabicModel}`);
    } else {
      console.log(`\n  ⚠ No Arabic model found. To register Falcon-H1R Arabic:`);
      console.log(`    1. Download GGUF from huggingface.co/tiiuae/Falcon-H1R-7B-GGUF`);
      console.log(`    2. Create Modelfile and run: ollama create falcon-h1-arabic:7b -f Modelfile`);
    }

    console.log("\n=== Verification complete ===");
    process.exit(0);
  } catch (e: any) {
    if (e.code === "ECONNREFUSED" || e.name === "TimeoutError") {
      console.log("✗ Ollama is NOT running.");
      console.log("  Start with: ollama serve");
      console.log("  Then pull:  ollama pull qwen3:30b-a3b");
      console.log("\n  LLM extraction is disabled until Ollama is available.");
      console.log("  Documents will be chunked but rules will not be extracted.");
    } else {
      console.log("✗ Error:", e.message);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
