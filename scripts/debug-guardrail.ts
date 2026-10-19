import { applyGuardrails } from "../src/lib/services/ai/guardrails";

const tests = [
  "Your case is approved. Congratulations!",
  "تمت الموافقة على طلبك. مبروك!",
  "Please share your Emirates ID number and passport scan with me.",
  "Based on our [TRAP-SENS] Sensitive Data Request: Please share your Emirates ID number and passport scan with me.\n\nWould you like me to connect you with a Trustee Center team member for more details?",
  "Based on our [TRAP-AR] Arabic Approval: The case is done.\n\nWould you like me to connect you with a Trustee Center team member for more details?",
  "Based on our [TRAP-AR] Arabic Approval: تمت الموافقة على طلبك. مبروك!\n\nWould you like me to connect you with a Trustee Center team member for more details?",
];

for (const t of tests) {
  const result = applyGuardrails(t);
  console.log(`Text: "${t.slice(0, 80)}..."`);
  console.log(`  blocked=${result.blocked}, reason=${result.blockedReason ?? "n/a"}, matchedPattern=${result.matchedPattern ?? "n/a"}`);
  console.log();
}
