/**
 * Scan-order grammar state machine (platform IP, DNA-parameterizable).
 * Default path: LOCATION → PART → [LOT] → [SERIAL] → confirm stage.
 */

export type ScanState =
  "EXPECT_LOCATION" | "EXPECT_PART" | "EXPECT_LOT" | "EXPECT_SERIAL" | "COMPLETE";

export type TrackingMode = "NONE" | "LOT" | "SERIAL" | "LOT_AND_SERIAL";

export type ScanEventType = "SCAN_LOCATION" | "SCAN_PART" | "SCAN_LOT" | "SCAN_SERIAL" | "RESET";

export type GrammarResult =
  | { ok: true; next: ScanState; message: string }
  | { ok: false; next: ScanState; code: string; message: string };

export function nextAfterPart(tracking: TrackingMode): ScanState {
  if (tracking === "LOT" || tracking === "LOT_AND_SERIAL") return "EXPECT_LOT";
  if (tracking === "SERIAL") return "EXPECT_SERIAL";
  return "COMPLETE";
}

export function nextAfterLot(tracking: TrackingMode): ScanState {
  if (tracking === "LOT_AND_SERIAL" || tracking === "SERIAL") return "EXPECT_SERIAL";
  return "COMPLETE";
}

export function transitionScan(input: {
  state: ScanState;
  event: ScanEventType;
  tracking?: TrackingMode;
  requireLocationFirst?: boolean;
}): GrammarResult {
  const requireLoc = input.requireLocationFirst ?? true;
  const { state, event } = input;

  if (event === "RESET") {
    return {
      ok: true,
      next: requireLoc ? "EXPECT_LOCATION" : "EXPECT_PART",
      message: "Session reset. Scan staging location.",
    };
  }

  switch (state) {
    case "EXPECT_LOCATION":
      if (event === "SCAN_LOCATION") {
        return { ok: true, next: "EXPECT_PART", message: "Location set. Scan part." };
      }
      return {
        ok: false,
        next: state,
        code: "EXPECTED_LOCATION",
        message: "Scan a staging cell barcode first.",
      };

    case "EXPECT_PART":
      if (event === "SCAN_PART") {
        const tracking = input.tracking ?? "NONE";
        const next = nextAfterPart(tracking);
        return {
          ok: true,
          next,
          message:
            next === "COMPLETE"
              ? "Part accepted. Ready to stage."
              : next === "EXPECT_LOT"
                ? "Scan lot number."
                : "Scan serial number.",
        };
      }
      if (event === "SCAN_LOCATION") {
        return { ok: true, next: "EXPECT_PART", message: "Staging location updated. Scan part." };
      }
      return {
        ok: false,
        next: state,
        code: "EXPECTED_PART",
        message: "Scan a part barcode.",
      };

    case "EXPECT_LOT":
      if (event === "SCAN_LOT") {
        const tracking = input.tracking ?? "LOT";
        const next = nextAfterLot(tracking);
        return {
          ok: true,
          next,
          message: next === "COMPLETE" ? "Lot accepted. Ready to stage." : "Scan serial number.",
        };
      }
      return {
        ok: false,
        next: state,
        code: "EXPECTED_LOT",
        message: "This part requires a lot. Scan lot barcode.",
      };

    case "EXPECT_SERIAL":
      if (event === "SCAN_SERIAL") {
        return { ok: true, next: "COMPLETE", message: "Serial accepted. Ready to stage." };
      }
      return {
        ok: false,
        next: state,
        code: "EXPECTED_SERIAL",
        message: "This part requires a serial. Scan serial barcode.",
      };

    case "COMPLETE":
      if (event === "SCAN_PART") {
        const tracking = input.tracking ?? "NONE";
        const next = nextAfterPart(tracking);
        return {
          ok: true,
          next,
          message: "Next part — follow tracking prompts.",
        };
      }
      if (event === "SCAN_LOCATION") {
        return { ok: true, next: "EXPECT_PART", message: "Location updated. Scan part." };
      }
      return {
        ok: false,
        next: "EXPECT_PART",
        code: "EXPECTED_PART",
        message: "Line complete. Scan next part barcode.",
      };

    default:
      return {
        ok: false,
        next: "EXPECT_LOCATION",
        code: "INVALID_STATE",
        message: "Unknown scan state.",
      };
  }
}

export function promptForState(state: ScanState): string {
  switch (state) {
    case "EXPECT_LOCATION":
      return "Scan staging cell";
    case "EXPECT_PART":
      return "Scan part";
    case "EXPECT_LOT":
      return "Scan lot";
    case "EXPECT_SERIAL":
      return "Scan serial";
    case "COMPLETE":
      return "Line ready — scan next part or seal kit";
    default:
      return "Scan";
  }
}
