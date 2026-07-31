"use client";

import { useState, useCallback } from "react";
import type { ReportViewModel } from "@/lib/report-viewmodel";
import { ExpandableText } from "./ExpandableText";
import { PreservedStructuredText } from "./PreservedStructuredText";

type StyleMode = "default" | "shorter" | "formal" | "email";

export function TabConversation({
  vm,
  showNextStep = true,
}: {
  vm: ReportViewModel;
  showNextStep?: boolean;
}) {
  const cp = vm.conversation;
  const [style, setStyle] = useState<StyleMode>("default");
  const [copied, setCopied] = useState(false);

  const opening = (() => {
    switch (style) {
      case "shorter":
        return cp.opening30s.value.length > 120
          ? cp.opening30s.value.slice(0, 120) + "…"
          : cp.opening30s.value;
      case "formal":
        return `尊敬的负责人，您好。\n\n${cp.opening30s.value}`;
      case "email":
        return `主题：关于贵司原料供应的初步沟通\n\n您好，\n\n${cp.opening30s.value}\n\n期待您的回复。\n\n此致`;
      default:
        return cp.opening30s.value;
    }
  })();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(opening);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [opening]);

  return (
    <div className="module-stack">
      {/* ── Communication goal + recommended contact ── */}
      <div className="conversation-grid">
        <div className="conv-card">
          <h3>沟通目标</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          </div>
          <ExpandableText text={cp.communicationGoal.value} maxLength={240} />
        </div>
        <div className="conv-card">
          <h3>推荐联系对象</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          </div>
          <ExpandableText text={cp.recommendedContact.value} maxLength={200} />
        </div>
      </div>

      {/* ── Opening script — hero panel ── */}
      <div className="opening-panel">
        <span className="opening-badge">
          30 秒开场话术
        </span>
        <blockquote style={{ whiteSpace: "pre-wrap", maxWidth: 800 }}>
          <PreservedStructuredText text={opening} />
        </blockquote>
        <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`action-btn ${copied ? "active" : ""}`}
            onClick={handleCopy}
          >
            {copied ? "✓ 已复制" : "复制话术"}
          </button>
          <button
            type="button"
            className={`action-btn ${style === "shorter" ? "active" : ""}`}
            onClick={() => setStyle(style === "shorter" ? "default" : "shorter")}
          >
            更简短
          </button>
          <button
            type="button"
            className={`action-btn ${style === "formal" ? "active" : ""}`}
            onClick={() => setStyle(style === "formal" ? "default" : "formal")}
          >
            更正式
          </button>
          <button
            type="button"
            className={`action-btn ${style === "email" ? "active" : ""}`}
            onClick={() => setStyle(style === "email" ? "default" : "email")}
          >
            转成邮件
          </button>
          <button
            type="button"
            className={`action-btn ${style === "default" ? "active" : ""}`}
            onClick={() => setStyle("default")}
          >
            原文
          </button>
        </div>
      </div>

      {/* ── Value bridge ── */}
      <div className="value-bridge">
        <h3>
          价值表达
        </h3>
        <ExpandableText text={cp.valueBridge.value} maxLength={360} />
      </div>

      {/* ── Discovery questions ── */}
      {cp.discoveryQuestions.length > 0 && (
        <div className="questions-card">
          <h3>
            关键提问清单
            <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 400, marginLeft: 10 }}>
              {cp.discoveryQuestions.length} 个
            </span>
          </h3>
          <ol>
            {cp.discoveryQuestions.map((q, i) => (
              <li key={i}>
                <strong>{q.question}</strong>
                <span className="question-purpose">目的：{q.purpose}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── Objections + Proof materials ── */}
      <div className="conversation-bottom-grid">
        {cp.objectionResponses.length > 0 && (
          <div className="conv-card">
            <h3>异议与回应方向</h3>
            {cp.objectionResponses.map((r, i) => (
              <div key={i} style={{ marginBottom: 14, paddingBottom: i < cp.objectionResponses.length - 1 ? 14 : 0, borderBottom: i < cp.objectionResponses.length - 1 ? "1px solid var(--line)" : "none" }}>
                <div style={{ marginBottom: 6 }}>
                </div>
                <ExpandableText text={r.value} maxLength={200} />
              </div>
            ))}
          </div>
        )}
        {cp.proofMaterials.length > 0 && (
          <div className="conv-card">
            <h3>证明材料</h3>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              {cp.proofMaterials.map((m, i) => (
                <li key={i} style={{ fontSize: 16, lineHeight: 1.8, marginBottom: 4 }}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Next step + Avoid topics ── */}
      {showNextStep && <div className="conversation-bottom-grid">
        <div className="conv-card">
          <h3>建议下一步</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          </div>
          <ExpandableText text={cp.nextStep.value} maxLength={280} />
        </div>
        {cp.avoidTopics.length > 0 && (
          <div className="conv-card conv-avoid">
            <h3>沟通禁区</h3>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              {cp.avoidTopics.map((a, i) => (
                <li key={i} style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 4 }}>{a}</li>
              ))}
            </ul>
          </div>
        )}
      </div>}
    </div>
  );
}
