import { describe, expect, it } from "vitest";
import {
  buildModelEvidence,
  buildSynthesisEvidence,
  buildSafeProductMatch,
  isCompleteResearchStatement,
  sanitizeVerifiedSignal,
} from "@/lib/llm";
import type { ResearchInput, Source } from "@/lib/types";

const input: ResearchInput = {
  targetUrl: "https://example.com",
  preset: "ecommerce",
  sellerProfile: {
    productName: "乳制品无菌包装材料",
    valueProposition: "帮助乳制品企业提升包装安全与灌装交付稳定性",
    targetCustomer: "乳制品生产企业",
    customerProblems: ["包装安全", "交付稳定性"],
    proofPoints: [],
    callToAction: "安排需求沟通",
  },
};

function source(index: number, title: string, url: string, content: string, sourceType: Source["sourceType"]): Source {
  return {
    id: `source-${index}`,
    url,
    canonicalUrl: url,
    title,
    content: content.repeat(20),
    sourceType,
    fetchedAt: "2026-07-28T00:00:00.000Z",
    contentHash: String(index).repeat(64).slice(0, 64),
  };
}

describe("LLM evidence selection", () => {
  it("balances representative正文 across company, product, business-signal and news categories", () => {
    const sources = [
      source(1, "公司介绍", "https://example.com/about", "公司简介 企业发展 品牌定位", "official"),
      source(2, "集团概况", "https://example.com/company", "集团公司 业务概况 市场", "official"),
      source(3, "产品中心", "https://example.com/products", "产品 服务 解决方案", "official"),
      source(4, "无菌包装产品", "https://example.com/solutions", "产品 解决方案 包装", "official"),
      source(5, "合作案例", "https://media.example.net/case", "客户 合作 伙伴 案例", "other"),
      source(6, "招聘扩产", "https://jobs.example.net/recruit", "招聘 扩产 投资 客户", "other"),
      source(7, "最新新闻", "https://news.example.net/story-1", "新闻 发布 新品 动态", "news"),
      source(8, "行业报道", "https://news.example.net/story-2", "新闻 公告 市场 动态", "news"),
    ];

    const evidence = buildModelEvidence(sources, input);
    const categories = new Set(evidence.flatMap((item) => item.categories));

    expect(evidence).toHaveLength(8);
    expect(categories.size).toBeGreaterThanOrEqual(4);
    expect(categories.has("company")).toBe(true);
    expect(categories.has("product")).toBe(true);
    expect(categories.has("business_signal")).toBe(true);
    expect(categories.has("news")).toBe(true);
    expect(evidence.every((item) => item.excerpt.length <= 1_000)).toBe(true);
  });

  it("在来源充足时保留更宽的公司、联系方式与规模正文，避免官网详情被挤出证据包", () => {
    const sources = [
      source(1, "公司介绍", "https://example.com/about", "公司简介 成立于2020年 主营业务", "official"),
      source(2, "联系方式", "https://example.com/contact", "商务邮箱 sales@example.com 联系电话 021-12345678", "official"),
      source(3, "工厂产能", "https://example.com/factory", "生产基地 工厂 产能 研发 团队", "official"),
      source(4, "产品中心", "https://example.com/products", "产品 服务 解决方案", "official"),
      source(5, "客户案例", "https://example.com/case", "客户 合作伙伴 案例", "other"),
      source(6, "新闻", "https://news.example.net/story", "新闻 发布 扩产 动态", "news"),
      source(7, "渠道", "https://example.com/channel", "渠道 门店 市场", "official"),
      source(8, "招聘", "https://example.com/jobs", "招聘 团队 业务发展", "official"),
      source(9, "技术", "https://example.com/technology", "技术 研发 专利", "official"),
      source(10, "投资者关系", "https://example.com/investor", "融资 规模 增长", "official"),
    ];

    const evidence = buildModelEvidence(sources, input);

    expect(evidence.length).toBeGreaterThanOrEqual(10);
    expect(evidence.some((item) => item.url.endsWith("/contact"))).toBe(true);
    expect(evidence.some((item) => item.url.endsWith("/factory"))).toBe(true);
    expect(evidence.every((item) => item.excerpt.length <= 1_600)).toBe(true);
  });

  it("后续分析使用覆盖全部来源的压缩档案，避免重复传输网页长正文", () => {
    const sources = Array.from({ length: 20 }, (_, index) => source(
      index + 1,
      index % 2 === 0 ? `公司与产品资料 ${index + 1}` : `新闻与业务动态 ${index + 1}`,
      `https://example.com/page-${index + 1}`,
      `第${index + 1}个来源包含公司、产品、客户、市场和近期业务动态。`,
      index % 3 === 0 ? "news" : "official",
    ));

    const archive = buildSynthesisEvidence(sources, input, new Set(["source-2", "source-19"]));

    expect(archive).toHaveLength(20);
    expect(new Set(archive.map((item) => item.id)).size).toBe(20);
    expect(archive.every((item) => item.excerpt.length <= 520)).toBe(true);
    expect(archive.find((item) => item.id === "source-2")?.excerpt.length).toBeGreaterThan(0);
    expect(JSON.stringify(archive).length).toBeLessThan(JSON.stringify(buildModelEvidence(sources, input)).length);
  });

  it("removes unsupported demand conclusions from otherwise factual signals", () => {
    const evidenceSource = source(
      9,
      "数智化加工厂",
      "https://example.com/factory",
      "公司引入利乐与 PET 无菌冷灌装生产线，年产乳制品约30万吨。",
      "official",
    );
    const cleaned = sanitizeVerifiedSignal(
      {
        value: "公司引入利乐与 PET 无菌冷灌装生产线，年产乳制品约30万吨，存在无菌包装材料采购需求。",
        status: "verified",
        sourceIds: [evidenceSource.id],
      },
      [evidenceSource],
    );

    expect(cleaned?.status).toBe("verified");
    expect(cleaned?.value).toContain("无菌冷灌装生产线");
    expect(cleaned?.value).not.toContain("采购需求");
  });

  it("does not claim equipment compatibility when the seller supplied no proof", () => {
    const field = buildSafeProductMatch(input);

    expect(field.status).toBe("inferred");
    expect(field.value).toContain("需");
    expect(field.value).not.toContain("可适配利乐产线");
    expect(field.value).not.toContain("已通过");
  });

  it("rejects visibly truncated Chinese research statements", () => {
    expect(isCompleteResearchStatement("认养一头牛以")).toBe(false);
    expect(isCompleteResearchStatement("认养一头牛客服回应称，公司与")).toBe(false);
    expect(
      isCompleteResearchStatement("认养一头牛定位中高端乳制品市场，强调自有牧场与差异化奶源。"),
    ).toBe(true);
  });
});
