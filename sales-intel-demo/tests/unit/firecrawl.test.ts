import { describe, expect, it, vi } from "vitest";
import { FirecrawlClient, selectPages } from "@/lib/firecrawl";

describe("FirecrawlClient", () => {
  it("uses v2 map and scrape endpoints and preserves source metadata", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ links: ["https://example.com/about"] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          markdown: "# Example\n\nThis public company page describes products, services, customers, market activity, and recent updates. It contains enough detailed text to be a useful evidence source for a sales research report.",
          metadata: { title: "Example About", sourceURL: "https://example.com/about" },
        },
      }), { status: 200 }));
    const client = new FirecrawlClient("test-key", { baseUrl: "https://firecrawl.test/v2", fetchImpl });

    await expect(client.map("https://example.com")).resolves.toEqual(["https://example.com/about"]);
    await expect(client.scrape("https://example.com/about")).resolves.toMatchObject({
      url: "https://example.com/about",
      title: "Example About",
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://firecrawl.test/v2/map");
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://firecrawl.test/v2/scrape");
  });

  it("keeps provider error details so quota failures are diagnosable", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "Insufficient credits to perform this request." }), { status: 402 }),
    );
    const client = new FirecrawlClient("test-key", { fetchImpl });

    await expect(client.map("https://example.com")).rejects.toThrow(/Insufficient credits/i);
  });

  it("keeps a bounded generic route when a CMS does not expose semantic URLs", () => {
    const pages = selectPages("https://example.com", ["https://example.com/page/brand-story"]);

    expect(pages).toContainEqual({ url: "https://example.com/page/brand-story", category: "company" });
  });

  it("always retains an official contact page for contact extraction", () => {
    const pages = selectPages("https://example.com", [
      "https://example.com/about",
      "https://example.com/contact-us",
      "https://example.com/news/launch",
    ]);

    expect(pages).toContainEqual({ url: "https://example.com/contact-us", category: "business_signal" });
  });
});
