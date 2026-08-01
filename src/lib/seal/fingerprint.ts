import { createHash } from "crypto";

export type SealLine = {
  partId: string;
  sku: string;
  qty: number;
  lotNumber?: string | null;
  serialNumber?: string | null;
  stagingCellId: string;
};

/**
 * Kit Seal multi-factor completeness fingerprint (platform IP).
 * Binds BOM satisfaction, identity-tracked material, staging cell, and DNA version.
 */
export function computeKitSealFingerprint(input: {
  organizationId: string;
  kitId: string;
  dnaVersionId: string;
  demandType: string;
  sealedAtIso: string;
  lines: SealLine[];
}): string {
  const normalizedLines = [...input.lines]
    .map((l) => ({
      partId: l.partId,
      sku: l.sku,
      qty: Number(l.qty),
      lotNumber: l.lotNumber ?? "",
      serialNumber: l.serialNumber ?? "",
      stagingCellId: l.stagingCellId,
    }))
    .sort((a, b) => {
      const ka = `${a.partId}|${a.lotNumber}|${a.serialNumber}`;
      const kb = `${b.partId}|${b.lotNumber}|${b.serialNumber}`;
      return ka.localeCompare(kb);
    });

  const payload = JSON.stringify({
    v: 1,
    organizationId: input.organizationId,
    kitId: input.kitId,
    dnaVersionId: input.dnaVersionId,
    demandType: input.demandType,
    sealedAt: input.sealedAtIso,
    lines: normalizedLines,
  });

  return createHash("sha256").update(payload).digest("hex");
}

export function shortSealCode(fingerprint: string): string {
  return fingerprint.slice(0, 12).toUpperCase();
}
