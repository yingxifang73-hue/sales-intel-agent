/**
 * Quality-audit entries are internal diagnostics, not report content.
 *
 * A repair pass may append diagnostics to an already full audit. Keep the
 * newest distinct entries within the schema limits so audit growth can never
 * invalidate an otherwise usable report.
 */
function keepNewestDistinct<T>(
  value: unknown,
  limit: number,
  keyOf: (item: T) => string,
): unknown {
  if (!Array.isArray(value)) return value;

  const kept: T[] = [];
  const seen = new Set<string>();
  for (let index = value.length - 1; index >= 0 && kept.length < limit; index -= 1) {
    const item = value[index] as T;
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.unshift(item);
  }
  return kept;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Normalize only bounded internal audit arrays. Every user-facing report
 * module, source and evidence item is returned untouched.
 */
export function normalizeSalesReportAudit<T>(report: T): T {
  if (!isRecord(report) || !isRecord(report.qualityAudit)) return report;

  const qualityAudit = report.qualityAudit;
  return {
    ...report,
    qualityAudit: {
      ...qualityAudit,
      filteredSources: keepNewestDistinct<{ url?: unknown; reason?: unknown }>(
        qualityAudit.filteredSources,
        40,
        (item) => `${String(item?.url ?? "")}\u0000${String(item?.reason ?? "")}`,
      ),
      rejectedFields: keepNewestDistinct<{ field?: unknown; reason?: unknown }>(
        qualityAudit.rejectedFields,
        40,
        (item) => `${String(item?.field ?? "")}\u0000${String(item?.reason ?? "")}`,
      ),
      missingFields: keepNewestDistinct<unknown>(
        qualityAudit.missingFields,
        20,
        (item) => String(item),
      ),
    },
  } as T;
}
