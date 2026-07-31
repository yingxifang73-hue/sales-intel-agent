"use client";

import type { FieldStatus } from "@/lib/types";
import { fieldStatusLabel, fieldStatusBg, fieldStatusTextColor } from "@/lib/report-viewmodel";

export function FieldBadge({ status, small }: { status: FieldStatus; small?: boolean }) {
  if (status !== "verified") return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontWeight: 600,
        borderRadius: 999,
        background: fieldStatusBg(status),
        color: fieldStatusTextColor(status),
        fontSize: small ? 13 : 14,
        padding: small ? "3px 9px" : "4px 11px",
        whiteSpace: "nowrap",
        lineHeight: 1.4,
        letterSpacing: "0.01em",
      }}
    >
      {fieldStatusLabel(status)}
    </span>
  );
}
