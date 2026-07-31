"use client";

import { useState, type FormEvent, type ReactNode } from "react";

function BrandIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 3h10a2 2 0 0 1 2 2v4" />
      <path d="M5 3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
      <path d="M15 15h6M18 12v6" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function AppShell({
  active,
  onResearch,
  onHistory,
  children,
  variant = "default",
  trial,
  onRedeemCode,
}: {
  active: "research" | "history";
  onResearch: () => void;
  onHistory: () => void;
  children: ReactNode;
  variant?: "default" | "report";
  trial?: { code: string; remainingRuns: number; maxRuns: number } | null;
  onRedeemCode?: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState("");
  const redeem = async (event: FormEvent) => {
    event.preventDefault();
    if (!onRedeemCode || !code.trim()) return;
    setRedeemError("");
    setRedeeming(true);
    try {
      await onRedeemCode(code);
      setCode("");
    } catch (error) {
      setRedeemError(error instanceof Error ? error.message : "兑换失败，请稍后再试。");
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div className={`si-shell${variant === "report" ? " is-report" : ""}`}>
      <aside className="si-sidebar">
        <button type="button" className="si-brand" onClick={onResearch}>
          <BrandIcon />
          <span>销售调研 Agent</span>
        </button>
        <nav className="si-primary-nav" aria-label="主导航">
          <button
            type="button"
            className={active === "research" ? "is-active" : ""}
            onClick={onResearch}
          >
            <EditIcon />
            调研输入
          </button>
          <button
            type="button"
            className={active === "history" ? "is-active" : ""}
            onClick={onHistory}
          >
            <ClockIcon />
            历史报告
          </button>
        </nav>
        <section className="si-trial-card" aria-label="试用权益">
          {trial ? (
            <>
              <span>当前兑换码</span>
              <strong>{trial.code}</strong>
              <p>剩余 <b>{trial.remainingRuns}</b> / {trial.maxRuns} 次免费调研</p>
              {trial.remainingRuns === 0 && <small>免费次数已用完，请联系我们购买。</small>}
            </>
          ) : onRedeemCode ? (
            <form onSubmit={redeem}>
              <span>试用兑换码</span>
              <p>每个兑换码可完成 2 次调研</p>
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="输入兑换码" autoCapitalize="characters" />
              <button type="submit" disabled={redeeming || !code.trim()}>{redeeming ? "兑换中…" : "开始试用"}</button>
              {redeemError && <small role="alert">{redeemError}</small>}
            </form>
          ) : null}
        </section>
      </aside>
      <div className="si-main">{children}</div>
    </div>
  );
}
