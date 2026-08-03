import { describe, expect, it } from "vitest";
import { chatCompletionsUrl, readOpenAiSseContent, resolveModelBundleSourceId } from "@/lib/llm";

describe("chatCompletionsUrl", () => {
  it("adds the OpenAI version segment when the provider host is unversioned", () => {
    expect(chatCompletionsUrl("https://api.fastrouteai.com")).toBe(
      "https://api.fastrouteai.com/v1/chat/completions",
    );
  });

  it("does not duplicate the version segment for an already versioned provider URL", () => {
    expect(chatCompletionsUrl("https://api.fastrouteai.com/v1/")).toBe(
      "https://api.fastrouteai.com/v1/chat/completions",
    );
  });
});

describe("resolveModelBundleSourceId", () => {
  const sourceIds = ["source-a", "source-b", "source-c"];

  it("keeps an exact source id", () => {
    expect(resolveModelBundleSourceId("source-b", sourceIds)).toBe("source-b");
  });

  it("maps the model's compact source identifiers back to their batch ids", () => {
    expect(resolveModelBundleSourceId("S1", sourceIds)).toBe("source-a");
    expect(resolveModelBundleSourceId("s3", sourceIds)).toBe("source-c");
  });

  it("rejects an identifier outside the current source batch", () => {
    expect(resolveModelBundleSourceId("S4", sourceIds)).toBeUndefined();
  });
});

describe("readOpenAiSseContent", () => {
  it("accepts a regular JSON completion from an OpenAI-compatible gateway", async () => {
    const response = new Response(JSON.stringify({
      choices: [{ message: { content: '{"bundles":[]}' } }],
    }), { headers: { "content-type": "application/json" } });

    await expect(readOpenAiSseContent(response)).resolves.toBe('{"bundles":[]}');
  });

  it("continues to accept an SSE completion", async () => {
    const response = new Response(
      'data: {"choices":[{"delta":{"content":"{\\"ok\\":true}"}}]}\n\ndata: [DONE]\n',
      { headers: { "content-type": "text/event-stream" } },
    );

    await expect(readOpenAiSseContent(response)).resolves.toBe('{"ok":true}');
  });
});
