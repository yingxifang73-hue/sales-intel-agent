import { describe, expect, it, vi } from "vitest";
import { dedupeSources, hashContent } from "@/lib/dedupe";
import { SourceSchema } from "@/lib/types";
import { assertPublicHttpUrl, canonicalizeUrl } from "@/lib/url-security";

const publicLookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

describe("URL 安全和去重", () => {
  it("清理追踪参数并生成稳定链接", () => {
    expect(canonicalizeUrl("HTTPS://Example.com:443/a/?utm_source=x&b=2&a=1#news")).toBe("https://example.com/a?a=1&b=2");
  });

  it("拒绝 localhost、内网和解析至内网的域名", async () => {
    await expect(assertPublicHttpUrl("http://localhost:3000", publicLookup)).rejects.toThrow("本机");
    await expect(assertPublicHttpUrl("http://192.168.1.5", publicLookup)).rejects.toThrow("私有");
    await expect(assertPublicHttpUrl("https://internal.example", async () => [{ address: "10.0.0.8", family: 4 }])).rejects.toThrow("私有");
  });

  it("只保留公开地址，并按链接和正文去重", async () => {
    await expect(assertPublicHttpUrl("https://example.com/?utm_campaign=test", publicLookup)).resolves.toBe("https://example.com/");
    const now = "2026-07-21T00:00:00.000Z";
    const result = dedupeSources([
      { url: "https://example.com/news?utm_source=x", title: "公告", content: "同一段 正文", sourceType: "official", fetchedAt: now },
      { url: "https://example.com/news", title: "重复链接", content: "另一段正文", sourceType: "official", fetchedAt: now },
      { url: "https://example.com/other", title: "重复正文", content: "同一段   正文", sourceType: "news", fetchedAt: now },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.contentHash).toBe(hashContent("同一段 正文"));
  });

  it("来源标题为空时根据链接补齐标题，并在进入报告前满足 Source Schema", () => {
    const result = dedupeSources([{
      url: "https://example.com/company/about-us",
      title: "   ",
      content: "这是目标公司的公开介绍页面，包含主营业务、产品服务和发展历程。",
      sourceType: "official",
      fetchedAt: "2026-07-30T00:00:00.000Z",
    }]);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("example.com / company / about us");
    expect(() => SourceSchema.parse(result[0])).not.toThrow();
  });

  it("单条非法来源不会拖垮同批次的其他有效来源", () => {
    const result = dedupeSources([
      {
        url: "不是合法链接",
        title: "",
        content: "无效内容",
        sourceType: "other",
        fetchedAt: "2026-07-30T00:00:00.000Z",
      },
      {
        url: "https://example.com/",
        title: "示例公司官网",
        content: "这是合法的目标公司公开资料。",
        sourceType: "official",
        fetchedAt: "2026-07-30T00:00:00.000Z",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("示例公司官网");
  });

  it("仅在公共 DNS 确认后放行本机代理改写的测试地址", async () => {
    await expect(assertPublicHttpUrl("https://www.sanyglobal.com", async () => [{ address: "198.18.0.80", family: 4 }], async () => [{ address: "104.18.18.1", family: 4 }])).resolves.toBe("https://www.sanyglobal.com/");
    await expect(assertPublicHttpUrl("https://unsafe.example", async () => [{ address: "198.18.0.80", family: 4 }], async () => [{ address: "10.0.0.8", family: 4 }])).rejects.toThrow("公共 DNS");
  });
});
