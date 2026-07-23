# Sales Intelligence Contract Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stable, evidence-grounded sales research pipeline whose output is complete for B2B sales, preserves every valid field, and renders as a four-module premium report with only 3–5 reference links at the bottom.

**Architecture:** Introduce a normalized `SalesResearchReport` contract between collection/model code and the UI. Keep evidence and diagnostics internally, validate and merge model output field by field, then render four fixed sales workflows rather than rendering crawler-shaped data. Direct collection and Firecrawl keep independent partial results and external sources pass an entity-identity check instead of a same-domain-only rule.

**Tech Stack:** Next.js 16, React 19, TypeScript, Zod, OpenAI-compatible API, Firecrawl, Vitest, Testing Library, CSS.

## Global Constraints

- Do not delete or reset unrelated user/ClaudeCode changes in the dirty worktree.
- Node.js direct fetch remains the first collection stage; Firecrawl always runs as the second complementary stage.
- A failed field must never discard other valid model fields.
- Missing evidence produces `insufficient`, never fabricated customer facts.
- The UI has exactly four report modules: 销售结论、客户情报、机会判断、沟通作战.
- No evidence/source module, per-content source chips, evidence IDs, excerpts, or technical diagnostics in the customer-facing UI.
- The report footer shows only 3–5 high-value reference links.
- The visual system uses a white surface, deep green accent, restrained radius/shadow, modern Chinese sans typography, and a 1180–1280px report column.

---

### Task 1: Introduce the stable sales report contract

**Files:**
- Create: `sales-intel-demo/src/lib/sales-report.ts`
- Modify: `sales-intel-demo/src/lib/types.ts`
- Modify: `sales-intel-demo/src/lib/report-history.ts`
- Create: `sales-intel-demo/tests/unit/fixtures/complete-battlecard.ts`
- Create: `sales-intel-demo/tests/unit/sales-report.test.ts`
- Modify: `sales-intel-demo/tests/unit/report-history.test.ts`

**Interfaces:**
- Consumes: existing `Battlecard`, `SellerProfile`, `Source`, and legacy history entries.
- Produces: `ResearchField<T>`, `SalesResearchReport`, `toSalesResearchReport(card, sellerProfile)`, and `selectPrimaryReferences(report, limit)`.

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { toSalesResearchReport, selectPrimaryReferences } from "@/lib/sales-report";
import { completeBattlecard, sellerProfile } from "./fixtures/complete-battlecard";

describe("sales report contract", () => {
  it("assigns every sales question a stable field status", () => {
    const report = toSalesResearchReport(completeBattlecard, sellerProfile);
    expect(report.salesVerdict.contactRecommendation.status).toMatch(/verified|inferred|insufficient|conflicting/);
    expect(report.customerIntelligence.companyOverview.status).toBe("verified");
    expect(report.opportunityAnalysis.opportunities.length).toBeGreaterThan(0);
    expect(report.conversationPlan.discoveryQuestions.value?.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps internal evidence but exposes only five primary links", () => {
    const report = toSalesResearchReport(completeBattlecard, sellerProfile);
    expect(report.qualityAudit.claims.length).toBeGreaterThan(0);
    expect(selectPrimaryReferences(report, 5)).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run the tests and verify the contract is missing**

Run:

```powershell
pnpm vitest run tests/unit/sales-report.test.ts
```

Expected: FAIL because `@/lib/sales-report` does not exist.

- [ ] **Step 3: Implement the normalized field and report types**

```ts
export type ResearchFieldStatus =
  | "verified"
  | "inferred"
  | "insufficient"
  | "conflicting";

export type ResearchField<T> = {
  value?: T;
  status: ResearchFieldStatus;
  sourceIds: string[];
  note?: string;
};

type CitedText = Battlecard["overview"];
type Question = Battlecard["questions"][number];

export type OpportunityChain = {
  signal: CitedText;
  pain: ResearchField<string>;
  businessImpact: ResearchField<string>;
  productMatch: ResearchField<string>;
  validationQuestion: string;
  confidence: "低" | "中" | "高";
};

export type QualityAudit = {
  claims: EvidenceClaim[];
  fieldRejections: Array<{
    stage: "customer" | "opportunity" | "conversation";
    field: string;
    reason: string;
  }>;
  collectionNotes: string[];
};

export type SalesResearchReport = {
  salesVerdict: {
    contactRecommendation: ResearchField<"建议联系" | "先验证" | "暂缓">;
    recommendationReason: ResearchField<string>;
    keySignals: ResearchField<CitedText[]>;
    priorityRole: ResearchField<string>;
    priorityOpportunity: ResearchField<string>;
    nextStep: ResearchField<string>;
  };
  customerIntelligence: {
    companyOverview: ResearchField<string>;
    productsAndServices: ResearchField<CitedText[]>;
    targetCustomersAndMarkets: ResearchField<string>;
    businessModel: ResearchField<string>;
    productPositioning: ResearchField<string>;
    scaleAndCapabilities: ResearchField<CitedText[]>;
    recentUpdates: ResearchField<CitedText[]>;
    gaps: string[];
  };
  opportunityAnalysis: {
    opportunities: OpportunityChain[];
    currentSolutionAndCompetition: ResearchField<string>;
    risks: ResearchField<CitedText[]>;
  };
  conversationPlan: {
    recommendedRoles: ResearchField<string[]>;
    objective: ResearchField<string>;
    opening: ResearchField<string>;
    valueMessage: ResearchField<string>;
    discoveryQuestions: ResearchField<Question[]>;
    objectionDirections: ResearchField<string[]>;
    proofPoints: ResearchField<string[]>;
    nextStep: ResearchField<string>;
    avoid: ResearchField<string[]>;
  };
  qualityAudit: QualityAudit;
  sources: Source[];
  metrics?: Metrics;
};
```

`toSalesResearchReport` must map legacy `Battlecard` fields into the new contract without fabricating values. Missing values use `status: "insufficient"` and a short human-readable `note`.

- [ ] **Step 4: Implement reference selection**

`selectPrimaryReferences(report, 5)` must choose, in order:

1. One official company/about source.
2. One official product/service source.
3. Up to two sources supporting business signals or recent updates.
4. One authoritative external source when available.

It must deduplicate canonical URLs and never return more than five links.

- [ ] **Step 5: Preserve the normalized report in history**

Extend `SavedResearchReport` with:

```ts
normalizedReport?: SalesResearchReport;
```

Keep `report: Battlecard` for old records. `parseHistory` must accept both old and new entries.

- [ ] **Step 6: Run contract and history tests**

Run:

```powershell
pnpm vitest run tests/unit/sales-report.test.ts tests/unit/report-history.test.ts
```

Expected: PASS.

---

### Task 2: Make collection stable and category-driven

**Files:**
- Modify: `sales-intel-demo/src/lib/research.ts`
- Modify: `sales-intel-demo/src/lib/source-quality.ts`
- Modify: `sales-intel-demo/src/lib/mcp/clients/mcp-hub.ts`
- Modify: `sales-intel-demo/src/lib/pipeline/run-research.ts`
- Modify: `sales-intel-demo/src/lib/types.ts`
- Modify: `sales-intel-demo/tests/unit/mcp-hub.test.ts`
- Modify: `sales-intel-demo/tests/unit/source-quality.test.ts`
- Modify: `sales-intel-demo/tests/unit/research.test.ts`
- Modify: `sales-intel-demo/tests/unit/pipeline.test.ts`

**Interfaces:**
- Consumes: `ResearchInput`, direct crawler, Firecrawl crawler, and raw sources.
- Produces: independent channel results, identity-verified external sources, category coverage, and field-level collection diagnostics.

- [ ] **Step 1: Write failing tests for partial-result preservation**

```ts
it("keeps completed direct sources when Firecrawl times out", async () => {
  const hub = makeHub({
    direct: Promise.resolve(collectionWith(["official-1"])),
    firecrawl: neverResolvingCollection(),
  });
  const result = await new HubCrawler(hub, "configured").collect(input);
  expect(result.sources.map(source => source.id)).toContain("official-1");
});

it("keeps completed Firecrawl sources when direct collection exceeds its deadline", async () => {
  const hub = makeHub({
    direct: neverResolvingCollection(),
    firecrawl: Promise.resolve(collectionWith(["firecrawl-1"])),
  });
  const result = await new HubCrawler(hub, "configured").collect(input);
  expect(result.sources.map(source => source.id)).toContain("firecrawl-1");
});
```

- [ ] **Step 2: Write failing external identity tests**

```ts
it("accepts an authoritative external article that identifies the target company", () => {
  const assessment = assessSource(externalArticleForTarget, targetUrl);
  expect(assessment.eligible).toBe(true);
  expect(assessment.categories).toContain("news");
});

it("rejects an external article without target identity evidence", () => {
  expect(assessSource(unrelatedArticle, targetUrl).eligible).toBe(false);
});
```

- [ ] **Step 3: Replace the destructive total timeout**

Change `McpClientHub.callTool` so timeout returns only for that tool call and does not overwrite previously accumulated channel results. Give direct and Firecrawl explicit channel budgets:

```ts
export const COLLECTION_TIMEOUTS = {
  direct: 55_000,
  firecrawlBase: 60_000,
  firecrawlGap: 35_000,
} as const;
```

`HubCrawler.collect` must run the two base channels with `Promise.allSettled`, merge every fulfilled result, then run category gap filling against the merged set.

- [ ] **Step 4: Replace same-domain-only filtering**

Add:

```ts
export function verifiesTargetIdentity(source: Source, targetUrl: string): boolean;
```

The function returns true when:

- the source is on the target domain; or
- the source title/content contains the normalized company/brand identity and the source type is `news`, `registry`, or `other`.

Social discussions remain rejected. External sources receive a lower score than official sources but are eligible for news, business signal, competition, and market fields.

- [ ] **Step 5: Record useful collection diagnostics**

Extend metrics/diagnostics with:

```ts
type CollectionDiagnostics = {
  directSourceCount: number;
  firecrawlSourceCount: number;
  gapFillSourceCount: number;
  categoryCounts: Record<EvidenceCategory, number>;
  rejectedSourceCounts: Record<string, number>;
};
```

Do not render this object in the normal report UI.

- [ ] **Step 6: Run collection tests**

Run:

```powershell
pnpm vitest run tests/unit/mcp-hub.test.ts tests/unit/source-quality.test.ts tests/unit/research.test.ts tests/unit/pipeline.test.ts
```

Expected: PASS without a live-network timeout.

---

### Task 3: Replace all-or-nothing model validation with field-level merging

**Files:**
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Modify: `sales-intel-demo/src/lib/types.ts`
- Create: `sales-intel-demo/src/lib/report-quality.ts`
- Modify: `sales-intel-demo/src/lib/pipeline/run-research.ts`
- Modify: `sales-intel-demo/tests/unit/llm.test.ts`
- Create: `sales-intel-demo/tests/unit/report-quality.test.ts`

**Interfaces:**
- Consumes: category evidence packs, seller profile, and partial model JSON.
- Produces: independently validated facts, opportunities, and conversation fields plus per-field rejection reasons.

- [ ] **Step 1: Write the regression test for the root bug**

```ts
it("preserves five valid strategy fields when one field is missing", () => {
  const raw = JSON.stringify({
    salesStrategy: {
      entryPoints: [cited("客户扩建了新产线")],
      recommendation: cited("可围绕原料稳定性验证合作机会"),
      opening: cited("注意到贵司新产线已投产"),
      discoveryQuestions: questions.slice(0, 4),
      recommendedNextStep: "与采购或研发负责人安排一次需求确认",
    },
  });

  const result = normalizeSalesStrategy(raw, card, seller.productName);
  expect(result?.salesStrategy.entryPoints).toHaveLength(1);
  expect(result?.salesStrategy.opening).toBeDefined();
  expect(result?.salesStrategy.potentialNeeds).toBeUndefined();
});
```

- [ ] **Step 2: Write the invalid-citation isolation test**

```ts
it("rejects only the field with an unknown source id", () => {
  const result = mergeValidatedStrategy(baseStrategy, modelPatchWithOneBadCitation, card);
  expect(result.opening).toBeUndefined();
  expect(result.entryPoints).toHaveLength(1);
  expect(result.discoveryQuestions).toHaveLength(4);
});
```

- [ ] **Step 3: Remove the complete-strategy gate**

Delete `hasCompleteSalesStrategy` as a condition for accepting a whole model response. Replace it with:

```ts
export function mergeValidatedStrategy(
  current: Battlecard["salesStrategy"],
  patch: SalesStrategyPatch,
  card: Battlecard,
): {
  value: Battlecard["salesStrategy"];
  missingFields: Array<keyof Battlecard["salesStrategy"]>;
  rejectedFields: Array<{
    field: keyof Battlecard["salesStrategy"];
    reason: "invalid_shape" | "invalid_source" | "not_customer_specific" | "unsupported_product_claim";
  }>;
};
```

Each valid field is merged immediately. Invalid fields are listed in `rejectedFields`.

- [ ] **Step 4: Split model generation into three stages**

Implement:

```ts
generateCustomerIntelligence(...)
generateOpportunityAnalysis(...)
generateConversationPlan(...)
```

Each stage receives only relevant evidence and returns a partial object. The first repair call includes only `missingFields`; it must not regenerate fields already accepted.

- [ ] **Step 5: Enforce sales usefulness without generic filler**

`report-quality.ts` must reject:

- recommendation text with no customer-specific signal;
- opening text with no target-company fact or signal;
- generic next steps as the only action;
- pain hypotheses without a source-backed business trigger;
- product claims not present in the seller profile.

It must not reject other unrelated valid fields.

- [ ] **Step 6: Build a deterministic minimum report fallback**

When no personalized opportunity is supportable:

- contact recommendation becomes `暂缓`;
- the report states that no concrete trigger signal was found;
- questions focus on verifying current priorities and fit;
- no generic pain is created.

- [ ] **Step 7: Run LLM and quality tests**

Run:

```powershell
pnpm vitest run tests/unit/llm.test.ts tests/unit/report-quality.test.ts
```

Expected: PASS, including partial-output preservation.

---

### Task 4: Build the four-module premium report UI

**Files:**
- Create: `sales-intel-demo/src/components/report/report-workspace.tsx`
- Create: `sales-intel-demo/src/components/report/sales-verdict.tsx`
- Create: `sales-intel-demo/src/components/report/customer-intelligence.tsx`
- Create: `sales-intel-demo/src/components/report/opportunity-analysis.tsx`
- Create: `sales-intel-demo/src/components/report/conversation-plan.tsx`
- Create: `sales-intel-demo/src/components/report/reference-links.tsx`
- Modify: `sales-intel-demo/src/app/page.tsx`
- Modify: `sales-intel-demo/src/app/globals.css`
- Modify: `sales-intel-demo/tests/unit/report-ui.test.tsx`

**Interfaces:**
- Consumes: `SalesResearchReport` and `SavedResearchReport`.
- Produces: a four-tab seller-facing report and a compact reference-link footer.

- [ ] **Step 1: Rewrite the UI coverage test**

The test fixture must contain every contract field. For each tab, click it and assert that every assigned field is visible exactly once. Also assert:

```ts
expect(screen.queryByText("证据与边界")).not.toBeInTheDocument();
expect(screen.queryByText(/来源 0\d/)).not.toBeInTheDocument();
expect(screen.queryByText("查看支撑原文")).not.toBeInTheDocument();
expect(screen.getAllByRole("link", { name: /官网|产品|动态|报道/ })).toHaveLength(4);
```

- [ ] **Step 2: Implement the four report modules**

The report tabs are exactly:

```ts
[
  { id: "verdict", label: "01 销售结论" },
  { id: "customer", label: "02 客户情报" },
  { id: "opportunity", label: "03 机会判断" },
  { id: "conversation", label: "04 沟通作战" },
]
```

Do not render source chips inside cards.

- [ ] **Step 3: Render opportunities as a single causal chain**

Each opportunity card keeps these nodes together:

```text
公开信号
→ 待验证痛点
→ 业务影响
→ 我方能力匹配
→ 验证问题
→ 置信度
```

No node may be duplicated in another primary module.

- [ ] **Step 4: Render the conversation module in call order**

The visual order must be:

1. Recommended role.
2. Objective.
3. Full-width 30-second opening.
4. Value message.
5. Numbered discovery questions with purpose.
6. Proof points.
7. Objection directions.
8. Next step.
9. Avoid list.

- [ ] **Step 5: Add the compact report references**

`ReferenceLinks` renders 3–5 links with title, domain, and external-link icon. It appears after all four modules and has no independent navigation tab.

- [ ] **Step 6: Apply the approved visual system**

Use:

```css
:root {
  --bg: #f8faf8;
  --surface: #ffffff;
  --ink: #142118;
  --muted: #68716b;
  --accent: #4e6f58;
  --accent-dark: #294332;
  --accent-soft: #eef3ee;
  --line: #e1e6e1;
}
```

Requirements:

- body uses a modern Chinese sans stack;
- report title 32–40px on desktop;
- module title 22–26px;
- body 15–16px with line-height 1.72–1.82;
- cards use 12–18px radius and restrained shadow;
- no oversized centered report headings;
- no blank sidebar while scrolling;
- no content requires 80% browser zoom.

- [ ] **Step 7: Run UI tests**

Run:

```powershell
pnpm vitest run tests/unit/report-ui.test.tsx tests/unit/report-presentation.test.ts
```

Expected: PASS with four modules and no evidence UI.

---

### Task 5: Add repeatable report completeness verification

**Files:**
- Create: `sales-intel-demo/src/lib/report-diagnostics.ts`
- Create: `sales-intel-demo/tests/unit/report-diagnostics.test.ts`
- Modify: `sales-intel-demo/src/lib/pipeline/run-research.ts`
- Modify: `sales-intel-demo/src/app/page.tsx`
- Modify: `sales-intel-demo/README.md`

**Interfaces:**
- Consumes: completed `SalesResearchReport` and internal diagnostics.
- Produces: deterministic completeness summaries for development and regression comparison.

- [ ] **Step 1: Define the completeness summary**

```ts
export type ReportCompleteness = {
  answered: string[];
  inferred: string[];
  missing: string[];
  conflicting: string[];
  sellerActionCount: number;
  referenceCount: number;
};
```

`measureReportCompleteness(report)` must inspect every field in the information contract.

- [ ] **Step 2: Add repeat-run comparison**

```ts
export function compareReportCompleteness(
  left: ReportCompleteness,
  right: ReportCompleteness,
): {
  stableStructure: boolean;
  lostFields: string[];
  gainedFields: string[];
};
```

`stableStructure` is true when both reports contain statuses for the same contract fields, even if values differ.

- [ ] **Step 3: Keep diagnostics out of the customer UI**

The browser report shows only:

- report status;
- four sales modules;
- reference links.

Diagnostics are logged server-side in development and covered by tests.

- [ ] **Step 4: Run the full automated suite**

Run:

```powershell
pnpm test
pnpm lint
pnpm build
git diff --check
```

Expected:

- all tests pass;
- lint has zero errors;
- production build succeeds;
- no whitespace errors.

- [ ] **Step 5: Run real-site regression**

Use three public websites representing:

1. a structured manufacturing website;
2. a sparse traditional-company website;
3. a company with external news.

Run each twice with the same seller profile. Verify:

- the same contract fields exist in both runs;
- valid fields are not lost because another field is missing;
- direct and Firecrawl results both appear in diagnostics when available;
- the UI contains four modules and 3–5 reference links;
- the report has no evidence/source module or per-content source buttons.
