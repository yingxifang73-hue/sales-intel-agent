"use client";
import type { ReportViewModel } from "@/lib/report-viewmodel";
import type { ContactChannel } from "@/lib/types";
function hrefFor(channel: ContactChannel) { if (channel.url) return channel.url; if (channel.kind === "email") return `mailto:${channel.value}`; if (channel.kind === "phone") return `tel:${channel.value}`; if (channel.kind === "address") return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(channel.value)}`; }
function Row({ channel }: { channel: ContactChannel }) { const href = hrefFor(channel); return <div className="si-contact-reference-row"><div><span>{channel.label}</span><strong>{channel.value}</strong></div>{href && <a href={href} target="_blank" rel="noopener noreferrer" className="si-row-action">打开</a>}</div>; }
export function ContactSection({ vm }: { vm: ReportViewModel }) {
  const channels = vm.contacts.channels;
  const entrances = channels.filter((channel) => ["website", "contact_page", "online_channel"].includes(channel.kind));
  const direct = channels.filter((channel) => channel.kind === "phone" || channel.kind === "email");
  const addresses = channels.filter((channel) => channel.kind === "address").filter((channel, index, list) => list.findIndex((item) => item.value === channel.value) === index);
  const role = vm.verdict.priorityContactRole.value || vm.conversation.recommendedContact.value || "供应链 / 采购负责人";
  return <div className="si-contact-reference"><header><h2>联系方式与地址</h2><p>只展示可从公开来源核验的信息；未获得的信息不会被推测或虚构。</p></header><div className="si-contact-reference-content si-contact-reference-simple"><section className="si-contact-reference-card"><h3>优先联系入口</h3>{entrances.length ? entrances.map((channel) => <Row key={`${channel.kind}-${channel.value}`} channel={channel} />) : <div className="si-contact-reference-empty">暂未获取官网联系页或官方线上渠道。</div>}</section><section className="si-contact-reference-card"><h3>电话与邮箱</h3>{direct.length ? direct.map((channel) => <Row key={`${channel.kind}-${channel.value}`} channel={channel} />) : <div className="si-contact-reference-empty">暂未从公开信息中获取可靠电话或邮箱。</div>}</section><section className="si-contact-reference-card"><h3>线下地址</h3>{addresses.length ? addresses.map((channel) => <Row key={`${channel.kind}-${channel.value}`} channel={channel} />) : <div className="si-contact-reference-empty">暂未获取可核验的线下地址。</div>}</section><section className="si-contact-reference-card"><h3>建议优先联系</h3><p className="si-role-note">建议从该角色切入，需在首次沟通中确认其真实职责。</p><div className="si-recommended-role"><strong>{role}</strong></div></section></div></div>;
}
