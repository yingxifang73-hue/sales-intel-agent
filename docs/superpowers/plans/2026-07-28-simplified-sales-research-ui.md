# Simplified Sales Research UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将三张最终 UI 设计图落地到现有 Next.js 项目，并让真实报告以精简首页、真实六阶段进度、一体化报告和动态联系方式模块完整展示。

**Architecture:** 保留现有研究 API、历史记录和 `SalesReport → ReportViewModel` 展示链路。扩展一个严格来源约束的联系方式数据契约，在现有事实抽取调用中生成并校验；前端使用统一 App Shell、固定报告目录和连续章节，不创建第二套项目或独立 HTML。

**Tech Stack:** Next.js 16、React 19、TypeScript 5.9、Zod 4、Vitest、Testing Library、Playwright、原生 CSS。

## Global Constraints

- 当前前端 UI 的业务入口仍为调研输入和历史报告，不新增模板管理、客户列表、资料或 CRM 功能。
- 所有页面使用现有项目和真实 API，不使用假数据填充。
- 电话、邮箱、地址、线上渠道和真实联系人必须来自公开来源并保留来源 ID；无法验证时不显示具体值。
- “真实公开联系人”和“推荐联系角色”必须分开。
- 报告正文保留六个主章节；补充信息与证据备份作为第七部分并默认折叠。
- 关键报告字段不得因折叠或视觉精简而丢失。
- 研究进度只显示现有 `site / collect / facts / opportunity / conversation / validate` 六阶段。
- 保留现有页面功能、流式 API、历史报告兼容、证据抽屉和 JSON 导出。

---

### Task 1: 联系方式结构化数据契约

**Files:**
- Modify: `sales-intel-demo/src/lib/types.ts`
- Modify: `sales-intel-demo/src/lib/research.ts`
- Modify: `sales-intel-demo/src/lib/report-viewmodel.ts`
- Modify: `sales-intel-demo/tests/unit/types.test.ts`
- Modify: `sales-intel-demo/tests/unit/report-viewmodel.test.ts`

**Interfaces:**
- Produces: `ContactChannel`, `PublicContact`, `ContactIntelligence`
- Produces: `SalesReport.contactIntelligence`
- Produces: `ReportViewModel.contacts`

- [ ] **Step 1: Write failing schema and view-model tests**

Add fixtures that contain verified website/contact-page/email/address channels and assert:

```ts
expect(SalesReportSchema.parse(report).contactIntelligence.channels).toHaveLength(4);
expect(vm.contacts.channels.find((item) => item.kind === "email")?.value).toBe("sales@example.com");
expect(vm.contacts.publicContacts).toHaveLength(0);
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```powershell
pnpm test -- tests/unit/types.test.ts tests/unit/report-viewmodel.test.ts
```

Expected: tests fail because `contactIntelligence` and `vm.contacts` do not exist.

- [ ] **Step 3: Add strict schemas**

Add:

```ts
export const ContactChannelSchema = z.object({
  kind: z.enum(["website", "contact_page", "phone", "email", "online_channel", "address"]),
  label: z.string().trim().min(2).max(80),
  value: z.string().trim().min(2).max(500),
  url: z.url().optional(),
  status: z.enum(["verified", "conflicting"]),
  sourceIds: z.array(z.string().min(8)).min(1).max(5),
});

export const PublicContactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  role: z.string().trim().min(2).max(120),
  contact: z.string().trim().max(200).optional(),
  status: z.enum(["verified", "conflicting"]),
  sourceIds: z.array(z.string().min(8)).min(1).max(5),
});

export const ContactIntelligenceSchema = z.object({
  channels: z.array(ContactChannelSchema).max(20).default([]),
  publicContacts: z.array(PublicContactSchema).max(10).default([]),
});
```

Make `contactIntelligence` default to empty arrays for historical compatibility. Add empty contact intelligence in `synthesizeReport`, and map it to `ReportViewModel.contacts` without trimming.

- [ ] **Step 4: Run focused tests**

Run the command from Step 2.

Expected: all focused tests pass.

---

### Task 2: 来源约束的联系方式抽取

**Files:**
- Modify: `sales-intel-demo/src/lib/llm.ts`
- Create: `sales-intel-demo/src/lib/contact-intelligence.ts`
- Create: `sales-intel-demo/tests/unit/contact-intelligence.test.ts`
- Modify: `sales-intel-demo/tests/unit/llm.test.ts`

**Interfaces:**
- Consumes: facts-call JSON field `contactIntelligence`
- Produces: `normalizeContactIntelligence(raw, sources, targetUrl): ContactIntelligence`

- [ ] **Step 1: Write failing verification tests**

Cover exact evidence validation:

```ts
expect(result.channels.map((item) => item.value)).toContain("sales@example.com");
expect(result.channels.map((item) => item.value)).not.toContain("fake@example.com");
expect(result.publicContacts.map((item) => item.name)).not.toContain("张伟");
```

The accepted source fixture must contain `sales@example.com`; rejected values must be absent from all cited source content and URLs.

- [ ] **Step 2: Run the new test and verify failure**

Run:

```powershell
pnpm test -- tests/unit/contact-intelligence.test.ts tests/unit/llm.test.ts
```

Expected: failure because the normalizer does not exist.

- [ ] **Step 3: Implement deterministic evidence checking**

`normalizeContactIntelligence` must:

- map `S1` short IDs to real source IDs;
- reject channels without cited sources;
- require phone/email/address/person values to appear in normalized cited source text;
- require channel URLs to equal a cited source URL, share the target-company hostname, or appear in cited content;
- add the target website from `reportMeta.targetUrl` only when an official source from the same hostname exists;
- deduplicate by `kind + normalized value`;
- never convert inferred items into verified contacts.

- [ ] **Step 4: Extend the existing facts prompt**

The facts response adds:

```json
{
  "contactIntelligence": {
    "channels": [
      {
        "kind": "phone",
        "label": "官方电话",
        "value": "证据原文中的号码",
        "status": "verified",
        "sourceIds": ["S1"]
      }
    ],
    "publicContacts": []
  }
}
```

Prompt rules explicitly forbid guessing names, phones, emails, addresses or social accounts. `generateFacts` returns contacts together with customer intelligence and signals. `enhanceWithLlm` writes the verified result to the final report without adding another model call.

- [ ] **Step 5: Run focused tests**

Run the Step 2 command.

Expected: all focused tests pass.

---

### Task 3: App Shell、精简输入页与真实六阶段进度

**Files:**
- Create: `sales-intel-demo/src/components/AppShell.tsx`
- Create: `sales-intel-demo/src/components/ResearchProgress.tsx`
- Modify: `sales-intel-demo/src/app/page.tsx`
- Modify: `sales-intel-demo/tests/unit/report-ui.test.tsx`

**Interfaces:**
- `AppShell({ active, onResearch, onHistory, children })`
- `ResearchProgress({ events, targetUrl, presetLabel, productName })`

- [ ] **Step 1: Add failing UI tests**

Assert:

```ts
expect(screen.getByText("开始新的销售调研")).toBeInTheDocument();
expect(screen.getByText("补充产品信息（可选，可提高匹配准确度）")).toBeInTheDocument();
expect(screen.queryByText("模板管理")).not.toBeInTheDocument();
```

For progress, feed one event per real stage and assert six stable rows rather than one row per event message.

- [ ] **Step 2: Run the UI test and verify failure**

Run:

```powershell
pnpm test -- tests/unit/report-ui.test.tsx
```

- [ ] **Step 3: Implement the shell and input page**

Replace the utility header/hero composition with the approved layout:

- fixed 236px left navigation;
- title and subtitle;
- two required target fields and one required product field;
- collapsed optional product section;
- report deliverables and filling advice;
- latest reports rendered only when real history exists;
- keep the existing `onSubmit`, `profile`, URL normalization and API request.

- [ ] **Step 4: Implement progress aggregation**

Map repeated stream events to:

```ts
const STAGES = [
  ["site", "验证目标网址"],
  ["collect", "采集官网与外部公开信息"],
  ["facts", "提取客户事实"],
  ["opportunity", "分析产品匹配与机会"],
  ["conversation", "生成首次沟通方案"],
  ["validate", "校验事实与最低交付标准"],
] as const;
```

Each stage appears exactly once and derives `waiting / active / completed / failed` from the newest event and progress. Warnings render below the list.

- [ ] **Step 5: Run focused UI tests**

Expected: UI tests pass.

---

### Task 4: 一体化报告与动态联系方式

**Files:**
- Rewrite: `sales-intel-demo/src/components/ReportDetailPage.tsx`
- Create: `sales-intel-demo/src/components/ContactSection.tsx`
- Modify: `sales-intel-demo/src/components/TabMatchingOpportunity.tsx`
- Modify: `sales-intel-demo/src/components/TabConversation.tsx`
- Modify: `sales-intel-demo/tests/unit/report-ui.test.tsx`

**Interfaces:**
- `ContactSection({ vm, onViewSource })`
- Report section IDs: `verdict`, `contacts`, `profile`, `matching`, `opportunities`, `conversation`, `next-step`, `evidence`

- [ ] **Step 1: Add failing report rendering tests**

Render `ReportDetailPage` and assert:

```ts
expect(screen.getByText("一体化销售调研报告")).toBeInTheDocument();
expect(screen.getByText("是否值得联系")).toBeInTheDocument();
expect(screen.getByText("联系方式与地址")).toBeInTheDocument();
expect(screen.getByText("电话与邮箱暂未从可靠公开信息中获取")).toBeInTheDocument();
expect(screen.queryByText("跟进状态")).not.toBeInTheDocument();
expect(screen.queryByText("继续调研任务")).not.toBeInTheDocument();
```

Add a contact fixture and assert its verified email appears with a source action.

- [ ] **Step 2: Run the UI test and verify failure**

Run:

```powershell
pnpm test -- tests/unit/report-ui.test.tsx
```

- [ ] **Step 3: Rewrite the report frame**

Implement:

- left main navigation supplied by `AppShell`;
- sticky report directory;
- report identity header;
- first-screen verdict, four compact indicators, maximum three signals, priority opportunity, contact/next-step panel;
- continuous profile, matching/opportunity, conversation, next-step and evidence sections;
- evidence section uses `<details>` and keeps `TabEvidence` plus the source drawer;
- JSON export remains functional.

- [ ] **Step 4: Implement dynamic contacts**

Group verified `vm.contacts.channels` by kind. Render:

- website/contact page/online channels first;
- phone and email only when present, otherwise one compact missing-data notice;
- deduplicated addresses only;
- public contacts only when present;
- recommended contact role separately with “建议角色，并非已找到的真实联系人”.

- [ ] **Step 5: Remove unapproved CRM behavior**

Delete the interactive “继续调研任务” checkbox block from `TabMatchingOpportunity` and “跟进状态” tracker from `TabConversation`. Keep all report analysis, questions, scripts, next steps and evidence content.

- [ ] **Step 6: Run focused UI tests**

Expected: tests pass.

---

### Task 5: Notion 视觉系统、响应式和全量验证

**Files:**
- Rewrite: `sales-intel-demo/src/app/globals.css`
- Modify: `sales-intel-demo/tests/unit/report-ui.test.tsx`
- Modify: `sales-intel-demo/tests/e2e/research.spec.ts` if selectors changed

**Interfaces:**
- Existing semantic class names remain stable for components and tests.

- [ ] **Step 1: Implement the visual tokens**

Use:

```css
:root {
  --background: #fbfbfa;
  --surface: #ffffff;
  --text: #202124;
  --muted: #6b7280;
  --line: #e6e7e9;
  --accent: #2563eb;
  --success: #168447;
  --warning: #c77700;
}
```

Match the approved 1536px layouts with restrained borders, 6–10px radii, no gradients, minimal shadows and readable 14–16px body text.

- [ ] **Step 2: Add responsive behavior**

- under 1180px: report summary changes from two columns to one;
- under 900px: report directory becomes horizontal and sticky;
- under 720px: app navigation becomes top navigation, input fields stack, tables scroll horizontally;
- printing hides navigation/actions and expands report details.

- [ ] **Step 3: Run unit, type, lint and build checks**

Run:

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 4: Run browser verification**

Run the app and use Playwright to verify:

- input page at 1536×1024 and 390×844;
- six-stage progress;
- a saved report with all six sections;
- missing contact values collapse correctly;
- verified contact values open the evidence drawer;
- history opens the same report without losing fields.

- [ ] **Step 5: Inspect screenshots and correct visual regressions**

Compare against `C:\Users\Administrator\Desktop\UI设计图\01.png`, `02.png`, and `03.png`. Do not copy sample data; compare only layout, spacing, hierarchy and state presentation.
