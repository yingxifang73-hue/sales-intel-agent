import { describe, expect, it } from "vitest";
import { inferCompanyName } from "@/lib/research";
import type { Source } from "@/lib/types";

function source(title: string, url: string): Source {
  return {
    id: "1234567890abcdef",
    url,
    canonicalUrl: url,
    title,
    content: "公司公开正文",
    sourceType: "official",
    fetchedAt: "2026-07-28T00:00:00.000Z",
    contentHash: "a".repeat(64),
  };
}

describe("inferCompanyName", () => {
  it("uses the repeated official brand rather than the domain", () => {
    const sources = [
      source("关于我们|企业介绍|品牌故事|价值观-认养一头牛", "https://www.ryytn.com/aboutus/index.jhtml"),
      source("产品中心|纯牛奶|奶粉|酸奶-认养一头牛", "https://www.ryytn.com/productcenter/index.jhtml"),
      source("认养一头牛|只为用户养好牛- Adopt A Cow", "https://www.ryytn.com/"),
    ];

    expect(inferCompanyName("https://www.ryytn.com/", sources)).toBe("认养一头牛");
  });
});
