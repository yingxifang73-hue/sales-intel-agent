import { describe, expect, it } from "vitest";
import { reportModules } from "@/lib/report-presentation";

describe("reportModules", () => {
  it("keeps a Chinese dashboard overview followed by four report modules", () => {
    expect(reportModules.map((module) => module.id)).toEqual([
      "overview",
      "company",
      "analysis",
      "strategy",
      "sources",
    ]);
    expect(reportModules.every((module) => /[\u4e00-\u9fff]/.test(module.title))).toBe(true);
  });
});
