/**
 * Plain-text dual-entry export (ledger-cli inspired).
 * Maps kitting inventory moves to debit/credit lines so customers own an
 * audit artifact without vendor lock-in — research insight from OSS_RESEARCH.md.
 */

export type LedgerTxn = {
  createdAt: Date;
  type: string;
  kitCode?: string | null;
  partSku: string;
  qty: number;
  fromLocation?: string | null;
  toLocation?: string | null;
  lot?: string | null;
  serial?: string | null;
  meta?: string | null;
};

function account(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(":");
}

/**
 * Render inventory transactions as ledger-cli-compatible journal entries.
 * Commodity = part SKU (or KIT for sealed instances).
 */
export function renderLedgerJournal(
  orgSlug: string,
  txns: LedgerTxn[],
  options?: { title?: string }
): string {
  const lines: string[] = [
    "; KittingMaster dual-ledger export (ledger-cli compatible)",
    `; organization: ${orgSlug}`,
    `; generated: ${new Date().toISOString()}`,
    options?.title ? `; ${options.title}` : ";",
    ";",
    "; Accounts:",
    ";   RAW:<sku>:<location>   component stock",
    ";   HOLD:<kit>             reserved for kit",
    ";   STAGED:<kit>:<cell>    staged at cell",
    ";   KIT:<kitInstance>      sealed kit ledger",
    "",
  ];

  for (const t of txns) {
    const day = t.createdAt.toISOString().slice(0, 10);
    const note = [
      t.type,
      t.kitCode,
      t.lot ? `lot ${t.lot}` : null,
      t.serial ? `sn ${t.serial}` : null,
      t.meta,
    ]
      .filter(Boolean)
      .join(" · ");

    lines.push(`${day} * ${note}`);

    const q = Math.abs(t.qty);
    const sku = t.partSku;

    switch (t.type) {
      case "RECEIPT":
        lines.push(
          `    ${account(["RAW", sku, t.toLocation || "INBOUND"])}    ${q} ${sku}`
        );
        lines.push(`    Equity:Inventory                       -${q} ${sku}`);
        break;
      case "RESERVE":
        lines.push(`    ${account(["HOLD", t.kitCode || "KIT"])}    ${q} ${sku}`);
        lines.push(
          `    ${account(["RAW", sku, t.fromLocation || "BIN"])}    -${q} ${sku}`
        );
        break;
      case "UNRESERVE":
        lines.push(
          `    ${account(["RAW", sku, t.toLocation || t.fromLocation || "BIN"])}    ${q} ${sku}`
        );
        lines.push(`    ${account(["HOLD", t.kitCode || "KIT"])}    -${q} ${sku}`);
        break;
      case "PICK":
      case "STAGE":
        lines.push(
          `    ${account(["STAGED", t.kitCode || "KIT", t.toLocation || "CELL"])}    ${q} ${sku}`
        );
        lines.push(
          `    ${account([
            t.type === "STAGE" ? "HOLD" : "RAW",
            t.type === "STAGE" ? t.kitCode || "KIT" : sku,
            t.type === "STAGE" ? null : t.fromLocation || "BIN",
          ])}    -${q} ${sku}`
        );
        break;
      case "SEAL":
        lines.push(`    ${account(["KIT", t.kitCode || "INSTANCE"])}    ${q} ${sku}`);
        lines.push(
          `    ${account(["STAGED", t.kitCode || "KIT", t.fromLocation || "CELL"])}    -${q} ${sku}`
        );
        break;
      case "RELEASE":
        lines.push(`    Expense:Issued:${t.kitCode || "KIT"}    ${q} ${sku}`);
        lines.push(`    ${account(["KIT", t.kitCode || "INSTANCE"])}    -${q} ${sku}`);
        break;
      case "ADJUST":
        if (t.qty >= 0) {
          lines.push(
            `    ${account(["RAW", sku, t.toLocation || "BIN"])}    ${q} ${sku}`
          );
          lines.push(`    Equity:Adjust                       -${q} ${sku}`);
        } else {
          lines.push(`    Equity:Adjust                        ${q} ${sku}`);
          lines.push(
            `    ${account(["RAW", sku, t.fromLocation || t.toLocation || "BIN"])}    -${q} ${sku}`
          );
        }
        break;
      default:
        lines.push(
          `    ${account(["RAW", sku, t.toLocation || "MISC"])}    ${q} ${sku}`
        );
        lines.push(
          `    ${account(["RAW", sku, t.fromLocation || "MISC"])}    -${q} ${sku}`
        );
    }
    lines.push("");
  }

  return lines.join("\n");
}
