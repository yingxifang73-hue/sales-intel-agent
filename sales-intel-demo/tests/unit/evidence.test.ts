import { describe, expect, it } from "vitest";
import { cleanSourceText, decodeHtmlEntities, isReadableChinese, sanitizeChineseOutput, selectEvidenceExcerpts } from "@/lib/evidence";
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
    expect(isReadableChinese("美的是全球家电制造企业，产品覆盖冰箱、空调和洗衣设备。")) .toBe(true);
    expect(isReadableChinese("Midea is the world's largest producer of major appliances.")) .toBe(false);
    expect(isReadableChinese("美的被评为 World&#39;s No.1 品牌")) .toBe(false);
    expect(isReadableChinese("美的品牌Ã¢â‚¬â„¢近期动态")) .toBe(false);
  });

  it("移除正文中的内部来源编号", () => {
    expect(sanitizeChineseOutput("关注到贵司的公开动态（来源：d8b9375416ac4f01），想进一步了解。"))
      .toBe("关注到贵司的公开动态，想进一步了解。");
  });
});
