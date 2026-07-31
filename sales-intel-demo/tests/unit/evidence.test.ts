import { describe, expect, it } from "vitest";
import {
  cleanSourceText,
  decodeHtmlEntities,
  isReadableChinese,
  sanitizeChineseOutput,
  sanitizeReportText,
  selectEvidenceExcerpts,
} from "@/lib/evidence";
import type { Source } from "@/lib/types";

const source: Source = {
  id: "source-01",
  url: "https://example.com/about",
  canonicalUrl: "https://example.com/about",
  title: "Example Company About",
  content: "Menu Search Cookie Consent Privacy Policy. Example Company is a global manufacturer of refrigeration equipment serving customers in more than 30 countries. In 2026, the company announced a new energy-efficient production line. Copyright 2026.",
  sourceType: "official",
  fetchedAt: "2026-07-21T00:00:00.000Z",
  contentHash: "a".repeat(64),
};

describe("证据清洗与质量检测", () => {
  it("解码命名、十进制和十六进制 HTML 实体", () => {
    expect(decodeHtmlEntities("World&#39;s &quot;No.1&quot; &#x4E2D;&#25991; &amp; more")).toBe("World's \"No.1\" 中文 & more");
  });

  it("清除 Markdown、导航和 Cookie 噪声", () => {
    const cleaned = cleanSourceText("[Products](https://example.com/p)\nCookie Consent\n## Company\nWe build refrigeration equipment.\nCopyright 2026");
    expect(cleaned).toContain("Products");
    expect(cleaned).toContain("We build refrigeration equipment");
    expect(cleaned).not.toMatch(/Cookie Consent|Copyright/);
  });

  it("选择高信息密度公司和近期动态片段", () => {
    const excerpt = selectEvidenceExcerpts(source, ["manufacturer", "customers", "announced", "2026"]);
    expect(excerpt).toContain("global manufacturer");
    expect(excerpt).toContain("announced a new energy-efficient production line");
    expect(excerpt).not.toContain("Cookie Consent");
  });

  it("拒绝英文主导、HTML 实体和乱码，接受中文研究结果", () => {
    expect(isReadableChinese("美的是全球家电制造企业，产品覆盖冰箱、空调和洗衣设备。")).toBe(true);
    expect(isReadableChinese("Midea is the world's largest producer of major appliances.")).toBe(false);
    expect(isReadableChinese("美的被评为 World&#39;s No.1 品牌")).toBe(false);
    expect(isReadableChinese("美的品牌Ã¢â‚¬â„¢近期动态")).toBe(false);
  });

  it("移除正文中的内部来源编号", () => {
    expect(sanitizeChineseOutput("关注到贵司的公开动态（来源：d8b9375416ac4f01），想进一步了解。"))
      .toBe("关注到贵司的公开动态，想进一步了解。");
  });

  it("丢弃反爬脚本和长 Base64 载荷，同时保留正常公司事实", () => {
    const payload = "oHhbljdwUXHioCxlmhBkYzc4pn89Fan7KdwWYpzd78QK0urkNOWRYH1iuJ3Qru6HkBWNWh6fisv2Y3cqcDeFexewECfFK87uM4Y".repeat(3);
    const raw = [
      "小鹏汽车是一家专注智能电动汽车研发与制造的科技企业。",
      "{\"1\":\"var arg1='5d4473171c07296d118a3c85d3e54a3e148818eb4cb9d05698';",
      "\"}",
      payload,
      "公司持续建设智能驾驶与智能座舱能力。",
    ].join("\n");

    const cleaned = cleanSourceText(raw);

    expect(cleaned).toContain("小鹏汽车是一家专注智能电动汽车研发与制造的科技企业。");
    expect(cleaned).toContain("公司持续建设智能驾驶与智能座舱能力。");
    expect(cleaned).not.toMatch(/var arg1|5d447317|oHhbljdwUXH/);
  });

  it("删除公开资料模板前缀，但完全保留后续事实文字", () => {
    const fact = "小鹏汽车成立于2014年，专注智能电动汽车研发与制造。";
    expect(sanitizeReportText(`目标公司公开资料显示：${fact}`)).toBe(fact);
    expect(sanitizeReportText(`公开资料显示${fact}`)).toBe(fact);
    expect(sanitizeReportText(`根据目标公司的公开资料显示，${fact}`)).toBe(fact);
  });

  it("删除只有引号和标点符号的无意义行", () => {
    expect(sanitizeReportText("“；")).toBe("");
    expect(sanitizeReportText("”；\n公司提供智能座舱解决方案。")).toBe("公司提供智能座舱解决方案。");
  });

  it("拒绝夹带脚本载荷的伪中文内容", () => {
    const payload = "AbCdEf0123456789+/".repeat(20);
    expect(isReadableChinese(`公司概况 ${payload}`)).toBe(false);
  });
});
