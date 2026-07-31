"use client";

import type { ReportViewModel } from "@/lib/report-viewmodel";
import { ExpandableText } from "./ExpandableText";
import { PreservedStructuredText } from "./PreservedStructuredText";

type DisplayField = { value: string; status: string };

function hasContent(field: DisplayField) {
  return Boolean(field.value?.trim()) && field.status !== "insufficient";
}

function InfoCard({ label, field }: { label: string; field: DisplayField }) {
  if (!hasContent(field)) return null;
  return <section className="intel-card"><h3>{label}</h3><ExpandableText text={field.value} maxLength={260} /></section>;
}

export function TabBusinessProducts({ vm }: { vm: ReportViewModel }) {
  const intel = vm.intelligence;
  const profileCards = [
    ["目标客户与市场", intel.targetCustomersAndMarket],
    ["商业模式", intel.businessModel],
    ["产品定位", intel.productPositioning],
    ["规模与能力", intel.scaleAndCapability],
  ] as const;
  return <div className="module-stack">
    {hasContent(intel.companyOverview) && <section className="intel-card si-company-overview"><h3>公司概况</h3><ExpandableText text={intel.companyOverview.value} maxLength={420} /></section>}
    {profileCards.some(([, field]) => hasContent(field)) && <div className="intel-grid">{profileCards.map(([label, field]) => <InfoCard key={label} label={label} field={field} />)}</div>}
    {intel.productsAndServices.length > 0 && <section className="intel-card"><h3>产品与服务</h3><ul className="si-product-list">{intel.productsAndServices.filter((item) => item.value?.trim() && item.status !== "insufficient").map((item, index) => <li key={`${item.value}-${index}`}><PreservedStructuredText text={item.value} /></li>)}</ul></section>}
    {intel.recentUpdates.length > 0 && <section className="timeline-section"><h3>近期动态</h3><div className="intel-timeline">{intel.recentUpdates.filter((item) => item.value?.trim() && item.status !== "insufficient").map((update, index) => <article key={`${update.value}-${index}`}><div className="timeline-dot" /><ExpandableText text={update.value} maxLength={280} /></article>)}</div></section>}
  </div>;
}
