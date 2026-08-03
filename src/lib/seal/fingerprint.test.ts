import { describe, expect, it } from "vitest";
import { computeKitSealFingerprint, shortSealCode } from "./fingerprint";

describe("Kit Seal fingerprint", () => {
  it("is stable for same inputs regardless of line order", () => {
    const base = {
      organizationId: "org1",
      kitId: "kit1",
      dnaVersionId: "dna1",
      demandType: "ASSEMBLY_JOB",
      sealedAtIso: "2026-08-01T12:00:00.000Z",
    };
    const a = computeKitSealFingerprint({
      ...base,
      lines: [
        {
          partId: "p2",
          sku: "B",
          qty: 1,
          stagingCellId: "c1",
          serialNumber: "S2",
        },
        {
          partId: "p1",
          sku: "A",
          qty: 2,
          stagingCellId: "c1",
          lotNumber: "L1",
        },
      ],
    });
    const b = computeKitSealFingerprint({
      ...base,
      lines: [
        {
          partId: "p1",
          sku: "A",
          qty: 2,
          stagingCellId: "c1",
          lotNumber: "L1",
        },
        {
          partId: "p2",
          sku: "B",
          qty: 1,
          stagingCellId: "c1",
          serialNumber: "S2",
        },
      ],
    });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(shortSealCode(a)).toHaveLength(12);
  });

  it("changes when DNA version changes", () => {
    const lines = [{ partId: "p1", sku: "A", qty: 1, stagingCellId: "c1" }];
    const a = computeKitSealFingerprint({
      organizationId: "org1",
      kitId: "kit1",
      dnaVersionId: "dna1",
      demandType: "FULFILLMENT_ORDER",
      sealedAtIso: "2026-08-01T12:00:00.000Z",
      lines,
    });
    const b = computeKitSealFingerprint({
      organizationId: "org1",
      kitId: "kit1",
      dnaVersionId: "dna2",
      demandType: "FULFILLMENT_ORDER",
      sealedAtIso: "2026-08-01T12:00:00.000Z",
      lines,
    });
    expect(a).not.toBe(b);
  });
});
