import { describe, expect, it } from "vitest";
import { getConfig } from "@/lib/config";
import { runResearchGraph } from "@/lib/pipeline/research-graph";
import type { ResearchInput } from "@/lib/types";

const input: ResearchInput = {
  targetUrl: "https://example.com",
  preset: "general",
  sellerProfile: {
    productName: "Sales research assistant",
    valueProposition: "Prepare evidence-grounded first sales conversations.",
    targetCustomer: "B2B sales teams",
    customerProblems: ["Slow account research"],
    proofPoints: [],
    callToAction: "Schedule a discovery call.",
  },
};

describe("research graph", () => {
  it("runs one shared-state workflow and labels a no-model result as collection-only", async () => {
    const result = await runResearchGraph(input, getConfig({ ENABLE_LLM_ENHANCEMENT: "false" }), {
      collectSources: async () => ({
        sources: [{
          url: "https://example.com/about",
          title: "Example company overview",
          content: "Example is a company that publishes products, services, customer information, and business updates on its public website for visitors.",
          sourceType: "official",
          fetchedAt: new Date().toISOString(),
        }],
        notes: ["Collected one official source."],
        warnings: [],
        coverage: { directChannels: 0, firecrawlChannels: 1, gapFilledCategories: [] },
        qualityAuditSeed: {
          directSourceCount: 0,
          firecrawlBaseSourceCount: 1,
          firecrawlGapSourceCount: 0,
          coveredCategories: ["company"],
          failedSources: [],
        },
      }),
    });

    expect(result.researchPlan).toHaveLength(8);
    expect(result.sources).toHaveLength(1);
    expect(result.report?.reportMeta.status).toBe("仅采集");
    expect(result.report?.customerIntelligence.companyOverview.status).toBe("insufficient");
    expect(result.report?.customerIntelligence.companyOverview.value ?? "").not.toContain("Example is a company");
    expect(result.report?.qualityAudit?.minimumStandardMet).toBe(false);
  });
});
