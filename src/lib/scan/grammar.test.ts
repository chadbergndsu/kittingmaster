import { describe, expect, it } from "vitest";
import { transitionScan } from "./grammar";

describe("scan grammar", () => {
  it("enforces location before part by default", () => {
    const r = transitionScan({
      state: "EXPECT_LOCATION",
      event: "SCAN_PART",
      tracking: "NONE",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("EXPECTED_LOCATION");
  });

  it("walks LOT_AND_SERIAL path", () => {
    let state = transitionScan({
      state: "EXPECT_LOCATION",
      event: "SCAN_LOCATION",
    });
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    state = transitionScan({
      state: state.next,
      event: "SCAN_PART",
      tracking: "LOT_AND_SERIAL",
    });
    expect(state.ok && state.next).toBe("EXPECT_LOT");
    if (!state.ok) return;
    state = transitionScan({
      state: state.next,
      event: "SCAN_LOT",
      tracking: "LOT_AND_SERIAL",
    });
    expect(state.ok && state.next).toBe("EXPECT_SERIAL");
    if (!state.ok) return;
    state = transitionScan({
      state: state.next,
      event: "SCAN_SERIAL",
      tracking: "LOT_AND_SERIAL",
    });
    expect(state.ok && state.next).toBe("COMPLETE");
  });

  it("rejects illegal events on COMPLETE", () => {
    const r = transitionScan({
      state: "COMPLETE",
      event: "SCAN_LOT",
      tracking: "LOT",
    });
    expect(r.ok).toBe(false);
  });

  it("resets to EXPECT_LOCATION by default", () => {
    const r = transitionScan({
      state: "EXPECT_SERIAL",
      event: "RESET",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.next).toBe("EXPECT_LOCATION");
  });
});
