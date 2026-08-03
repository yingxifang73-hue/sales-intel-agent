"use client";

import type { ReportViewModel } from "@/lib/report-viewmodel";
import { AppShell } from "./AppShell";
import { ContactSection } from "./ContactSection";
import { ExpandableText } from "./ExpandableText";
import { PreservedStructuredText } from "./PreservedStructuredText";
import { TabBusinessProducts } from "./TabBusinessProducts";
import { TabConversation } from "./TabConversation";
import { TabMatchingOpportunity } from "./TabMatchingOpportunity";

const SECTIONS = [
  ["verdict", "1. 销售结论"],
  ["contacts", "联系方式与地址"],
  ["profile", "2. 客户画像"],
  ["matching", "3. 产品匹配"],
  ["opportunities", "4. 机会与痛点"],
  ["conversation", "5. 沟通方案"],
  ["next-step", "6. 下一步"],
] as const;

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function confidenceLabel(value: string): string {
  if (/高/.test(value)) return "高";
  if (/低/.test(value)) return "低";
  return "中";
}

export function ReportDetailPage({
  vm,
  onResearch,
  onHistory,
  trial,
  onRedeemCode,
}: {
  vm: ReportViewModel;
  onResearch: () => void;
  onHistory: () => void;
  trial?: { code: string; remainingRuns: number; maxRuns: number } | null;
  onRedeemCode?: (code: string) => Promise<void>;
}) {
  const openSection = (sectionId: string) => {
    const target = document.getElementById(sectionId);
    if (!target) return;
    if (target instanceof HTMLDetailsElement) target.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const exportPdf = () => {
    const previousTitle = document.title;
    const closedChapters = [...document.querySelectorAll<HTMLDetailsElement>(".si-report-document details:not([open])")];
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      document.documentElement.classList.remove("si-pdf-exporting");
      document.title = previousTitle;
      closedChapters.forEach((chapter) => chapter.open = false);
    };

    closedChapters.forEach((chapter) => chapter.open = true);
    document.title = `${vm.companyName}-销售调研报告`;
    document.documentElement.classList.add("si-pdf-exporting");
    window.addEventListener("afterprint", cleanup, { once: true });

    // Force one layout pass so expanded chapters and print-only typography are
    // present before the browser captures its PDF preview.
    void document.body.offsetHeight;
    try {
      window.print();
    } finally {
      window.setTimeout(cleanup, 1_000);
    }
  };

  const topOpportunity = vm.opportunity.opportunities[0];
  const contactChannels = vm.contacts.channels.filter((item) => (
    item.kind === "phone" || item.kind === "email" || item.kind === "contact_page" || item.kind === "online_channel"
  ));

  return (
    <AppShell active="history" onResearch={onResearch} onHistory={onHistory} variant="report" trial={trial} onRedeemCode={onRedeemCode}>
      <div className="si-report-layout">
        <aside className="si-report-toc">
          <h2>报告目录</h2>
          <nav aria-label="报告目录">
            {SECTIONS.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className={id === "verdict" ? "is-active" : ""}
                onClick={(event) => {
                  event.preventDefault();
                  openSection(id);
                }}
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="si-report-document">
          <header className="si-report-toolbar">
            <h1>一体化销售调研报告</h1>
            <div>
              <button type="button" className="si-primary-action" onClick={exportPdf}>导出报告</button>
            </div>
          </header>

          <div className="si-report-identity">
            <div className="si-company-avatar">{vm.companyName.slice(0, 1)}</div>
            <div><span>公司名称</span><strong>{vm.companyName}</strong></div>
            <div><span>官网</span><a href={vm.targetUrl} target="_blank" rel="noopener noreferrer">{hostname(vm.targetUrl)}</a></div>
            <div><span>行业</span><strong>{vm.preset ?? "通用"}</strong></div>
            <div className="si-product-meta"><span>我方产品</span><strong>{vm.sellerProductName}</strong></div>
            <div><span>更新时间</span><strong>{vm.collectedAt.slice(0, 16).replace("T", " ")}</strong></div>
          </div>

          <section id="verdict" className="si-report-section si-verdict-section">
            {vm.reportStatus === "未达标" && (
              <div className="si-below-standard-banner">
                <div className="si-below-standard-banner-icon">!</div>
                <div className="si-below-standard-banner-body">
                  <h2>该客户与你方产品的公开信息匹配度较低</h2>
                  <p>
                    基于当前公开可获取的信息，系统未找到能直接支撑你方产品匹配的明确机会。
                    这不代表客户无法合作——可能只是公开渠道缺少技术栈、采购需求等关键信息。
                    下方已汇总所有已采集的公司背景，你可据此准备首次联系，通过沟通了解客户真实需求。
                  </p>
                  {vm.evidence.dataRisks.length > 0 && (
                    <details className="si-below-standard-details">
                      <summary>查看完整性说明（{vm.evidence.dataRisks.length} 项）</summary>
                      <ul>
                        {vm.evidence.dataRisks.slice(0, 12).map((risk, i) => (
                          <li key={i}>{risk}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            )}
            <p className="si-section-number">1</p>
            <h2>是否值得联系</h2>
            <div className="si-verdict-lead">
              <div>
                <h3>{vm.verdict.contactSuggestion.value || "当前信息不足，暂无法形成联系建议"}</h3>
                <ExpandableText text={vm.verdict.recommendationReason.value} maxLength={320} />
              </div>
            </div>

            <div className="si-metric-strip">
              <div><span>联系建议</span><strong>{vm.verdict.suggestedGrade === "D" ? "暂缓联系" : "建议联系"}</strong></div>
              <div><span>产品匹配</span><strong>{confidenceLabel(vm.opportunity.overallConfidence.value)}</strong></div>
              <div><span>机会置信度</span><strong>{confidenceLabel(topOpportunity?.confidence.value ?? vm.opportunity.overallConfidence.value)}</strong></div>
            </div>

            <h3 className="si-subheading">为什么值得联系</h3>
            <div className="si-signal-list">
              {vm.verdict.keyCustomerSignals.length > 0 ? vm.verdict.keyCustomerSignals.slice(0, 3).map((signal, index) => {
                return (
                  <div key={`${signal.value}-${index}`} className="si-signal-row">
                    <span>{index + 1}</span>
                    <p><PreservedStructuredText text={signal.value} /></p>
                  </div>
                );
              }) : null}
            </div>

            <div className="si-summary-columns">
              <div className="si-summary-panel">
                <h3>优先机会</h3>
                <dl>
                  <div><dt>机会名称</dt><dd><PreservedStructuredText text={vm.verdict.priorityOpportunity.value || "首轮沟通切入点"} /></dd></div>
                  {topOpportunity && (
                    <>
                      <div><dt>公开触发信号</dt><dd><PreservedStructuredText text={topOpportunity.signal.value} /></dd></div>
                      <div><dt>可能业务影响</dt><dd><PreservedStructuredText text={topOpportunity.businessImpact.value} /></dd></div>
                      <div><dt>我方产品关联</dt><dd><PreservedStructuredText text={topOpportunity.productMatch.value} /></dd></div>
                    </>
                  )}
                </dl>
              </div>
              <div className="si-summary-panel">
                <h3>联系谁与下一步</h3>
                <dl>
                  <div><dt>推荐联系角色</dt><dd><PreservedStructuredText text={vm.verdict.priorityContactRole.value} /></dd></div>
                  <div>
                    <dt>已获取联系入口</dt>
                    <dd>
                      {contactChannels.length > 0
                        ? contactChannels.slice(0, 3).map((channel) => channel.label).join("、")
                        : "官网及公开页面"}
                      {" · "}<a href="#contacts">查看联系方式</a>
                    </dd>
                  </div>
                  <div><dt>下一步行动</dt><dd><PreservedStructuredText text={vm.verdict.recommendedNextStep.value} /></dd></div>
                </dl>
              </div>
            </div>
          </section>

          <section id="contacts" className="si-report-section">
            <ContactSection vm={vm} />
          </section>

          <details id="profile" className="si-report-chapter">
            <summary><span>2.</span> 客户画像</summary>
            <div className="si-chapter-body"><TabBusinessProducts vm={vm} /></div>
          </details>

          <details id="matching" className="si-report-chapter">
            <summary><span>3.</span> 产品匹配</summary>
            <div className="si-chapter-body si-fit-summary">
              <div><span>匹配判断</span><strong>{topOpportunity?.productMatch.value || vm.verdict.priorityOpportunity.value || "建议从首次沟通中了解具体应用环节。"}</strong></div>
              <div><span>首次沟通重点</span><strong>{topOpportunity?.validationQuestion.value || "了解当前做法、约束条件与升级计划。"}</strong></div>
            </div>
          </details>

          <details id="opportunities" className="si-report-chapter">
            <summary><span>4.</span> 机会与痛点</summary>
            <div className="si-chapter-body"><TabMatchingOpportunity vm={vm} /></div>
          </details>

          <details id="conversation" className="si-report-chapter">
            <summary><span>5.</span> 沟通方案</summary>
            <div className="si-chapter-body"><TabConversation vm={vm} showNextStep={false} /></div>
          </details>

          <details id="next-step" className="si-report-chapter">
            <summary><span>6.</span> 下一步</summary>
            <div className="si-chapter-body">
              <div className="si-next-step-card">
                <div>
                  <h3>建议下一步行动</h3>
                  <ExpandableText text={vm.conversation.nextStep.value || vm.verdict.recommendedNextStep.value} maxLength={420} />
                </div>
              </div>
              {vm.conversation.proofMaterials.length > 0 && (
                <div className="si-proof-list">
                  <h3>需要准备的真实资料</h3>
                  <ul>{vm.conversation.proofMaterials.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              )}
            </div>
          </details>
        </article>
      </div>
    </AppShell>
  );
}
