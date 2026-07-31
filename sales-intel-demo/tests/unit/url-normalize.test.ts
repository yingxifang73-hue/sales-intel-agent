import { describe, expect, it } from "vitest";
import { normalizeTargetUrl } from "@/lib/url-normalize";

describe("normalizeTargetUrl", () => {
  it("repairs an accidentally duplicated identical company URL", () => {
    expect(
      normalizeTargetUrl("https://www.ryytn.com/https://www.ryytn.com/"),
    ).toBe("https://www.ryytn.com/");
  });

  it("does not rewrite an ordinary company URL", () => {
    expect(normalizeTargetUrl("https://another-company.example/about")).toBe(
      "https://another-company.example/about",
    );
  });
});
