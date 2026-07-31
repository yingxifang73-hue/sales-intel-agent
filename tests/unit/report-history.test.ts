import { describe, expect, it } from "vitest";
import { compactSourcesForHistory } from "@/lib/report-history";
import type { Source } from "@/lib/types";

describe("compactSourcesForHistory", () => {
  it("keeps source metadata but does not persist fetched page正文", () => {
    const source: Source = {
      id: "1234567890abcdef",
      url: "https://example.com/about",
      canonicalUrl: "https://example.com/about",
      title: "公司介绍",
      content: "这是一段很长的网页正文，历史记录不需要保存。",
      sourceType: "official",
      fetchedAt: "2026-07-28T00:00:00.000Z",
      contentHash: "a".repeat(64),
    };

    const [saved] = compactSourcesForHistory([source]);

    expect(saved?.url).toBe(source.url);
    expect(saved?.title).toBe(source.title);
    expect(saved?.content).not.toContain("很长的网页正文");
    expect(source.content).toContain("很长的网页正文");
  });
});
