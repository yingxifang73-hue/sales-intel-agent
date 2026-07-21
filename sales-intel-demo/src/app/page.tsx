"use client";

import { useState } from "react";
import type { Battlecard, Preset } from "@/lib/types";

const presets: Array<[Preset, string]> = [["general", "通用"], ["ecommerce", "电商"], ["foreign_trade", "外贸"], ["ai", "AI"], ["manufacturing", "制造业"]];

export default function Home() {
  const [targetUrl, setTargetUrl] = useState("https://example.com");
  const [preset, setPreset] = useState<Preset>("general");
  const [productName, setProductName] = useState("你的产品");
  const [report, setReport] = useState<Battlecard>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUrl,
          preset,
          sellerProfile: {
            productName,
            valueProposition: `${productName} 帮助销售团队将公开资料转化为可执行的客户沟通准备。`,
            targetCustomer: "需要拓展客户的销售团队",
            customerProblems: ["售前准备信息分散"],
            proofPoints: ["每条事实可追溯来源"],
            callToAction: "安排一次 20 分钟演示",
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "生成失败");
        return;
      }
      setReport(data);
    } catch {
      setError("请求未完成，请检查本地服务后重试。");
    } finally {
      setLoading(false);
    }
  }

  const hostname = report ? new URL(report.sources[0]!.url).hostname.replace(/^www\./, "") : "";
  return <main className="shell">
    <header className="masthead">
      <p className="kicker">B2B SALES / PRE-CALL RESEARCH</p>
      <h1>客户调研报告</h1>
      <p className="lede">输入客户官网，整理公司信息、业务判断与第一次电话的沟通准备。</p>
    </header>
    <form onSubmit={submit} className="intake">
      <label className="url-field">目标公司官网<input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} required /></label>
      <label>行业预设<select value={preset} onChange={(event) => setPreset(event.target.value as Preset)}>{presets.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>你的产品<input value={productName} onChange={(event) => setProductName(event.target.value)} required /></label>
      <button disabled={loading}>{loading ? "正在调研…" : "生成客户调研报告"}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {report && <article className="report">
      <section className="report-cover">
        <div><p className="kicker">PRE-CALL REPORT</p><h2>{hostname}</h2></div>
        <dl className="report-meta"><div><dt>行业预设</dt><dd>{presets.find(([key]) => key === preset)?.[1]}</dd></div><div><dt>公开来源</dt><dd>{report.sources.length} 条</dd></div><div><dt>模型建议</dt><dd>{report.modelStatus === "used" ? "已采用" : "证据版"}</dd></div></dl>
      </section>

      <ReportSection number="01" title="Company Overview" subtitle="公司概览">
        <Fact title="公司介绍" text={report.companyOverview.companyIntroduction.text} />
        <FactList title="产品和服务" items={report.companyOverview.productsAndServices.map((item) => item.text)} />
        <Fact title="行业与业务覆盖" text={report.companyOverview.industryAndCoverage.text} />
        <FactList title="近期动态" items={report.companyOverview.recentUpdates.map((item) => item.text)} />
      </ReportSection>

      <ReportSection number="02" title="Company Analysis" subtitle="公司分析">
        <div className="analysis-grid">
          <Fact title="商业模式" text={report.companyAnalysis.businessModel.text} />
          <Fact title="产品定位" text={report.companyAnalysis.productPositioning.text} />
          <Fact title="目标客户" text={report.companyAnalysis.targetCustomers.text} />
          <Fact title="竞争观察" text={report.companyAnalysis.competitionObservation.text} />
        </div>
        <div className="hypothesis"><p className="eyebrow">业务核心潜在痛点 · 待验证</p>{report.companyAnalysis.painHypotheses.map((item) => <div key={item.text}><p>{item.text}</p><p><b>可能影响：</b>{item.businessImpact}</p><p><b>建议验证：</b>{item.validationQuestion}</p></div>)}</div>
      </ReportSection>

      <ReportSection number="03" title="Sales Strategy" subtitle="销售策略">
        <div className="strategy-lead"><p className="eyebrow">电话/拜访切入点</p>{report.salesStrategy.entryPoints.map((item) => <p key={item.text}>{item.text}</p>)}</div>
        <div className="strategy-grid"><Fact title="推荐理由" text={report.salesStrategy.recommendation.text} /><FactList title="待验证的潜在需求" items={report.salesStrategy.potentialNeeds.map((item) => item.text)} /></div>
        <div className="talk-track"><p className="eyebrow">可直接使用的开场话术</p><p>{report.salesStrategy.opening.text}</p></div>
        <div className="questions"><p className="eyebrow">第一次电话的发现型问题</p><ol>{report.questions.map((item) => <li key={item.question}>{item.question}</li>)}</ol></div>
        <p className="next-step"><b>建议下一步：</b>{report.salesStrategy.recommendedNextStep}</p>
        <p className="boundary"><b>沟通边界：</b>{report.salesStrategy.avoid.join("；")}</p>
      </ReportSection>

      <ReportSection number="04" title="Sources" subtitle="来源与采集状态">
        <div className="sources">{report.sources.map((source, index) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><span>[{String(index + 1).padStart(2, "0")}]</span><span>{source.sourceType === "official" ? "官网" : "公开网页/新闻"}</span><strong>{source.title}</strong></a>)}</div>
        <div className="collection-status">{report.collectionNotes.map((note) => <p key={note}>{note}</p>)}{report.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}</div>
      </ReportSection>
    </article>}
  </main>;
}

function ReportSection({ number, title, subtitle, children }: { number: string; title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="report-section"><div className="section-index"><span>{number}</span><div><p>{title}</p><h3>{subtitle}</h3></div></div><div className="section-content">{children}</div></section>;
}

function Fact({ title, text }: { title: string; text: string }) {
  return <section className="fact"><p className="eyebrow">{title}</p><p>{text}</p></section>;
}

function FactList({ title, items }: { title: string; items: string[] }) {
  return <section className="fact"><p className="eyebrow">{title}</p>{items.map((item) => <p key={item}>{item}</p>)}</section>;
}
