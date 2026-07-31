import { describe, expect, it } from "vitest";
import { encodeNdjson } from "@/lib/pipeline/ndjson";
import type { PipelineEvent } from "@/lib/types";

describe("encodeNdjson", () => {
  it("encodes a single event as JSON + newline", () => {
    const event: PipelineEvent = { kind: "started", runId: "test-run-001" };
    const encoded = encodeNdjson(event);
    const decoded = new TextDecoder().decode(encoded);
    expect(decoded).toBe(JSON.stringify(event) + "\n");
  });

  it("encodes completed event with report reference", () => {
    const event: PipelineEvent = {
      kind: "completed",
      runId: "run-001",
      report: { reportMeta: { companyName: "测试", targetUrl: "https://example.com", sellerProductName: "测试产品", collectedAt: new Date().toISOString(), status: "达标" }, salesVerdict: { contactSuggestion: { status: "insufficient", sourceIds: [] }, recommendationReason: { status: "insufficient", sourceIds: [] }, keyCustomerSignals: [], priorityContactRole: { status: "insufficient", sourceIds: [] }, priorityOpportunity: { status: "insufficient", sourceIds: [] }, recommendedNextStep: { status: "insufficient", sourceIds: [] } }, customerIntelligence: { companyOverview: { status: "insufficient", sourceIds: [] }, productsAndServices: [], targetCustomersAndMarket: { status: "insufficient", sourceIds: [] }, businessModel: { status: "insufficient", sourceIds: [] }, productPositioning: { status: "insufficient", sourceIds: [] }, scaleAndCapability: { status: "insufficient", sourceIds: [] }, recentUpdates: [], informationGaps: [] }, opportunityAnalysis: { opportunities: [], currentSolutionOrCompetition: { status: "insufficient", sourceIds: [] }, overallConfidence: { status: "insufficient", sourceIds: [] } }, conversationPlan: { recommendedContact: { status: "insufficient", sourceIds: [] }, communicationGoal: { status: "insufficient", sourceIds: [] }, opening30s: { status: "insufficient", sourceIds: [] }, valueBridge: { status: "insufficient", sourceIds: [] }, discoveryQuestions: [], objectionResponses: [], proofMaterials: [], nextStep: { status: "insufficient", sourceIds: [] }, avoidTopics: [] }, coverage: { directChannels: 0, firecrawlChannels: 0, gapFilledCategories: [] }, metrics: { durationMs: 0, sourceCount: 0, officialSourceCount: 0, crawlerCalls: 0, llmCalls: 0 }, sources: [], collectionNotes: [], mainReferenceLinks: [] },
      metrics: { durationMs: 1500, sourceCount: 5, officialSourceCount: 2, crawlerCalls: 2, llmCalls: 2 },
    };
    const encoded = encodeNdjson(event);
    const decoded = new TextDecoder().decode(encoded);
    const parsed = JSON.parse(decoded.trim()) as PipelineEvent;
    expect(parsed.kind).toBe("completed");
    if (parsed.kind === "completed") expect(parsed.runId).toBe("run-001");
  });

  it("encodes failed event", () => {
    const event: PipelineEvent = { kind: "failed", code: "insufficient_sources", message: "未能从公开网页获得足以生成作战卡的证据。" };
    const encoded = encodeNdjson(event);
    const decoded = new TextDecoder().decode(encoded);
    const parsed = JSON.parse(decoded.trim()) as PipelineEvent;
    expect(parsed.kind).toBe("failed");
    if (parsed.kind === "failed") expect(parsed.code).toBe("insufficient_sources");
  });

  it("encodes stage event with progress", () => {
    const event: PipelineEvent = { kind: "stage", stage: "collect", progress: 35, message: "正在采集公开资料..." };
    const encoded = encodeNdjson(event);
    const decoded = new TextDecoder().decode(encoded);
    const parsed = JSON.parse(decoded.trim()) as PipelineEvent;
    expect(parsed.kind).toBe("stage");
    if (parsed.kind === "stage") { expect(parsed.stage).toBe("collect"); expect(parsed.progress).toBe(35); }
  });

  it("encodes warning event", () => {
    const event: PipelineEvent = { kind: "warning", message: "官网直连采集未成功，已继续尝试补充通道。" };
    const encoded = encodeNdjson(event);
    const decoded = new TextDecoder().decode(encoded);
    const parsed = JSON.parse(decoded.trim()) as PipelineEvent;
    expect(parsed.kind).toBe("warning");
  });
});
