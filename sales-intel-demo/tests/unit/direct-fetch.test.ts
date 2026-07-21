import { describe, expect, it, vi } from "vitest";
import { DirectFetchCrawler } from "@/lib/research";
import type { ResearchInput } from "@/lib/types";

const input: ResearchInput = { targetUrl: "https://93.184.216.34", preset: "manufacturing", sellerProfile: { productName: "测试产品", valueProposition: "用于测试公开网页采集", targetCustomer: "测试团队", customerProblems: ["信息分散"], proofPoints: ["保留来源"], callToAction: "演示" } };

describe("公开官网直连采集", () => {
  it("将普通 HTML 转为可读的官网来源", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(`<html><head><title>示例制造</title></head><body><h1>产品与服务</h1><p>${"公开官网正文 ".repeat(40)}</p></body></html>`, { status: 200, headers: { "content-type": "text/html" } }));
    const result = await new DirectFetchCrawler().collect(input);
    expect(result.sources[0]?.title).toBe("示例制造");
    expect(result.sources[0]?.content).toContain("公开官网正文");
    fetchMock.mockRestore();
  });
});
