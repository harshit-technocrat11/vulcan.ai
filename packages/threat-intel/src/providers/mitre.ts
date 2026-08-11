import { ProviderError } from "../errors.js";
import { fetchJson } from "../http.js";
import { normalizeMitre } from "../normalizer.js";
import type {
  MitreTTP,
  ProviderConfig,
  ThreatIntelResult,
} from "../types.js";

const DEFAULT_BUNDLE_URL =
  "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json";

const MAX_TACTIC_RESULTS = 50;

function humanize(phaseName: string): string {
  return phaseName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[\s-]/g, "");
}

interface StixAttackPattern {
  type: string;
  name?: string;
  revoked?: boolean;
  description?: string;
  x_mitre_detection?: string;
  external_references?: Array<Record<string, unknown>>;
  kill_chain_phases?: Array<Record<string, unknown>>;
}

/**
 * MITRE ATT&CK provider. Keyless: it loads the official enterprise STIX bundle
 * once (lazy, single-flight, cached in memory) and indexes techniques by their
 * `Txxxx` external id.
 *
 * The bundle is ~30 MB; the first call downloads it, subsequent calls reuse
 * the in-memory index.
 */
export class MitreProvider {
  readonly name = "mitre" as const;

  private bundlePromise: Promise<Map<string, MitreTTP>> | null = null;

  constructor(private readonly config: ProviderConfig = {}) {}

  /** Always available - no apiKey required. */
  isConfigured(): boolean {
    return true;
  }

  async lookupTechnique(techniqueId: string): Promise<ThreatIntelResult> {
    const index = await this.load();
    const id = techniqueId.toUpperCase().replace(/\s+/g, "");
    const ttp = index.get(id);
    if (!ttp) {
      throw new ProviderError(
        this.name,
        "parse_error",
        `Technique ${id} not found in the MITRE ATT&CK enterprise dataset (sub-techniques need the full id, e.g. T1059.001)`,
      );
    }
    return normalizeMitre(ttp);
  }

  async lookupTactic(tactic: string): Promise<ThreatIntelResult[]> {
    const index = await this.load();
    const needle = normalizeKey(tactic);
    const matches: MitreTTP[] = [];
    for (const ttp of index.values()) {
      if (
        normalizeKey(ttp.tactic) === needle ||
        normalizeKey(ttp.tactic).includes(needle)
      ) {
        matches.push(ttp);
        if (matches.length >= MAX_TACTIC_RESULTS) break;
      }
    }
    return matches.map(normalizeMitre);
  }

  /** Force a fresh bundle download on the next lookup. */
  clearCache(): void {
    this.bundlePromise = null;
  }

  private load(): Promise<Map<string, MitreTTP>> {
    if (this.bundlePromise === null) {
      this.bundlePromise = this.fetchBundle();
    }
    return this.bundlePromise;
  }

  private async fetchBundle(): Promise<Map<string, MitreTTP>> {
    const url = this.config.baseUrl ?? DEFAULT_BUNDLE_URL;
    const bundle = await fetchJson<{ objects?: StixAttackPattern[] }>(
      this.name,
      url,
      { timeoutMs: this.config.timeoutMs ?? 60_000 },
    );

    const index = new Map<string, MitreTTP>();

    for (const obj of bundle.objects ?? []) {
      if (obj.type !== "attack-pattern" || obj.revoked === true) continue;

      const mitreRef = (obj.external_references ?? []).find(
        (ref) => ref.source_name === "mitre-attack",
      );
      if (!mitreRef || typeof mitreRef.external_id !== "string") continue;

      const phase = (obj.kill_chain_phases ?? []).find(
        (p) => p.kill_chain_name === "mitre-attack",
      );
      const phaseName =
        typeof phase?.phase_name === "string" ? phase.phase_name : "unknown";

      const ttp: MitreTTP = {
        techniqueId: mitreRef.external_id,
        name: obj.name ?? "",
        tactic: humanize(phaseName),
        description:
          typeof obj.description === "string" ? obj.description : "",
        detection:
          typeof obj.x_mitre_detection === "string"
            ? obj.x_mitre_detection
            : undefined,
        url:
          typeof mitreRef.url === "string"
            ? mitreRef.url
            : `https://attack.mitre.org/techniques/${mitreRef.external_id}/`,
      };

      index.set(mitreRef.external_id.toUpperCase(), ttp);
    }

    if (index.size === 0) {
      throw new ProviderError(
        this.name,
        "parse_error",
        `No attack-pattern objects found in the MITRE STIX bundle at ${url}`,
      );
    }

    return index;
  }
}
