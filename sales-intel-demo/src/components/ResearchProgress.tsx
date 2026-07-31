"use client";

type ProgressEvent = { kind: string; stage?: string; progress?: number; message?: string };

const patienceText = "预计需要 10–15 分钟，期间可切换页面，调研将在后台继续。";

function hostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function ResearchProgress({ events, targetUrl, presetLabel, productName }: {
  events: readonly ProgressEvent[]; targetUrl: string; presetLabel: string; productName: string;
}) {
  const latest = events.filter((event) => event.kind === "stage").at(-1);
  const failed = events.find((event) => event.kind === "failed");
  const completed = events.some((event) => event.kind === "completed");
  const progress = completed ? 100 : Math.max(5, latest?.progress ?? 5);
  const description = failed?.message ?? latest?.message ?? "\u6b63\u5728\u9a8c\u8bc1\u76ee\u6807\u516c\u53f8\u5b98\u7f51\u4e0e\u516c\u5f00\u4fe1\u606f\u3002";
  const title = failed ? "\u8c03\u7814\u5c1a\u672a\u5b8c\u6210" : "\u6b63\u5728\u751f\u6210\u9500\u552e\u8c03\u7814\u62a5\u544a";
  return <div className="si-progress-page si-progress-reference">
    <header className="si-progress-reference-heading"><h1>{"\u6b63\u5728\u751f\u6210\u9500\u552e\u8c03\u7814\u62a5\u544a"}</h1><p className="si-progress-patience">{patienceText}</p></header>
    <div className="si-progress-reference-meta"><div><span>{"\u76ee\u6807\u516c\u53f8\u5b98\u7f51"}</span><strong>{hostname(targetUrl)}</strong></div><div><span>{"\u884c\u4e1a"}</span><strong>{presetLabel}</strong></div><div><span>{"\u6838\u5fc3\u4ea7\u54c1"}</span><strong>{productName}</strong></div></div>
    <section className={`si-progress-reference-card si-reference-progress-${failed ? "error" : "active"}`} aria-live="polite" style={{ "--progress": `${progress}%` } as React.CSSProperties}>
      <span className="si-progress-spinner" data-testid="progress-spinner" aria-hidden="true" />
      <h2>{title}</h2>
      {!failed && <p className="si-progress-patience si-progress-patience-card"><span aria-hidden="true">✦</span>{patienceText}</p>}
      <div className="si-progress-reference-rule" />
      <strong>{"\u5f53\u524d\u8fdb\u5ea6"}&nbsp; {progress}%</strong>
      <span className="si-progress-reference-message">•&nbsp; {description}</span>
    </section>
  </div>;
}
