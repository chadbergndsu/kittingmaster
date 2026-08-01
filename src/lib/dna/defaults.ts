import { createHash } from "crypto";

/** Platform default Method DNA — product IP baseline for every new customer. */
export const PLATFORM_DEFAULT_STRATEGIES = {
  allocation: "fefo_nearest_bin",
  pickPath: "zone_snake",
  staging: "dedicated_staging_cell",
  scanGrammar: "kit_location_part_lot_serial",
  validation: "exact_bom_tracking_cell",
  seal: "all_lines_complete_no_exceptions",
  document: "standard_mfg_fulfillment",
  exception: "block_seal_supervisor_override",
} as const;

export const PLATFORM_DEFAULT_CONFIG = {
  allowPartialAllocate: true,
  requireStagingCellBeforeParts: true,
  sealIncludesDnaVersion: true,
  fefo: true,
  serialQtyAlwaysOne: true,
  documentTitle: "KittingMaster",
  brandTagline: "Dual-Ledger Kit Seal",
} as const;

export type StrategyBindings = typeof PLATFORM_DEFAULT_STRATEGIES;
export type DnaConfig = typeof PLATFORM_DEFAULT_CONFIG;

export function hashDnaContent(
  strategies: Record<string, string>,
  config: Record<string, unknown>
): string {
  const payload = JSON.stringify({ strategies, config });
  return createHash("sha256").update(payload).digest("hex");
}

export function exportDnaPack(input: {
  organizationSlug: string;
  organizationName: string;
  dnaName: string;
  version: string;
  strategies: Record<string, string>;
  config: Record<string, unknown>;
  contentHash: string;
  publishedAt: string | null;
}) {
  return {
    format: "kittingmaster.method-dna.v1",
    exportedAt: new Date().toISOString(),
    customer: {
      slug: input.organizationSlug,
      name: input.organizationName,
    },
    methodDna: {
      name: input.dnaName,
      version: input.version,
      strategies: input.strategies,
      config: input.config,
      contentHash: input.contentHash,
      publishedAt: input.publishedAt,
    },
    notice:
      "This Method DNA pack is customer-specific intellectual property configuration. Platform strategies remain KittingMaster IP.",
  };
}
