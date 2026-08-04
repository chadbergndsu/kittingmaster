import { describe, expect, it } from "vitest";
import { renderLedgerJournal } from "./ledger-export";

describe("ledger-cli dual-entry export", () => {
  it("renders balanced RECEIPT and SEAL postings", () => {
    const text = renderLedgerJournal("apex-assembly", [
      {
        createdAt: new Date("2026-08-01T12:00:00Z"),
        type: "RECEIPT",
        partSku: "BRK-100",
        qty: 10,
        toLocation: "A-01-01",
      },
      {
        createdAt: new Date("2026-08-01T13:00:00Z"),
        type: "SEAL",
        kitCode: "SHIP-1",
        partSku: "BRK-100",
        qty: 2,
        fromLocation: "CELL-01",
      },
    ]);

    expect(text).toContain("RAW:BRK-100:A-01-01");
    expect(text).toContain("KIT:SHIP-1");
    expect(text).toContain("STAGED:SHIP-1:CELL-01");
    expect(text).toContain("ledger-cli compatible");
  });
});
