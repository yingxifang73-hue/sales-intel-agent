import { describe, expect, it } from "vitest";
import { coreFactGapQueries, identifyCompany, isRelevantCompanySearchResult } from "@/lib/web-search";

describe("dynamic company identity for external research", () => {
  it("derives the current company's Chinese brand from its homepage instead of reusing a domain token", () => {
    const identity = identifyCompany(
      "www.ryytn.com",
      "Title: 认养一头牛｜只为用户养好牛\n\n# 认养一头牛\n",
    );

    expect(identity.primaryName).toBe("认养一头牛");
    expect(identity.aliases).toContain("认养一头牛");
  });

  it("keeps only external results that name the target company", () => {
    const identity = identifyCompany("www.ryytn.com", "Title: 认养一头牛｜只为用户养好牛");

    expect(isRelevantCompanySearchResult({
      title: "认养一头牛发布乳业供应链新动态",
      link: "https://example-news.com/story/1",
      snippet: "认养一头牛公布了新的公开信息。",
    }, identity, "www.ryytn.com")).toBe(true);

    expect(isRelevantCompanySearchResult({
      title: "某通信企业发布新品",
      link: "https://example-news.com/story/2",
      snippet: "与目标企业无关的行业新闻。",
    }, identity, "www.ryytn.com")).toBe(false);
  });

  it("uses an official heading when the document title is generic", () => {
    const identity = identifyCompany("www.ryytn.com", "Title: 官方网站\n\n# 认养一头牛");
    expect(identity.aliases).toContain("认养一头牛");
  });

  it("issues focused queries when company, scale and customer facts are absent", () => {
    const identity = identifyCompany("www.ryytn.com", "Title: 认养一头牛");
    const queries = coreFactGapQueries(identity, []);
    expect(queries.map((item) => item.query).join(" ")).toContain("公司简介");
    expect(queries.map((item) => item.query).join(" ")).toContain("产能");
    expect(queries.map((item) => item.query).join(" ")).toContain("客户");
  });
});
