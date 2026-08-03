"use client";

import { useCallback, useEffect, useState } from "react";
import type { Preset, ResearchInput, SalesReport } from "@/lib/types";
import { DEFAULT_CALL_TO_ACTION } from "@/lib/types";
import { normalizeSalesReport, type ReportViewModel } from "@/lib/report-viewmodel";
import { parseHistory, saveReportHistory, REPORT_HISTORY_STORAGE_KEY, type SavedResearchReport } from "@/lib/report-history";
import { normalizeTargetUrl } from "@/lib/url-normalize";
import { validateSellerProductName } from "@/lib/input-validation";
import { ReportDetailPage } from "@/components/ReportDetailPage";
import { AppShell } from "@/components/AppShell";
import { ResearchProgress } from "@/components/ResearchProgress";
import { IndustrySelector } from "@/components/IndustrySelector";

/* ─── icon set ─── */
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const s = size;
  if (name === "search") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
  if (name === "briefcase") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
  if (name === "bolt") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
  if (name === "target") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>;
  if (name === "bulb") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15 8v1"/><path d="M12 8v1"/><path d="M9 8v1"/><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7Z"/></svg>;
  if (name === "chat") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5Z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/></svg>;
  if (name === "file") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>;
  if (name === "clock") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
  if (name === "globe") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
  if (name === "chevron") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>;
  if (name === "external-link") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>;
  if (name === "shield") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
  return null;
}

/* ─── presets ─── */
const presets: [Preset, string][] = [
  ["general", "通用"],
  ["ecommerce", "电商"],
  ["foreign_trade", "外贸"],
  ["ai", "AI / 科技"],
  ["manufacturing", "制造业"],
];

/* ─── types ─── */
type PipelineEventLocal =
  | { kind: "stage"; stage: string; progress: number; message: string }
  | { kind: "warning"; message: string }
  | { kind: "completed"; report: SalesReport; metrics: unknown }
  | { kind: "failed"; code: string; message: string };

type TrialDisplay = { code: string; remainingRuns: number; completedRuns: number; maxRuns: number };
const TRIAL_TOKEN_STORAGE_KEY = "sales-intel-trial-token";
const ACTIVE_RESEARCH_STORAGE_KEY = "sales-intel-active-research-v3";

type ActiveResearchMeta = {
  id: string;
  targetUrl: string;
  presetLabel: string;
  productName: string;
  ts?: number;
};

type ResearchJobResponse = {
  researchId: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  currentStage?: string;
  message?: string;
  input?: ResearchInput;
  report?: SalesReport;
  error?: string;
};

function loadHistoryFromBrowser(): SavedResearchReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(REPORT_HISTORY_STORAGE_KEY);
    const parsed = parseHistory(raw);
    if (parsed.length > 0) return parsed;
    if (!raw) return [];

    const legacy = JSON.parse(raw);
    if (!Array.isArray(legacy)) return [];
    const converted: SavedResearchReport[] = [];
    for (const item of legacy) {
      if (!item || typeof item !== "object" || !("id" in item) || !("report" in item)) continue;
      const entry = item as Record<string, unknown>;
      const report = entry.report;
      if (!report || typeof report !== "object" || !("reportMeta" in report) || !("salesVerdict" in report)) continue;
      const meta = (report as Record<string, unknown>).reportMeta as Record<string, unknown> | undefined;
      converted.push({
        id: String(entry.id ?? ""),
        createdAt: meta?.collectedAt ? String(meta.collectedAt) : new Date().toISOString(),
        targetUrl: String(entry.targetUrl ?? ""),
        preset: (entry.preset ?? "general") as Preset,
        customIndustry: typeof entry.customIndustry === "string" ? entry.customIndustry : undefined,
        productName: String(entry.sellerProductName ?? ""),
        sellerProfile: entry.sellerProfile as SavedResearchReport["sellerProfile"],
        report: report as SalesReport,
        metrics: entry.metrics as SavedResearchReport["metrics"],
      });
    }
    if (converted.length > 0) {
      localStorage.setItem(REPORT_HISTORY_STORAGE_KEY, JSON.stringify(converted));
      localStorage.removeItem("sales-intel-history");
    }
    return converted;
  } catch {
    try { localStorage.removeItem(REPORT_HISTORY_STORAGE_KEY); } catch { /* ignore */ }
    return [];
  }
}

/* ─── main page ─── */
export default function Home() {
  const [view, setView] = useState<"research" | "history" | "report">("research");
  const [targetUrl, setTargetUrl] = useState("");
  const [preset, setPreset] = useState<Preset>("general");
  const [customIndustry, setCustomIndustry] = useState("");
  const [profile, setProfile] = useState({
    productName: "",
    valueProposition: "",
    targetCustomer: "",
    customerProblems: [""],
    proofPoints: [""],
    callToAction: DEFAULT_CALL_TO_ACTION,
  });
  const [showProductForm, setShowProductForm] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState("");
  const [pipelineState, setPipelineState] = useState<{ events: PipelineEventLocal[] }>({ events: [] });
  const [history, setHistory] = useState<SavedResearchReport[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [trialToken, setTrialToken] = useState<string | null>(null);
  const [trial, setTrial] = useState<TrialDisplay | null>(null);
  const [activeResearch, setActiveResearch] = useState<ActiveResearchMeta | null>(null);

  const refreshTrialStatus = useCallback(async (accessToken: string) => {
    const response = await fetch("/api/trial/status", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const body = await response.json() as TrialDisplay & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "兑换码会话无效。");
    setTrial(body);
  }, []);

  const redeemTrialCode = useCallback(async (code: string) => {
    const response = await fetch("/api/trial/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = await response.json() as { accessToken?: string; trial?: TrialDisplay; error?: string };
    if (!response.ok || !body.accessToken || !body.trial) throw new Error(body.error ?? "兑换码不可用或已被使用。");
    localStorage.setItem(TRIAL_TOKEN_STORAGE_KEY, body.accessToken);
    setTrialToken(body.accessToken);
    setTrial(body.trial);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setHistory(loadHistoryFromBrowser()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = localStorage.getItem(TRIAL_TOKEN_STORAGE_KEY);
      if (!stored) return;
      setTrialToken(stored);
      refreshTrialStatus(stored).catch(() => {
        localStorage.removeItem(TRIAL_TOKEN_STORAGE_KEY);
        setTrialToken(null);
        setTrial(null);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshTrialStatus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(ACTIVE_RESEARCH_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as ActiveResearchMeta;
        if (parsed?.id && parsed.targetUrl && parsed.productName) {
          setActiveResearch(parsed);
          setIsRunning(true);
        }
      } catch {
        localStorage.removeItem(ACTIVE_RESEARCH_STORAGE_KEY);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!activeResearch || !trialToken) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      // Tasks saved before the GitHub Actions executor did not have a client
      // timestamp. They cannot be resumed safely, so end them explicitly
      // instead of leaving the user on a permanent loading screen.
      if (!activeResearch.ts) {
        try {
          const response = await fetch(`/api/research/${activeResearch.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${trialToken}` },
            cache: "no-store",
          });
          const body = await response.json() as { message?: string; error?: string };
          if (!cancelled) {
            setError(body.message ?? body.error ?? "旧版未执行任务已结束，请重新发起调研。");
            localStorage.removeItem(ACTIVE_RESEARCH_STORAGE_KEY);
            setActiveResearch(null);
            setPipelineState({ events: [] });
            setIsRunning(false);
          }
        } catch (error) {
          if (!cancelled) setError(error instanceof Error ? error.message : "无法结束旧版调研任务。");
        }
        return;
      }
      try {
        const response = await fetch(`/api/research/${activeResearch.id}`, {
          headers: { Authorization: `Bearer ${trialToken}` },
          cache: "no-store",
        });
        const body = await response.json() as ResearchJobResponse & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "无法读取调研进度。");
        if (cancelled) return;

        if (body.input) {
          const meta: ActiveResearchMeta = {
            id: body.researchId,
            targetUrl: body.input.targetUrl,
            presetLabel: body.input.customIndustry || presets.find(([key]) => key === body.input?.preset)?.[1] || "通用",
            productName: body.input.sellerProfile.productName,
            ts: activeResearch.ts,
          };
          setActiveResearch((previous) => (
            previous?.id === meta.id
              && previous.targetUrl === meta.targetUrl
              && previous.presetLabel === meta.presetLabel
              && previous.productName === meta.productName
              ? previous
              : meta
          ));
          localStorage.setItem(ACTIVE_RESEARCH_STORAGE_KEY, JSON.stringify(meta));
        }
        setPipelineState({ events: [{
          kind: body.status === "failed" ? "failed" : "stage",
          stage: body.currentStage,
          progress: body.progress,
            message: body.status === "failed"
              ? body.error ?? body.message ?? "调研未能完成，本次调研次数已自动退回。"
              : body.message ?? "正在准备调研。",
          ...(body.status === "failed" ? { code: "workflow_failed" } : {}),
        } as PipelineEventLocal] });

        if (body.status === "completed" && body.report && body.input) {
          const entry: SavedResearchReport = {
            id: body.researchId,
            createdAt: body.report.reportMeta.collectedAt,
            targetUrl: body.input.targetUrl,
            preset: body.input.preset,
            customIndustry: body.input.customIndustry,
            productName: body.input.sellerProfile.productName,
            sellerProfile: body.input.sellerProfile,
            report: body.report,
            metrics: body.report.metrics,
          };
          setHistory((previous) => {
            const next = [entry, ...previous.filter((item) => item.id !== entry.id)].slice(0, 24);
            try { saveReportHistory(next); } catch { /* browser storage is best-effort */ }
            return next;
          });
          localStorage.removeItem(ACTIVE_RESEARCH_STORAGE_KEY);
          setActiveResearch(null);
          setActiveReportId(entry.id);
          setIsRunning(false);
          setView("report");
          await refreshTrialStatus(trialToken).catch(() => undefined);
          return;
        }
        if (body.status === "failed") {
          setError(body.error ?? body.message ?? "调研未能完成，本次调研次数已自动退回。");
          localStorage.removeItem(ACTIVE_RESEARCH_STORAGE_KEY);
          setActiveResearch(null);
          setPipelineState({ events: [] });
          setIsRunning(false);
          return;
        }
      } catch (pollError) {
        if (!cancelled) setError(pollError instanceof Error ? pollError.message : "无法读取调研进度。");
      }
      if (!cancelled) timer = window.setTimeout(poll, 2_000);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeResearch, refreshTrialStatus, trialToken]);

  /* ── submit ── */
  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setIsRunning(true);
      setPipelineState({ events: [] });

      const url = normalizeTargetUrl(targetUrl);
      if (!/^https?:\/\//i.test(url)) {
        setError("请输入完整的官网地址（以 http:// 或 https:// 开头）。");
        setIsRunning(false);
        return;
      }

      const sellerProfile = {
        ...profile,
        customerProblems: profile.customerProblems.map((value) => value.trim()).filter(Boolean),
        proofPoints: profile.proofPoints.map((value) => value.trim()).filter(Boolean),
        valueProposition: profile.valueProposition.trim(),
        targetCustomer: profile.targetCustomer.trim(),
      };
      if (!sellerProfile.productName.trim()) {
        setError("请最少填写你的产品名称。");
        setIsRunning(false);
        return;
      }
      const productInputError = validateSellerProductName(sellerProfile.productName, url);
      if (productInputError) {
        setError(productInputError);
        setIsRunning(false);
        return;
      }
      if (!trialToken || !trial || trial.remainingRuns <= 0) {
        setError("请输入有效兑换码后开始调研；每个兑换码可完成 2 次免费调研。");
        setIsRunning(false);
        return;
      }

      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${trialToken}` },
          body: JSON.stringify({ targetUrl: url, preset, customIndustry: customIndustry.trim() || undefined, sellerProfile }),
        });
        if (!res.ok) {
          const body = await res.text();
          let msg = body;
          try { msg = JSON.parse(body).error ?? body; } catch { /* use raw */ }
          throw new Error(msg);
        }
        const body = await res.json() as ResearchJobResponse & { error?: string };
        if (!body.researchId) throw new Error(body.error ?? "调研任务创建失败。");
        const meta: ActiveResearchMeta = {
          id: body.researchId,
          targetUrl: url,
          presetLabel: customIndustry.trim() || presets.find(([key]) => key === preset)?.[1] || "通用",
          productName: sellerProfile.productName,
          ts: Date.now(),
        };
        localStorage.setItem(ACTIVE_RESEARCH_STORAGE_KEY, JSON.stringify(meta));
        setActiveResearch(meta);
        setPipelineState({ events: [{ kind: "stage", stage: "queued", progress: 2, message: "调研任务已创建，正在进入后台流程。" }] });
      } catch (err) {
        setError(err instanceof Error ? err.message : "研究过程发生未知错误。");
        setIsRunning(false);
      }
    },
    [targetUrl, preset, customIndustry, profile, trialToken, trial],
  );

  /* ── render ── */
  const entry = activeReportId ? history.find((h) => h.id === activeReportId) : undefined;
  const vm: ReportViewModel | null = entry?.report
    ? normalizeSalesReport(entry.report, { preset: entry.customIndustry ?? entry.preset })
    : null;

  return (
    <main className="landing-page">
      {view === "report" && entry && vm && (
        <ReportDetailPage
          vm={vm}
          onResearch={() => setView("research")}
          onHistory={() => setView("history")}
          trial={trial}
          onRedeemCode={redeemTrialCode}
        />
      )}

      {view === "history" && (
        <AppShell active="history" onResearch={() => setView("research")} onHistory={() => setView("history")} trial={trial} onRedeemCode={redeemTrialCode}>
          <HistoryPage
            history={history}
            onOpen={(id) => {
              setActiveReportId(id);
              setView("report");
            }}
            onBack={() => setView("research")}
          />
        </AppShell>
      )}

      {view === "research" && (
        <AppShell active="research" onResearch={() => setView("research")} onHistory={() => setView("history")} trial={trial} onRedeemCode={redeemTrialCode}>
          {isRunning ? (
            <ResearchProgress
              events={pipelineState.events}
              targetUrl={activeResearch?.targetUrl ?? targetUrl}
              presetLabel={activeResearch?.presetLabel ?? (customIndustry || presets.find(([key]) => key === preset)?.[1] || "通用")}
              productName={activeResearch?.productName ?? profile.productName}
            />
          ) : (
            <div className="si-research-page">
              <header className="si-page-heading">
                <h1>开始新的销售调研</h1>
                <p>输入目标公司官网和我方产品，AI 将基于公开信息生成可追溯的销售调研报告。</p>
              </header>
              <div className="si-research-grid">
                <form className="si-research-form" onSubmit={onSubmit}>
                  <section>
                    <h2>1. 目标客户</h2>
                    <div className="si-form-row">
                      <label>
                        <span><b>*</b> 目标公司官网</span>
                        <div className="si-input-with-icon"><Icon name="globe" size={19} /><input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://www.example.com" required /></div>
                      </label>
                      <label>
                        <span><b>*</b> 行业</span>
                        <IndustrySelector
                          preset={preset}
                          customIndustry={customIndustry}
                          onPresetChange={setPreset}
                          onCustomIndustryChange={setCustomIndustry}
                        />
                      </label>
                    </div>
                  </section>
                  <section>
                    <h2>2. 我方产品</h2>
                    <label>
                      <span><b>*</b> 我方产品名称</span>
                      <div className="si-input-with-icon"><Icon name="briefcase" size={19} /><input value={profile.productName} onChange={(e) => setProfile({ ...profile, productName: e.target.value })} placeholder="请输入产品名称" required /></div>
                    </label>
                    <button type="button" className="si-product-toggle" onClick={() => setShowProductForm((value) => !value)} aria-expanded={showProductForm}>
                      <span>{showProductForm ? "收起" : "展开"}</span>
                      <strong>补充产品信息（可选，可提高匹配准确度）</strong>
                      <small>提供产品定位、核心功能、目标客户等信息，帮助 AI 更准确判断匹配度</small>
                    </button>
                    {showProductForm && (
                      <div className="si-extra-form">
                        <label><span>价值主张</span><input value={profile.valueProposition} onChange={(e) => setProfile({ ...profile, valueProposition: e.target.value })} placeholder="产品能够为客户带来的核心价值" /></label>
                        <label><span>目标客户</span><input value={profile.targetCustomer} onChange={(e) => setProfile({ ...profile, targetCustomer: e.target.value })} placeholder="适合的行业、客户类型或规模" /></label>
                        <label><span>客户常见痛点</span><input value={profile.customerProblems[0] ?? ""} onChange={(e) => setProfile({ ...profile, customerProblems: [e.target.value, ...profile.customerProblems.slice(1)] })} placeholder="客户最常见的问题" /></label>
                        <label><span>证明材料、认证或案例</span><input value={profile.proofPoints[0] ?? ""} onChange={(e) => setProfile({ ...profile, proofPoints: [e.target.value, ...profile.proofPoints.slice(1)] })} placeholder="只填写真实持有的材料" /></label>
                        <label className="si-wide-field"><span>建议下一步</span><input value={profile.callToAction} onChange={(e) => setProfile({ ...profile, callToAction: e.target.value })} /></label>
                      </div>
                    )}
                  </section>
                  {error && <p className="error-message">{error}</p>}
                  <footer>
                    <button type="button" className="si-secondary-action" onClick={() => {
                      setTargetUrl("");
                      setPreset("general");
                      setProfile({ productName: "", valueProposition: "", targetCustomer: "", customerProblems: [""], proofPoints: [""], callToAction: DEFAULT_CALL_TO_ACTION });
                    }}>清空</button>
                    <button type="submit" className="si-primary-action">开始调研</button>
                  </footer>
                </form>
                <aside className="si-research-aside">
                  <section>
                    <h2>报告将为您生成</h2>
                    <ul>
                      {["销售决策摘要", "联系方式与地址", "客户画像", "产品匹配判断", "机会与痛点", "首次沟通方案", "下一步行动"].map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </section>
                  <section>
                    <h2>填写建议</h2>
                    <ul className="si-advice-list">
                      <li>官网越准确，研究结果越可靠</li>
                      <li>产品信息越完整，匹配判断越准确</li>
                      <li>公开事实与分析建议会分别整理</li>
                    </ul>
                  </section>
                </aside>
              </div>
              <section className="si-recent-reports">
                <h2>最近报告</h2>
                {history.length > 0 ? history.slice(0, 3).map((item) => (
                  <button key={item.id} type="button" onClick={() => { setActiveReportId(item.id); setView("report"); }}>
                    <strong>{item.report.reportMeta.companyName || getHostname(item.targetUrl)}</strong>
                    <span>{item.productName}</span>
                    <time>{item.createdAt.slice(0, 10)}</time>
                  </button>
                )) : (
                  <div className="si-empty-recent"><Icon name="file" size={26} /><span><strong>暂无最近报告</strong>完成一次调研后，报告将显示在这里</span></div>
                )}
              </section>
            </div>
          )}
        </AppShell>
      )}
    </main>
  );
}

/* ─── history page ─── */
function HistoryPage({
  history,
  onOpen,
  onBack,
}: {
  history: SavedResearchReport[];
  onOpen: (id: string) => void;
  onBack?: () => void;
}) {
  if (!history.length)
    return (
      <div className="app-content si-history-page">
        <div className="page-heading">
          <div>
            <p>历史报告</p>
            <h1>调研记录</h1>
            <span>你运行过的客户调研会自动保存在这里。</span>
          </div>
          {onBack && (
            <button type="button" className="btn-outline" onClick={onBack}>
              ← 返回首页
            </button>
          )}
        </div>
        <div className="empty-state">
          <span><Icon name="file" size={28} /></span>
          <h2>还没有任何报告</h2>
          <p>返回首页，输入目标公司官网开始第一次调研。</p>
        </div>
      </div>
    );

  return (
    <div className="app-content si-history-page">
      <div className="page-heading">
        <div>
          <p>历史报告</p>
          <h1>调研记录</h1>
          <span>共 {history.length} 份报告，点击查看详情。</span>
        </div>
        {onBack && (
          <button type="button" className="btn-outline" onClick={onBack}>
            ← 返回首页
          </button>
        )}
      </div>
      <div className="si-history-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>客户</th>
              <th>我方产品</th>
              <th>建议等级</th>
              <th>当前状态</th>
              <th>数据质量</th>
              <th>生成时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => {
              const hn = getHostname(h.targetUrl);
              const grade = deriveSimpleGrade(h.report);
              return (
                <tr key={h.id} onClick={() => onOpen(h.id)}>
                  <td><strong>{hn}</strong></td>
                  <td>{h.productName}</td>
                  <td>
                    <span
                      className={`confidence-tag confidence-${grade === "A" ? "高" : grade === "B" ? "中" : "低"}`}
                    >
                      {grade} 级
                    </span>
                  </td>
                  <td>{h.report.reportMeta.status ?? "—"}</td>
                  <td className="si-history-quality">
                    {h.metrics ? `${h.metrics.sourceCount} 来源` : "—"}
                  </td>
                  <td className="si-history-date">
                    {h.createdAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(h.id);
                      }}
                    >
                      查看
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getHostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function deriveSimpleGrade(report: SalesReport): string {
  const hasSignals = report.salesVerdict?.keyCustomerSignals?.length > 0;
  const hasOpps = report.opportunityAnalysis?.opportunities?.length > 0;
  const ciOk = report.customerIntelligence?.companyOverview?.status !== "insufficient";
  const qualityPassed = report.reportMeta.status === "达标" && report.qualityAudit?.minimumStandardMet !== false;
  const overlappingSolution = report.opportunityAnalysis?.relationshipType === "competitive"
    || report.opportunityAnalysis?.relationshipType === "self_built";
  if (overlappingSolution && !hasOpps) return "D";
  if (qualityPassed && hasSignals && hasOpps && ciOk) return "B";
  if (hasSignals || ciOk) return "C";
  return "D";
}
