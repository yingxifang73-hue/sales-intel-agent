import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/AppShell";
import { ResearchProgress } from "@/components/ResearchProgress";
import { ReportDetailPage } from "@/components/ReportDetailPage";
import { TabBusinessProducts } from "@/components/TabBusinessProducts";
import { normalizeSalesReport } from "@/lib/report-viewmodel";
import type { PipelineEvent, SalesReport } from "@/lib/types";
import { inferredField, insufficientField, verifiedField } from "@/lib/types";

function buildReport(): SalesReport {
  const sourceId = "source-ui-redesign";
  return {
    reportMeta: {
      companyName: "目标公司",
      targetUrl: "https://example.com",
      sellerProductName: "无菌包装材料",
      collectedAt: "2026-07-28T00:00:00.000Z",
      status: "达标",
    },
    salesVerdict: {
      contactSuggestion: inferredField("建议进行探索性接触，但尚未确认采购需求", [sourceId]),
      recommendationReason: inferredField("公开信息显示客户存在包装升级相关信号", [sourceId]),
      keyCustomerSignals: [{ value: "客户持续运营多个线上渠道", status: "verified", sourceIds: [sourceId] }],
      priorityContactRole: inferredField("供应链或采购负责人", [sourceId]),
      priorityOpportunity: inferredField("待验证：包装材料升级机会", [sourceId]),
      recommendedNextStep: verifiedField("通过官网联系页面发起首次沟通", []),
    },
    contactIntelligence: { channels: [], publicContacts: [] },
    customerIntelligence: {
      companyOverview: verifiedField("目标公司经营乳制品业务。", [sourceId]),
      productsAndServices: [{ value: "乳制品", status: "verified", sourceIds: [sourceId] }],
      targetCustomersAndMarket: verifiedField("面向家庭消费市场。", [sourceId]),
      businessModel: verifiedField("线上线下渠道销售。", [sourceId]),
      productPositioning: verifiedField("品质乳制品。", [sourceId]),
      scaleAndCapability: insufficientField("未获取规模信息"),
      recentUpdates: [],
      informationGaps: ["采购负责人"],
    },
    opportunityAnalysis: {
      opportunities: [{
        signal: { value: "客户持续运营多个线上渠道", status: "verified", sourceIds: [sourceId] },
        painPoint: { value: "待验证：包装材料升级机会", status: "inferred", sourceIds: [sourceId] },
        businessImpact: inferredField("可能影响产品体验", []),
        productMatch: inferredField("需核对包材规格", []),
        validationQuestion: inferredField("当前包材规格是什么？", []),
        confidence: inferredField("中 — 有公开信号但缺少采购信息", []),
      }],
      currentSolutionOrCompetition: insufficientField("未获取"),
      overallConfidence: inferredField("中", []),
    },
    conversationPlan: {
      recommendedContact: inferredField("供应链或采购负责人", [sourceId]),
      communicationGoal: inferredField("验证包装升级需求", []),
      opening30s: inferredField("您好，我们希望了解贵司当前包材升级方向。", [sourceId]),
      valueBridge: inferredField("从公开业务信号切入包材价值。", [sourceId]),
      discoveryQuestions: [{ question: "当前包材规格是什么？", purpose: "确认技术要求" }],
      objectionResponses: [],
      proofMaterials: [],
      nextStep: verifiedField("通过官网联系页面发起首次沟通", []),
      avoidTopics: ["不能假设已经存在采购需求"],
    },
    coverage: { directChannels: 1, firecrawlChannels: 1, gapFilledCategories: [] },
    metrics: { durationMs: 1000, sourceCount: 1, officialSourceCount: 1, crawlerCalls: 1, llmCalls: 3 },
    sources: [{
      id: sourceId,
      url: "https://example.com",
      canonicalUrl: "https://example.com",
      title: "目标公司官网",
      content: "目标公司经营乳制品业务，并持续运营多个线上渠道。",
      sourceType: "official",
      fetchedAt: "2026-07-28T00:00:00.000Z",
      contentHash: "a".repeat(64),
    }],
    collectionNotes: [],
    mainReferenceLinks: [{ title: "目标公司官网", url: "https://example.com" }],
  };
}

describe("精简 UI", () => {
  it("AppShell 只展示调研输入和历史报告", () => {
    render(
      <AppShell active="research" onResearch={vi.fn()} onHistory={vi.fn()}>
        <div>内容</div>
      </AppShell>,
    );
    expect(screen.getByText("调研输入")).toBeInTheDocument();
    expect(screen.getByText("历史报告")).toBeInTheDocument();
    expect(screen.queryByText("模板管理")).not.toBeInTheDocument();
  });

  it("研究进度按设计图显示为单一的居中生成状态卡", () => {
    const events: PipelineEvent[] = [
      { kind: "started", runId: "run-1" },
      { kind: "stage", stage: "site", progress: 5, message: "正在验证目标网址" },
      { kind: "stage", stage: "collect", progress: 25, message: "正在采集官网" },
      { kind: "stage", stage: "collect", progress: 35, message: "已补充外部来源" },
    ];
    render(<ResearchProgress events={events} targetUrl="https://example.com" presetLabel="电商" productName="无菌包装材料" />);
    expect(screen.queryByTestId("research-stage")).not.toBeInTheDocument();
    expect(screen.getAllByText("正在生成销售调研报告")).toHaveLength(2);
    expect(screen.getByText(/当前进度/)).toBeInTheDocument();
    expect(screen.getByText(/35%/)).toBeInTheDocument();
    expect(screen.getByTestId("progress-spinner")).toBeInTheDocument();
    expect(screen.queryByTestId("progress-border")).not.toBeInTheDocument();
    expect(screen.getAllByText("预计需要 10–15 分钟，期间可切换页面，调研将在后台继续。")).toHaveLength(2);
    expect(screen.queryByText("系统正在采集并校验公开信息，完成后将自动打开完整报告。")).not.toBeInTheDocument();
    expect(screen.queryByText("正在整理销售调研报告")).not.toBeInTheDocument();
  });

  it("研究进度显示后台持久化的真实报告模块", () => {
    const events: PipelineEvent[] = [
      { kind: "stage", stage: "product_fit", progress: 82, message: "正在整理产品匹配。" },
    ];

    render(<ResearchProgress events={events} targetUrl="https://example.com" presetLabel="电商" productName="无菌包装材料" />);

    expect(screen.getByText(/正在整理产品匹配/)).toBeInTheDocument();
    expect(screen.getByText(/82%/)).toBeInTheDocument();
  });

  it("报告为一体化结构，缺失联系方式只提示一次且没有 CRM 控件", () => {
    const report = buildReport();
    render(
      <ReportDetailPage
        vm={normalizeSalesReport(report, { preset: "电商" })}
        onResearch={vi.fn()}
        onHistory={vi.fn()}
      />,
    );
    expect(screen.getByText("目标公司销售调研报告")).toBeInTheDocument();
    expect(screen.getByText("是否值得联系")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "联系方式与地址" })).toBeInTheDocument();
    expect(screen.getAllByText(/暂未从公开信息中获取可靠电话或邮箱/)).toHaveLength(1);
    expect(screen.queryByText("跟进状态")).not.toBeInTheDocument();
    expect(screen.queryByText("继续调研任务")).not.toBeInTheDocument();
    expect(screen.queryByText("查看证据")).not.toBeInTheDocument();
    expect(screen.queryByText("证据抽屉")).not.toBeInTheDocument();
    expect(screen.queryByText("报告状态")).not.toBeInTheDocument();
    expect(screen.queryByText("AI 判断")).not.toBeInTheDocument();
    expect(screen.queryByText("AI 机会判断")).not.toBeInTheDocument();
    expect(screen.queryByText("详情")).not.toBeInTheDocument();
    expect(screen.queryByText("真实公开联系人")).not.toBeInTheDocument();
    expect(screen.queryByText("信息说明")).not.toBeInTheDocument();
    expect(screen.queryByText("备注")).not.toBeInTheDocument();
    expect(screen.queryByText("匹配机会数")).not.toBeInTheDocument();
    expect(screen.queryByText("数据完整度")).not.toBeInTheDocument();
    expect(screen.queryByText(/待验证/)).not.toBeInTheDocument();
    expect(screen.queryByText(/待确认/)).not.toBeInTheDocument();
    expect(screen.queryByText(/当前没有足够的公开客户信号/)).not.toBeInTheDocument();
    expect(screen.getByText("匹配判断")).toBeInTheDocument();
    expect(screen.getByText("首次沟通重点")).toBeInTheDocument();
  });

  it("超长产品信息只增加展示分段且保留原文全部字符", () => {
    const report = buildReport();
    const longText = "官方分期服务包含多种车型，多种首付方案，多种期限选择，多种年费率方案。全国建议零售价保持公开，具体金融政策以官方页面为准。不同车型可以选择零首付、低首付或分期还款，具体适用范围、期限和费率均以官方公开页面为准。";
    report.customerIntelligence.productsAndServices = [
      { value: longText, status: "verified", sourceIds: [report.sources[0]!.id] },
    ];

    const { container } = render(<TabBusinessProducts vm={normalizeSalesReport(report, { preset: "电商" })} />);

    const structuredText = [...container.querySelectorAll("[data-testid='preserved-structured-text']")]
      .find((element) => element.textContent === longText);
    expect(structuredText).toBeDefined();
    if (!structuredText) throw new Error("未找到无损分段后的长文本容器");
    expect(structuredText.querySelectorAll("[data-testid='preserved-text-segment']").length).toBeGreaterThan(1);
    expect(structuredText.textContent).toBe(longText);
  });

  it("所有超长报告字段都使用无损结构化展示而不只处理产品字段", () => {
    const report = buildReport();
    const longReason = "第一项公开业务信号说明客户持续经营多个渠道。第二项公开业务信号说明客户持续建设数字化能力。第三项内容用于解释为什么值得进行探索性联系，但不会改变原来的文字、标点和顺序。第四项继续补充完整的业务背景，使这一段达到需要结构化展示的长度。";
    report.salesVerdict.recommendationReason = inferredField(longReason, [report.sources[0]!.id]);

    const { container } = render(
      <ReportDetailPage
        vm={normalizeSalesReport(report, { preset: "电商" })}
        onResearch={vi.fn()}
        onHistory={vi.fn()}
      />,
    );

    const structuredText = [...container.querySelectorAll("[data-testid='preserved-structured-text']")]
      .find((element) => element.textContent === longReason);
    expect(structuredText).toBeDefined();
    expect(structuredText?.querySelectorAll("[data-testid='preserved-text-segment']").length).toBeGreaterThan(1);
    expect(structuredText?.textContent).toBe(longReason);
  });

  it("联系方式卡片顶部对齐且没有固定最小高度", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const contactGridRules = [...css.matchAll(/\.si-contact-reference-content\.si-contact-reference-simple\s*\{([^}]*)\}/g)]
      .map((match) => match[1] ?? "");
    const contactCardRules = [...css.matchAll(/\.si-contact-reference-simple \.si-contact-reference-card\s*\{([^}]*)\}/g)]
      .map((match) => match[1] ?? "");

    expect(contactGridRules.some((rule) => /align-items:\s*start/.test(rule))).toBe(true);
    expect(contactGridRules.some((rule) => /grid-auto-rows:\s*max-content/.test(rule))).toBe(true);
    expect(contactCardRules.some((rule) => /min-height:\s*180px/.test(rule))).toBe(false);
  });

  it("目录会展开目标章节，再将章节标题滚动到可见位置", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    const report = buildReport();
    render(<ReportDetailPage vm={normalizeSalesReport(report, { preset: "电商" })} onResearch={vi.fn()} onHistory={vi.fn()} />);

    const profile = document.getElementById("profile") as HTMLDetailsElement;
    expect(profile.open).toBe(false);
    fireEvent.click(screen.getAllByRole("link", { name: "2. 客户画像" }).at(-1)!);

    expect(profile.open).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("导出报告按钮展开章节并设置 PDF 样式", () => {
    // The export loads html2canvas + jspdf from CDN (not available in jsdom).
    // We verify the synchronous side effects: chapters expand, CSS class is applied,
    // document title is updated.
    const report = buildReport();
    render(<ReportDetailPage vm={normalizeSalesReport(report, { preset: "电商" })} onResearch={vi.fn()} onHistory={vi.fn()} />);

    const chapterEl = document.getElementById("profile") as HTMLDetailsElement;
    chapterEl.open = false;

    fireEvent.click(screen.getAllByRole("button", { name: "导出报告" }).at(-1)!);

    // Chapters are expanded.
    expect(chapterEl.open).toBe(true);
    // PDF class is applied for consistent rendering.
    expect(document.documentElement.classList.contains("si-pdf-exporting")).toBe(true);
    // Title includes company name for the PDF file name.
    expect(document.title).toContain("目标公司-销售调研报告");
  });

  it("PDF 打印样式包含 A4、中文字体、颜色和分页规则", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4/u);
    expect(css).toMatch(/\.si-pdf-exporting[\s\S]*font-family:\s*[^;]*(?:PingFang SC|Microsoft YaHei|Noto Sans CJK SC)/u);
    expect(css).toMatch(/print-color-adjust:\s*exact/u);
    expect(css).toMatch(/break-inside:\s*avoid/u);
  });
});
