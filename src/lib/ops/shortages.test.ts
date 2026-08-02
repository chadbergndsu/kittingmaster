import { describe, expect, it } from "vitest";
import { computeShortages, availableOf } from "./shortages";
import { computeOpsMetrics } from "./metrics";

describe("shortage engine", () => {
  it("computes available stock correctly", () => {
    expect(availableOf({ partId: "p", onHand: 10, reserved: 3, staged: 2 })).toBe(5);
  });

  it("flags critical shortages when demand exceeds available", () => {
    const rows = computeShortages(
      [{ partId: "p1", onHand: 5, reserved: 0, staged: 0 }],
      [
        {
          kitId: "k1",
          kitInstanceCode: "KIT-1",
          kitStatus: "ALLOCATED",
          partId: "p1",
          sku: "BRK",
          partName: "Bracket",
          requiredQty: 10,
          stagedQty: 0,
        },
      ]
    );
    expect(rows[0].shortBy).toBe(5);
    expect(rows[0].severity).toBe("CRITICAL");
    expect(rows[0].blockingKits).toHaveLength(1);
  });

  it("ignores sealed kits in open demand", () => {
    const rows = computeShortages(
      [{ partId: "p1", onHand: 0, reserved: 0, staged: 0 }],
      [
        {
          kitId: "k1",
          kitInstanceCode: "KIT-1",
          kitStatus: "SEALED",
          partId: "p1",
          sku: "BRK",
          partName: "Bracket",
          requiredQty: 10,
          stagedQty: 10,
        },
      ]
    );
    expect(rows.filter((r) => r.shortBy > 0)).toHaveLength(0);
  });
});

describe("ops metrics", () => {
  it("counts sealed today and in-flight", () => {
    const now = new Date("2026-08-02T15:00:00Z");
    const m = computeOpsMetrics(
      [
        {
          id: "1",
          status: "SEALED",
          createdAt: new Date("2026-08-02T10:00:00Z"),
          sealedAt: new Date("2026-08-02T12:00:00Z"),
          updatedAt: new Date("2026-08-02T12:00:00Z"),
          demandType: "ASSEMBLY_JOB",
        },
        {
          id: "2",
          status: "PICKING",
          createdAt: new Date("2026-08-01T10:00:00Z"),
          sealedAt: null,
          updatedAt: now,
          demandType: "FULFILLMENT_ORDER",
          dueAt: new Date("2026-08-01T00:00:00Z"),
        },
      ],
      now
    );
    expect(m.sealedToday).toBe(1);
    expect(m.inFlight).toBe(1);
    expect(m.overdue).toBe(1);
    expect(m.sealRatePct).toBe(50);
  });
});
