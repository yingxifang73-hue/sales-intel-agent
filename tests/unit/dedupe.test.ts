import { describe, expect, it } from "vitest";
import { dedupeSources, type RawSource } from "@/lib/dedupe";

function raw(content: string, title = "目标公司官网"): RawSource {
  return {
    url: "https://www.example.com/",
    title,
    content,
    sourceType: "official",
    fetchedAt: "2026-07-30T00:00:00.000Z",
  };
}

describe("source deduplication", () => {
  it("keeps the richer copy when the same URL is collected more than once", () => {
    const sources = dedupeSources([
      raw("首页"),
      raw(
        "示例公司面向企业客户提供智能协作平台、知识管理工具和开放接口，帮助团队统一管理工作流程。",
        "示例公司－企业智能协作平台",
      ),
    ]);

    expect(sources).toHaveLength(1);
    expect(sources[0]?.content).toContain("智能协作平台");
    expect(sources[0]?.title).toContain("企业智能协作平台");
  });
});
