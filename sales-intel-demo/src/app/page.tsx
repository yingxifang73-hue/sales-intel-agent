"use client";

import { useState } from "react";
import { reportModules, type ReportModule } from "@/lib/report-presentation";
import type { Battlecard, Preset } from "@/lib/types";

const presets: Array<[Preset, string]> = [
  ["general", "通用"],
  ["ecommerce", "电商"],
  ["foreign_trade", "外贸"],
  ["ai", "AI"],
  ["manufacturing", "制造业"],
];

export default function Home() {
  const [targetUrl, setTargetUrl] = useState("https://example.com");
  const [preset, setPreset] = useState<Preset>("general");
  const [productName, setProductName] = useState("你的产品");
  const [report, setReport] = useState<Battlecard>();
  const [activeModule, setActiveModule] = useState<ReportModule>("overview");
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
            valueProposition: `用户提供的产品信息：${productName}。不推断未提供的功能、参数或效果。`,
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
      setActiveModule("overview");
    } catch {
      setError("请求未完成，请检查本地服务后重试。");
    } finally {
      setLoading(false);
    }
  }

  function startNewResearch() {
    setReport(undefined);
    setError("");
    setActiveModule("overview");
  }

  const activeTitle = reportModules.find((module) => module.id === activeModule)?.title ?? "调研总览";

  return (
    <main className="dashboard-shell">
      <aside className="sidebar" aria-label="报告导航">
        <div className="brand-mark" aria-label="售前情报">
          <span>售</span>
        </div>
        <div className="side-divider" />
        <nav className="module-nav">
          {reportModules.map((module) => (
            <button
              className={`module-nav-button ${activeModule === module.id ? "is-active" : ""}`}
              key={module.id}
              onClick={() => setActiveModule(module.id)}
              type="button"
              aria-current={activeModule === module.id ? "page" : undefined}
            >
              <span className="module-nav-number">{String(reportModules.indexOf(module) + 1).padStart(2, "0")}</span>
              <span>{module.title}</span>
            </button>
          ))}
        </nav>
        <p className="sidebar-note">联系客户前，把公开信息变成可用的沟通准备。</p>
      </aside>

      <section className="dashboard-main">
        <header className="topbar">
          <div>
            <p className="topbar-label">售前情报</p>
            <p className="topbar-context">{report ? activeTitle : "客户调研"}</p>
          </div>
          {report && (
            <button className="secondary-button" type="button" onClick={startNewResearch}>
              开始新调研
            </button>
          )}
        </header>

        {!report && <IntroPanel />}

        <form onSubmit={submit} className="research-composer">
          <div className="composer-heading">
            <p className="section-label">开始调研</p>
            <h1>{report ? "换一个客户继续准备" : "给下一通电话，准备有依据的开场"}</h1>
          </div>
          <label className="form-field form-field-wide">
            <span>目标公司官网</span>
            <input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="https://公司官网" required />
          </label>
          <label className="form-field">
            <span>行业预设</span>
            <select value={preset} onChange={(event) => setPreset(event.target.value as Preset)}>
              {presets.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>你的产品</span>
            <input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="例如：冰箱生产线设备" required />
          </label>
          <button className="primary-button" disabled={loading}>{loading ? "正在调研…" : "生成客户调研报告"}</button>
        </form>

        {error && <p className="error-message" role="alert">{error}</p>}

        {report && (
          <ReportWorkspace
            report={report}
            activeModule={activeModule}
            onNavigate={setActiveModule}
            presetLabel={presets.find(([key]) => key === preset)?.[1] ?? "通用"}
            productName={productName}
          />
        )}
      </section>
    </main>
  );
}

function IntroPanel() {
  return (
    <section className="intro-panel">
      <p className="section-label">Pre-call research</p>
      <h2>先了解客户，再开始沟通。</h2>
      <p>输入客户官网、选择行业预设并填写你的产品。报告会整理公司信息、业务判断、潜在痛点和首次沟通建议，并保留公开来源。</p>
      <div className="intro-steps" aria-label="调研流程">
        <span>公开页面采集</span><span>证据整理</span><span>销售准备</span>
      </div>
    </section>
  );
}

function ReportWorkspace({ report, activeModule, onNavigate, presetLabel, productName }: {
  report: Battlecard;
  activeModule: ReportModule;
  onNavigate: (module: ReportModule) => void;
  presetLabel: string;
  productName: string;
}) {
  const hostname = getHostname(report.sources[0]?.url);

  if (activeModule === "overview") {
    return <Overview report={report} hostname={hostname} onNavigate={onNavigate} presetLabel={presetLabel} productName={productName} />;
  }

  const reportModule = reportModules.find((item) => item.id === activeModule)!;
  return (
    <section className="detail-workspace" aria-labelledby="detail-title">
      <div className="detail-heading">
        <div>
          <p className="section-label">{reportModule.description}</p>
          <h2 id="detail-title">{reportModule.title}</h2>
        </div>
        <button className="back-button" type="button" onClick={() => onNavigate("overview")}>返回总览</button>
      </div>
      {activeModule === "company" && <CompanyDetail report={report} />}
      {activeModule === "analysis" && <AnalysisDetail report={report} />}
      {activeModule === "strategy" && <StrategyDetail report={report} />}
      {activeModule === "sources" && <SourcesDetail report={report} />}
    </section>
  );
}

function Overview({ report, hostname, onNavigate, presetLabel, productName }: {
  report: Battlecard;
  hostname: string;
  onNavigate: (module: ReportModule) => void;
  presetLabel: string;
  productName: string;
}) {
  const firstSignal = report.companyOverview.recentUpdates[0]?.text ?? report.signals[0]?.text ?? "本次未提取到可单独展示的近期动态。";
  return (
    <section className="report-overview" aria-labelledby="report-overview-title">
      <div className="report-heading">
        <div>
          <p className="section-label">客户调研报告</p>
          <h2 id="report-overview-title">{hostname}</h2>
        </div>
        <div className="report-context">
          <span>行业：{presetLabel}</span>
          <span>产品：{productName}</span>
        </div>
      </div>

      <div className="overview-grid">
        <article className="overview-card overview-card-main">
          <p className="card-label">客户概览</p>
          <p className="overview-text">{report.overview.text}</p>
          <button className="card-link" type="button" onClick={() => onNavigate("company")}>查看公司画像</button>
        </article>
        <article className="overview-card overview-card-blue">
          <p className="card-label">下一步建议</p>
          <p className="next-step-text">{report.salesStrategy.recommendedNextStep}</p>
          <button className="card-link card-link-light" type="button" onClick={() => onNavigate("strategy")}>查看销售准备</button>
        </article>
        <article className="overview-card">
          <p className="card-label">本次公开证据</p>
          <p className="metric">{report.sources.length}<span> 条</span></p>
          <p className="card-support">{report.modelStatus === "used" ? "已结合模型整理" : "按公开证据整理"}</p>
          <button className="card-link" type="button" onClick={() => onNavigate("sources")}>查看来源证据</button>
        </article>
        <article className="overview-card overview-card-signal">
          <p className="card-label">优先关注信号</p>
          <p>{firstSignal}</p>
          <button className="card-link" type="button" onClick={() => onNavigate("analysis")}>查看业务判断</button>
        </article>
      </div>

      <section className="module-card-section" aria-labelledby="module-card-title">
        <div className="section-heading-row"><h3 id="module-card-title">进入报告模块</h3><p>按销售准备顺序阅读</p></div>
        <div className="module-card-grid">
          {reportModules.filter((module) => module.id !== "overview").map((module, index) => (
            <button className="module-card" type="button" key={module.id} onClick={() => onNavigate(module.id)}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{module.title}</strong>
              <small>{module.description}</small>
            </button>
          ))}
        </div>
      </section>

      {(report.collectionNotes.length > 0 || report.warnings.length > 0) && (
        <section className="research-notes" aria-label="调研说明">
          <p className="card-label">调研说明</p>
          {report.collectionNotes.map((note) => <p key={note}>{note}</p>)}
          {report.warnings.map((warning) => <p className="warning-text" key={warning}>{warning}</p>)}
        </section>
      )}
    </section>
  );
}

function CompanyDetail({ report }: { report: Battlecard }) {
  return <div className="detail-grid detail-grid-company">
    <DetailCard title="公司介绍" text={report.companyOverview.companyIntroduction.text} />
    <DetailList title="产品和服务" items={report.companyOverview.productsAndServices.map((item) => item.text)} />
    <DetailCard title="行业与业务覆盖" text={report.companyOverview.industryAndCoverage.text} />
    <DetailList title="近期动态" items={report.companyOverview.recentUpdates.map((item) => item.text)} />
  </div>;
}

function AnalysisDetail({ report }: { report: Battlecard }) {
  return <div className="detail-stack">
    <div className="detail-grid"><DetailCard title="商业模式" text={report.companyAnalysis.businessModel.text} /><DetailCard title="产品定位" text={report.companyAnalysis.productPositioning.text} /><DetailCard title="目标客户" text={report.companyAnalysis.targetCustomers.text} /><DetailCard title="竞争观察" text={report.companyAnalysis.competitionObservation.text} /></div>
    <section className="pain-panel"><p className="card-label">业务核心潜在痛点 · 待验证</p>{report.companyAnalysis.painHypotheses.map((item, index) => <article className="pain-item" key={item.text}><span>{String(index + 1).padStart(2, "0")}</span><div><p>{item.text}</p><p><b>可能影响：</b>{item.businessImpact}</p><p><b>建议验证：</b>{item.validationQuestion}</p><small>置信度：{item.confidenceLabel}</small></div></article>)}</section>
  </div>;
}

function StrategyDetail({ report }: { report: Battlecard }) {
  return <div className="detail-stack">
    <section className="strategy-callout"><p className="card-label">电话 / 拜访切入点</p>{report.salesStrategy.entryPoints.map((item) => <p key={item.text}>{item.text}</p>)}</section>
    <div className="detail-grid"><DetailCard title="推荐理由" text={report.salesStrategy.recommendation.text} /><DetailList title="待验证的潜在需求" items={report.salesStrategy.potentialNeeds.map((item) => item.text)} /></div>
    <section className="opening-card"><p className="card-label">可直接使用的开场话术</p><p>{report.salesStrategy.opening.text}</p></section>
    <section className="question-card"><p className="card-label">第一次电话的发现型问题</p><ol>{report.salesStrategy.discoveryQuestions.map((item) => <li key={item.question}><strong>{item.question}</strong><span>{item.purpose}</span></li>)}</ol></section>
    <section className="boundary-card"><p><b>建议下一步：</b>{report.salesStrategy.recommendedNextStep}</p><p><b>沟通边界：</b>{report.salesStrategy.avoid.join("；")}</p></section>
  </div>;
}

function SourcesDetail({ report }: { report: Battlecard }) {
  return <section className="source-list">
    {report.sources.map((source, index) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer"><span>{String(index + 1).padStart(2, "0")}</span><div><small>{source.sourceType === "official" ? "官网" : "公开网页 / 新闻"}</small><strong>{source.title}</strong><em>{source.url}</em></div></a>)}
  </section>;
}

function DetailCard({ title, text }: { title: string; text: string }) {
  return <article className="detail-card"><p className="card-label">{title}</p><p>{text}</p></article>;
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return <article className="detail-card"><p className="card-label">{title}</p><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></article>;
}

function getHostname(url?: string) {
  if (!url) return "目标公司";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "目标公司";
  }
}
