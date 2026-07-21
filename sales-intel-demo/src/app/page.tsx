"use client";

import { useState } from "react";
import type { Battlecard, Preset } from "@/lib/types";

const presets: Array<[Preset, string]> = [["general", "通用"], ["ecommerce", "电商"], ["foreign_trade", "外贸"], ["ai", "AI"], ["manufacturing", "制造业"]];

export default function Home() {
  const [targetUrl, setTargetUrl] = useState("https://example.com");
  const [preset, setPreset] = useState<Preset>("general");
  const [productName, setProductName] = useState("你的产品");
  const [value, setValue] = useState("把公开信息整理成销售前可直接使用的行动建议");
  const [card, setCard] = useState<Battlecard>();
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
            valueProposition: value,
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
      setCard(data);
    } catch {
      setError("请求未完成，请检查本地服务后重试。");
    } finally {
      setLoading(false);
    }
  }

  return <main className="shell">
    <header>
      <p className="kicker">PRE-CALL RESEARCH / V0.1</p>
      <h1>售前销售信报<br />作战卡</h1>
      <p className="lede">公开网页证据 → 销售推理 → 下一次拜访的具体动作。</p>
    </header>
    <form onSubmit={submit} className="intake">
      <label>目标公司网址<input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} required /></label>
      <label>行业预设<select value={preset} onChange={(event) => setPreset(event.target.value as Preset)}>{presets.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>你的产品<input value={productName} onChange={(event) => setProductName(event.target.value)} required /></label>
      <label className="wide">一句价值主张<input value={value} onChange={(event) => setValue(event.target.value)} required /></label>
      <button disabled={loading}>{loading ? "正在生成…" : "生成作战卡"}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    {card && <section className="card">
      <aside><b>证据链</b><span>01</span><span>02</span></aside>
      <div>
        <p className="kicker">60 SECOND OVERVIEW</p>
        <h2>{card.overview.text}</h2>
        <div className="grid">
          <Block title="观察到的信号" items={card.signals.map((item) => item.text)} />
          <Block title="业务核心潜在痛点" items={card.painHypotheses.map((item) => `${item.text} 影响：${item.businessImpact}（置信度：${item.confidenceLabel}）`)} />
          <Block title="可这样切入" items={card.productMappings.map((item) => item.expectedValue)} />
          <Block title="开场白" items={[card.talkTrack.opening.text]} />
        </div>
        <h3>销售谈话建议</h3>
        <p><b>目标：</b>{card.talkTrack.objective}</p>
        <p><b>价值表达：</b>{card.talkTrack.valueBridge}</p>
        <ol>{card.talkTrack.discoveryQuestions.map((item) => <li key={item.question}>{item.question}</li>)}</ol>
        <p><b>建议下一步：</b>{card.talkTrack.recommendedNextStep}</p>
        <p><b>避免：</b>{card.talkTrack.avoid.join("；")}</p>
        <h3>五个发现型问题</h3>
        <ol>{card.questions.map((item) => <li key={item.question}>{item.question}</li>)}</ol>
        <h3>来源</h3>
        {card.sources.map((source, index) => <a className="source" key={source.id} href={source.url} target="_blank" rel="noreferrer">[{String(index + 1).padStart(2, "0")}] {source.title}</a>)}
        <section className="collection-status" aria-label="采集状态">
          <h3>采集与生成状态</h3>
          {card.collectionNotes.map((note) => <p className="status" key={note}>{note}</p>)}
          <p className="status">{card.modelStatus === "used" ? "模型建议已采用。" : "当前建议以公开证据为基础，可在沟通中继续验证。"}</p>
        </section>
        {card.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}
      </div>
    </section>}
  </main>;
}

function Block({ title, items }: { title: string; items: string[] }) {
  return <section><h3>{title}</h3>{items.map((item) => <p key={item}>{item}</p>)}</section>;
}
