# Reliable Research Facts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure collected public web content reliably becomes structured customer profile, product-fit, and opportunity output even when an individual model response fails.

**Architecture:** Replace the single whole-corpus fact generation call with a bounded map-reduce flow: select eligible sources, extract a small schema from each source independently, merge and deduplicate source-grounded facts, then generate fit/opportunity/conversation from the merged facts. Preserve source IDs and internal field status while removing user-facing empty-state and “待验证” language.

**Tech Stack:** Next.js 16, TypeScript, LangGraph, Zod, Vitest, Firecrawl, OpenAI-compatible FastRoute/Qwen API.

## Global Constraints

- Do not change the established report sections or discard collected evidence.
- Do not install or copy GitHub projects; borrow only the map-reduce research architecture.
- Facts must cite known source IDs; inferred analysis must not be presented as direct source fact.
- Use bounded concurrency and per-source retries; a failed source must not erase successful extraction.
- Do not render “待验证”, “待确认”, misleading fixed data scores, or empty-source warnings in the product UI.
- Reject a seller product name that is a URL or has the same host as the target company URL.

---

### Task 1: Source-fact contracts and deterministic fallback extraction

**Files:**
- Create: `sales-intel-demo/src/lib/source-facts.ts`
- Modify: `sales-intel-demo/src/lib/types.ts`
- Test: `sales-intel-demo/tests/unit/source-facts.test.ts`

**Interfaces:**
- Produces `SourceFactBundle`, `extractDeterministicSourceFacts(source)`, and `mergeSourceFactBundles(bundles, sources)`.
- `SourceFactBundle` contains `sourceId`, `companyOverview`, `productsAndServices`, `targetCustomersAndMarket`, `businessModel`, `productPositioning`, `scaleAndCapability`, `recentUpdates`, and `signals`.

- [ ] Write tests proving a Chinese official-company page produces a source-cited overview/product candidate and that merge removes duplicate values while preserving source IDs.
- [ ] Run `pnpm vitest run tests/unit/source-facts.test.ts` and confirm it fails because the module does not exist.
- [ ] Implement deterministic title/content candidate extraction with `verified` status only, source ID preservation, text-length limits, and semantic de-duplication.
- [ ] Run the targeted test and confirm it passes.

### Task 2: Per-source structured model extraction with safe degradation

**Files:**
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Test: `sales-intel-demo/tests/unit/llm.test.ts`

**Interfaces:**
- Produces exported `extractSourceFactBundles(config, input, sources)` returning successful bundles, stage outcome, and diagnostics.
- Uses at most six selected sources, concurrency two, timeout/retry behavior already provided by `completeJson`, and falls back to deterministic bundles per failed source.

- [ ] Add failing tests for: one malformed model response preserving another source’s extracted facts; all model calls failing still returning deterministic facts from official source text.
- [ ] Run `pnpm vitest run tests/unit/llm.test.ts` and confirm the new tests fail.
- [ ] Add a source-level JSON schema prompt and normalizer that accepts only existing source IDs and only verified factual fields.
- [ ] Merge model and deterministic bundles before the existing profile normalization; mark facts stage `partial` when fallback was used, not `failed`.
- [ ] Remove literal “待验证” prefixes from generated inferred values and prompt examples while retaining `inferred` status.
- [ ] Run the targeted tests and confirm they pass.

### Task 3: Use merged facts as an explicit LangGraph stage

**Files:**
- Modify: `sales-intel-demo/src/lib/pipeline/research-graph.ts`
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Test: `sales-intel-demo/tests/unit/research-graph.test.ts`

**Interfaces:**
- State adds `sourceFactBundles` and optional `researchDiagnostics`.
- New nodes are `extract_source_facts` then `analyze_sales_fit`; the latter receives merged facts and never reverts to a whole-corpus fact call.

- [ ] Add a failing graph test that injects sources with usable company text and asserts the resulting report has a non-insufficient company overview and at least one product/service item even if a model stage degrades.
- [ ] Run `pnpm vitest run tests/unit/research-graph.test.ts` and confirm failure.
- [ ] Add the explicit extraction node after evidence evaluation; pass merged facts to fit/opportunity generation and retain per-stage outcomes in `qualityAudit`.
- [ ] Ensure the report keeps usable customer facts when opportunity/conversation generation fails independently.
- [ ] Run the graph test and confirm it passes.

### Task 4: Product-input guardrails and truthful non-empty sales analysis

**Files:**
- Modify: `sales-intel-demo/src/app/page.tsx`
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`
- Test: `sales-intel-demo/tests/unit/llm.test.ts`

**Interfaces:**
- `validateSellerProductName(productName, targetUrl)` returns a user-readable validation message or `undefined`.
- Fallback opportunity remains an `inferred` discovery entry but is phrased as a first-conversation focus without “待验证”/“待确认”.

- [ ] Add failing UI/unit tests for a URL product name, a product URL sharing the target host, and a discovery opportunity whose display string contains no forbidden status phrase.
- [ ] Run both targeted test files and confirm failure.
- [ ] Validate before the research request; update safe discovery/opportunity and conversation fallback wording without changing internal status semantics.
- [ ] Run targeted tests and confirm they pass.

### Task 5: Remove misleading report UI placeholders

**Files:**
- Modify: `sales-intel-demo/src/components/ReportDetailPage.tsx`
- Modify: `sales-intel-demo/src/components/TabBusinessProducts.tsx`
- Modify: `sales-intel-demo/src/components/TabMatchingOpportunity.tsx`
- Modify: `sales-intel-demo/src/components/FieldBadge.tsx`
- Modify: `sales-intel-demo/src/lib/report-viewmodel.ts`
- Test: `sales-intel-demo/tests/unit/ui-redesign.test.tsx`
- Test: `sales-intel-demo/tests/unit/report-viewmodel.test.ts`

- [ ] Add failing assertions that report rendering contains no fixed `0 / 5`, “待验证”, “待确认”, or “当前没有足够的公开客户信号” string.
- [ ] Run the targeted tests and confirm failure.
- [ ] Remove the score/empty-warning blocks; hide badges for non-direct status; use concise section content and neutral labels while keeping all existing substantive report sections.
- [ ] Run targeted tests and confirm they pass.

### Task 6: End-to-end regression verification

**Files:**
- Modify: `sales-intel-demo/tests/unit/fault-tolerance.test.ts` only if needed for source-fact behavior.

- [ ] Add an end-to-end fixture proving an official source with company/product text produces populated customer profile and nonempty analysis through the graph.
- [ ] Run `pnpm test`, `pnpm lint`, and `pnpm build` from `sales-intel-demo`.
- [ ] Confirm the complete test suite, lint, and production build pass before a real-provider test.
