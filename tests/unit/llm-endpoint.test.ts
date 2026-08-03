import { describe, expect, it } from "vitest";
import { chatCompletionsUrl } from "@/lib/llm";

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
