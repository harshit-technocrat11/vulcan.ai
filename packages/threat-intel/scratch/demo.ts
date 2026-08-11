/**
 * Manual verification for the threat-intel package (live providers).
 *
 * Reads keys from the global workspace-root .env (vulcan.ai/.env):
 *   VT_API_KEY, ABUSEIPDB_API_KEY
 * MITRE and CVE need no keys.
 *
 * Run with: pnpm --filter @repo/threat-intel run demo
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { createThreatIntelService } from "../src/index.js";

loadEnv({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

async function main(): Promise<void> {
  const ti = createThreatIntelService();

  section("Provider status");
  console.log(JSON.stringify(ti.providerStatus(), null, 2));

  section("IP reputation (VirusTotal + AbuseIPDB aggregated)");
  console.log(JSON.stringify(await ti.analyzeIp("185.220.101.42"), null, 2));

  section("MITRE technique mapping (T1110)");
  console.log(JSON.stringify(await ti.lookupTechnique("T1110"), null, 2));

  section("CVE lookup (Log4Shell)");
  console.log(JSON.stringify(await ti.lookupCve("CVE-2021-44228"), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
