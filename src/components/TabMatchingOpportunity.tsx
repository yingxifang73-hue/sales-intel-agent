"use client";

import type { ReportViewModel } from "@/lib/report-viewmodel";
import { ExpandableText } from "./ExpandableText";
import { PreservedStructuredText } from "./PreservedStructuredText";

export function TabMatchingOpportunity({ vm }: { vm: ReportViewModel }) {
  const opportunities = vm.opportunity.opportunities.filter((item) => item.signal.value || item.painPoint.value || item.productMatch.value);
  return <div className="module-stack">
    {opportunities.length > 0 ? <section className="si-opportunity-list">
      <h3>机会分析</h3>
      {opportunities.map((item, index) => <article key={`${item.signal.value}-${index}`} className="opportunity-chain-card">
        <span className="opp-num">{index + 1}</span>
        <div className="opp-chain si-opportunity-structured">
          {item.signal.value && <div><span>公开信号</span><p><PreservedStructuredText text={item.signal.value} /></p></div>}
          {item.painPoint.value && <div><span>可能关注点</span><p><PreservedStructuredText text={item.painPoint.value} /></p></div>}
          {item.productMatch.value && <div><span>我方切入点</span><p><PreservedStructuredText text={item.productMatch.value} /></p></div>}
          {item.validationQuestion.value && <div><span>首次沟通要问</span><p><PreservedStructuredText text={item.validationQuestion.value} /></p></div>}
        </div>
      </article>)}
    </section> : null}
    {vm.conversation.valueBridge.value && vm.conversation.valueBridge.status !== "insufficient" && <section className="value-bridge"><h3>价值表达</h3><ExpandableText text={vm.conversation.valueBridge.value} maxLength={360} /></section>}
    {vm.opportunity.currentSolutionOrCompetition.value && vm.opportunity.currentSolutionOrCompetition.status !== "insufficient" && <section className="intel-card"><h3>当前方案与竞争</h3><ExpandableText text={vm.opportunity.currentSolutionOrCompetition.value} maxLength={280} /></section>}
  </div>;
}
