import { describe, expect, it, vi } from "vitest";
import { dedupeSources, hashContent } from "@/lib/dedupe";
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
});
