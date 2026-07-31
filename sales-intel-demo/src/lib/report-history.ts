import type { Metrics, Preset, SalesReport, SellerProfile, LegacyBattlecard, Source } from "@/lib/types";
import { legacyBattlecardToReport } from "@/lib/types";

export const REPORT_HISTORY_STORAGE_KEY = "sales-intel-report-history-v2";
export const MAX_SAVED_REPORTS = 24;
const HISTORY_SOURCE_PLACEHOLDER = "正文未保存；请通过来源链接查看原网页。";

export type SavedResearchReport = {
  id: string;
  createdAt: string;
  targetUrl: string;
  preset: Preset;
  customIndustry?: string;
  productName: string;
  sellerProfile?: SellerProfile;
  report: SalesReport;
  metrics?: Metrics;
};

export function upsertHistory(
  history: SavedResearchReport[],
  entry: SavedResearchReport,
): SavedResearchReport[] {
  return [entry, ...history.filter((item) => item.id !== entry.id)].slice(0, MAX_SAVED_REPORTS);
}

function isLegacyBattlecard(obj: Record<string, unknown>): boolean {
  return "overview" in obj || "talkTrack" in obj || "companyOverview" in obj;
}

function convertIfLegacy(raw: unknown, meta: { targetUrl: string; productName: string; createdAt: string }): SalesReport | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  // 已是新格式
  if ("reportMeta" in obj && "salesVerdict" in obj) return obj as unknown as SalesReport;
  // 旧 Battlecard 格式 → 转换
  if (isLegacyBattlecard(obj)) {
    return legacyBattlecardToReport(
      obj as unknown as LegacyBattlecard,
      { targetUrl: meta.targetUrl, sellerProductName: meta.productName, collectedAt: meta.createdAt },
    );
  }
  return null;
}

export function parseHistory(raw: string | null): SavedResearchReport[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (typeof item !== "object" || item === null) return null;
        const entry = item as Record<string, unknown>;
        const targetUrl = typeof entry.targetUrl === "string" ? entry.targetUrl : "";
        const productName = typeof entry.productName === "string" ? entry.productName : "";
        const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : new Date().toISOString();
        const report = convertIfLegacy(entry.report, { targetUrl, productName, createdAt });
        if (!report) return null;
        return {
          id: entry.id as string,
          createdAt,
          targetUrl,
          preset: (entry.preset ?? "general") as Preset,
          customIndustry: typeof entry.customIndustry === "string" ? entry.customIndustry : undefined,
          productName,
          sellerProfile: entry.sellerProfile as SellerProfile | undefined,
          report,
          metrics: entry.metrics as Metrics | undefined,
        } as SavedResearchReport;
      })
      .filter((item): item is SavedResearchReport => Boolean(item))
      .slice(0, MAX_SAVED_REPORTS);
  } catch {
    return [];
  }
}

export function loadReportHistory(): SavedResearchReport[] {
  if (typeof window === "undefined") return [];
  return parseHistory(window.localStorage.getItem(REPORT_HISTORY_STORAGE_KEY));
}

export function compactSourcesForHistory(sources: Source[]): Source[] {
  return sources.map((source) => ({ ...source, content: HISTORY_SOURCE_PLACEHOLDER }));
}

export function saveReportHistory(history: SavedResearchReport[]): void {
  if (typeof window === "undefined") return;
  const compactHistory = history.slice(0, MAX_SAVED_REPORTS).map((entry) => ({
    ...entry,
    report: {
      ...entry.report,
      sources: compactSourcesForHistory(entry.report.sources),
    },
  }));
  window.localStorage.setItem(
    REPORT_HISTORY_STORAGE_KEY,
    JSON.stringify(compactHistory),
  );
}
